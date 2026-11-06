import { useSyncExternalStore } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  Board,
  CleanupPolicy,
  FeedSlot,
  GalleryEntry,
  GenerationBatch,
  GenerationDraft,
  GenerationTask,
} from "../domain/types";
import { combinationById, combinations } from "../models";
import { initialDraft } from "../models/shared";
import { commit, readRecords, native, type RecordChange } from "./native";
import { cleanGallery } from "./cleanup";
import { storeParameterAssets, parameterAssetIds } from "./parameterAssets";
import type { Parameters } from "../domain/types";

export interface Preferences {
  id: "preferences";
  theme: "system" | "light" | "dark";
  providers: Record<string, { endpoint?: string; deployment?: string }>;
  cleanup: Record<"generated" | "imported", CleanupPolicy>;
  desktop?: { background: boolean; launchAtLogin: boolean; zoom: number };
  upscale?: { concurrency: number; gpuIndex: number | null };
  mcp?: { port: number; autoStart: boolean };
  outputs?: { directory?: string; generationAuto?: boolean; upscaleAuto?: boolean };
}
export interface ApplicationState {
  ready: boolean;
  gallery: GalleryEntry[];
  boards: Board[];
  tasks: GenerationTask[];
  batches: GenerationBatch[];
  feed: FeedSlot[];
  draft: GenerationDraft;
  preferences: Preferences;
}
let state: ApplicationState = {
  ready: false,
  gallery: [],
  boards: [],
  tasks: [],
  batches: [],
  feed: [],
  draft: initialDraft(combinations[0]),
  preferences: {
    id: "preferences",
    theme: "system",
    providers: {},
    cleanup: { generated: { enabled: false, capacity: 200 }, imported: { enabled: false, capacity: 200 } },
  },
};
const listeners = new Set<() => void>();
export const getState = () => state;
export function updateState(next: Partial<ApplicationState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}
export function useApplication() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, getState);
}
let loading: Promise<void> | undefined;
export function loadApplication(): Promise<void> {
  return (loading ??= (async () => {
    const [gallery, boards, tasks, batches, feed, drafts, preferences] = await Promise.all([
      native<{ entries: GalleryEntry[]; total: number }>("gallery_query", { query: {}, limit: 80, offset: 0 }),
      readRecords<Board>("boards"),
      readRecords<GenerationTask>("tasks"),
      readRecords<GenerationBatch>("batches"),
      readRecords<FeedSlot>("feed"),
      readRecords<GenerationDraft>("draft"),
      readRecords<Preferences>("preferences"),
    ]);
    const draft = drafts[0] ?? state.draft;
    await native("gallery_backfill_provenance", {
      entries: tasks.flatMap((task) => {
        const combination = combinationById(task.draft.combinationId);
        return task.results.flatMap((result) =>
          result.assetId
            ? [
                {
                  id: result.assetId,
                  provenance: {
                    kind: "generation",
                    model: combination.model,
                    provider: combination.provider,
                    taskId: task.id,
                  },
                },
              ]
            : [],
        );
      }),
    });
    const related = await native<GalleryEntry[]>("gallery_entries", { ids: relatedAssetIds(tasks, draft, feed) });
    const galleryEntries = [
      ...new Map([...gallery.entries, ...related].map((entry) => [entry.asset.id, entry])).values(),
    ];
    const knownResults = new Map(
      tasks.flatMap((task) =>
        task.results.flatMap((result) => (result.assetId ? [[result.assetId, task] as const] : [])),
      ),
    );
    const backfilled = galleryEntries.map((entry) => {
      const task = knownResults.get(entry.asset.id);
      if (!task || entry.provenance?.model || entry.provenance?.kind === "upscale") return entry;
      const combination = combinationById(task.draft.combinationId);
      return {
        ...entry,
        provenance: {
          kind: "generation" as const,
          model: combination.model,
          provider: combination.provider,
          taskId: task.id,
        },
      };
    });
    combinationById(draft.combinationId);
    const createdAt = new Map(tasks.map((task) => [task.id, task.createdAt]));
    feed.sort(
      (a, b) => (createdAt.get(b.taskId) ?? 0) - (createdAt.get(a.taskId) ?? 0) || a.resultIndex - b.resultIndex,
    );
    updateState({
      gallery: backfilled,
      boards,
      tasks,
      batches,
      feed,
      draft,
      preferences: preferences[0] ?? state.preferences,
      ready: true,
    });
  })());
}

let draftWrites = Promise.resolve();
export function saveDraft(draft: GenerationDraft) {
  updateState({ draft });
  draftWrites = draftWrites
    .catch(() => {})
    .then(async () => {
      const normalized = { ...draft, parameters: (await storeParameterAssets(draft.parameters)) as Parameters };
      await commit([{ collection: "draft", id: "current", value: normalized }]);
      if (state.draft === draft) updateState({ draft: normalized });
      const cached = new Set(state.gallery.map((entry) => entry.asset.id));
      const missing = relatedAssetIds([], normalized).filter((id) => !cached.has(id));
      if (missing.length) {
        const entries = await native<GalleryEntry[]>("gallery_entries", { ids: missing });
        if (entries.length)
          updateState({
            gallery: [...new Map([...state.gallery, ...entries].map((entry) => [entry.asset.id, entry])).values()],
          });
      }
    });
  return draftWrites;
}
export async function savePreferences(preferences: Preferences) {
  await commit([{ collection: "preferences", id: "preferences", value: preferences }]);
  updateState({ preferences });
  void emit("preferences-changed", { source: getCurrentWindow().label }).catch(() => {});
  await cleanGallery();
}
let taskWrites: Promise<unknown> = Promise.resolve();
/** Serialize task transitions so cancellation and submission cannot cross. */
export function mutateTasks<T>(
  transform: (tasks: GenerationTask[]) => { tasks: GenerationTask[]; result: T },
): Promise<T> {
  const operation = taskWrites
    .catch(() => {})
    .then(async () => {
      const { tasks, result } = transform(state.tasks);
      const previous = new Map(state.tasks.map((task) => [task.id, task]));
      const nextIds = new Set(tasks.map((task) => task.id));
      const changed = tasks.filter((task) => task !== previous.get(task.id));
      const removed = state.tasks.filter((task) => !nextIds.has(task.id));
      await commit([
        ...changed.map((task) => ({ collection: "tasks", id: task.id, value: task })),
        ...removed.map((task) => ({ collection: "tasks", id: task.id })),
      ]);
      const changes = new Map(changed.map((task) => [task.id, task]));
      const removals = new Set(removed.map((task) => task.id));
      const currentIds = new Set(state.tasks.map((task) => task.id));
      updateState({
        tasks: [
          ...state.tasks.filter((task) => !removals.has(task.id)).map((task) => changes.get(task.id) ?? task),
          ...changed.filter((task) => !currentIds.has(task.id)),
        ],
      });
      return result;
    });
  taskWrites = operation;
  return operation;
}
export function saveTask(task: GenerationTask) {
  return mutateTasks((tasks) => ({
    tasks: tasks.map((entry) =>
      entry.id === task.id ? structuredClone({ ...task, historyDeletedAt: entry.historyDeletedAt }) : entry,
    ),
    result: undefined,
  }));
}
export async function refreshGallery() {
  await cleanGallery();
  const ids = [
    ...new Set([...state.gallery.map((entry) => entry.asset.id), ...relatedAssetIds(state.tasks, state.draft)]),
  ];
  const [entries, page] = await Promise.all([
    native<GalleryEntry[]>("gallery_entries", { ids }),
    native<{ entries: GalleryEntry[]; total: number }>("gallery_query", { query: {}, limit: 80, offset: 0 }),
  ]);
  updateState({
    gallery: [...new Map([...entries, ...page.entries].map((entry) => [entry.asset.id, entry])).values()],
  });
}
function relatedAssetIds(tasks: GenerationTask[], draft: GenerationDraft, feed = state.feed) {
  const visibleTasks = new Set(feed.map((slot) => slot.taskId));
  const needed = tasks.filter(
    (task) =>
      visibleTasks.has(task.id) ||
      ["queued", "submitting", "submission-unknown", "generating", "downloading"].includes(task.status),
  );
  const drafts = [draft, ...needed.map((task) => task.draft)];
  return [
    ...new Set([
      ...drafts.flatMap((entry) => [
        ...entry.references.map((reference) => reference.assetId),
        ...(entry.mask ? [entry.mask.assetId] : []),
        ...parameterAssetIds(entry.parameters),
      ]),
      ...needed.flatMap((task) => task.results.flatMap((result) => (result.assetId ? [result.assetId] : []))),
    ]),
  ];
}
export async function flushWrites() {
  await Promise.all([draftWrites, feedWrites, taskWrites]);
}
let feedWrites = Promise.resolve();
export function changeFeed(transform: (feed: FeedSlot[]) => FeedSlot[], changes: RecordChange[] = []) {
  feedWrites = feedWrites
    .catch(() => {})
    .then(async () => {
      const previous = state.feed;
      const next = transform(previous).slice(0, 200);
      await commit([
        ...changes,
        ...next
          .filter((slot) => !previous.some((old) => old.id === slot.id))
          .map((slot) => ({ collection: "feed", id: slot.id, value: slot })),
        ...previous
          .filter((slot) => !next.some((entry) => entry.id === slot.id))
          .map((slot) => ({ collection: "feed", id: slot.id })),
      ]);
      updateState({ feed: next });
      if (previous.some((slot) => !next.some((entry) => entry.id === slot.id))) {
        const { purgeHiddenTasks } = await import("./history");
        await purgeHiddenTasks();
      }
    });
  return feedWrites;
}
export function removeFeed(ids: string[]) {
  return changeFeed((feed) => feed.filter((slot) => !ids.includes(slot.id)));
}
