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
  StoredImage,
  CreationWorkspace,
} from "../domain/types";
import { combinationById, combinations } from "../models";
import { initialDraft } from "../models/shared";
import { commit, readRecords, native, type RecordChange } from "./native";
import { cleanGallery } from "./cleanup";
import { storeParameterAssets, parameterAssetIds } from "./parameterAssets";
import type { Parameters } from "../domain/types";
import type { Accent, Palette } from "../appearance";

export interface Preferences {
  id: "preferences";
  palette?: Palette;
  accent?: Accent;
  providers: Record<string, { endpoint?: string; deployment?: string }>;
  cleanup: Record<"generated" | "imported", CleanupPolicy>;
  desktop?: { background: boolean; launchAtLogin: boolean; zoom: number };
  // null selects automatically; -1 uses CPU; nonnegative values select a device.
  upscale?: { concurrency: number; gpuIndex: number | null };
  generation?: { maxRequestCount: number };
  mcp?: { port: number; autoStart: boolean };
  outputs?: {
    directory?: string;
    generationAuto?: boolean;
    upscaleAuto?: boolean;
    generationGallery?: boolean;
    upscaleGallery?: boolean;
    batchAuto?: boolean;
    batchGallery?: boolean;
  };
}
export interface ApplicationState {
  ready: boolean;
  upscaleDevices: { index: number; name: string }[];
  loadingUpscaleDevices: boolean;
  /** Image cache for gallery entries, staged inputs and unlisted results used by the workspace. */
  gallery: GalleryEntry[];
  masks: StoredImage[];
  boards: Board[];
  tasks: GenerationTask[];
  batches: GenerationBatch[];
  feed: FeedSlot[];
  draft: GenerationDraft;
  creation: CreationWorkspace;
  preferences: Preferences;
}
let state: ApplicationState = {
  ready: false,
  upscaleDevices: [],
  loadingUpscaleDevices: false,
  gallery: [],
  masks: [],
  boards: [],
  tasks: [],
  batches: [],
  feed: [],
  draft: initialDraft(combinations[0]),
  creation: { mode: "regular", items: [] },
  preferences: {
    id: "preferences",
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
let deviceRefresh: Promise<void> | undefined;
export function refreshUpscaleDevices(): Promise<void> {
  if (deviceRefresh) return deviceRefresh;
  updateState({ loadingUpscaleDevices: true });
  deviceRefresh = native<ApplicationState["upscaleDevices"]>("upscale_devices")
    .then((upscaleDevices) => updateState({ upscaleDevices }))
    .finally(() => {
      deviceRefresh = undefined;
      updateState({ loadingUpscaleDevices: false });
    });
  return deviceRefresh;
}
let loading: Promise<void> | undefined;
/** Asset IDs referenced by the last committed draft; staged assets lose library files once unreferenced. */
let committedRelated = new Set<string>();
export function loadApplication(): Promise<void> {
  return (loading ??= (async () => {
    const [gallery, masks, boards, tasks, batches, feed, drafts, preferences, workspaces] = await Promise.all([
      native<{ entries: GalleryEntry[]; total: number }>("gallery_query", { query: {}, limit: 80, offset: 0 }),
      readRecords<StoredImage>("masks"),
      readRecords<Board>("boards"),
      readRecords<GenerationTask>("tasks"),
      readRecords<GenerationBatch>("batches"),
      readRecords<FeedSlot>("feed"),
      readRecords<GenerationDraft>("draft"),
      readRecords<Preferences>("preferences"),
      readRecords<CreationWorkspace>("creation"),
    ]);
    const draft = drafts[0] ?? state.draft;
    const creation = workspaces[0] ?? state.creation;
    const relatedIds = relatedAssetIds(tasks, draft, feed, creation);
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
    const related = await native<GalleryEntry[]>("gallery_entries", { ids: relatedIds });
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
    committedRelated = new Set(relatedIds);
    await native("staging_purge", { keep: relatedIds });
    const createdAt = new Map(tasks.map((task) => [task.id, task.createdAt]));
    feed.sort(
      (a, b) => (createdAt.get(b.taskId) ?? 0) - (createdAt.get(a.taskId) ?? 0) || a.resultIndex - b.resultIndex,
    );
    updateState({
      gallery: backfilled,
      masks,
      boards,
      tasks,
      batches,
      feed,
      draft,
      creation,
      preferences: preferences[0] ?? state.preferences,
      ready: true,
    });
  })());
}

export async function saveMask(dataUrl: string) {
  const mask = await native<StoredImage>("mask_save", { dataUrl });
  updateState({ masks: [...state.masks, mask] });
  return mask;
}

let draftWrites = Promise.resolve();
export function saveDraft(draft: GenerationDraft) {
  if (draft.creationMode === "edit" && !draft.editTargetId && draft.references.length)
    draft = { ...draft, editTargetId: draft.references[0].id };
  return saveCreation(draft, state.creation);
}

/** The editor and its containing draft are one durable write, including all material references. */
export function saveCreation(draft: GenerationDraft, creation: CreationWorkspace, changes: RecordChange[] = []) {
  const previous = { draft: state.draft, creation: state.creation };
  creation = { ...creation, [creation.mode]: draft };
  updateState({ draft, creation });
  draftWrites = draftWrites
    .catch(() => {})
    .then(async () => {
      let normalized: GenerationDraft;
      let workspace: CreationWorkspace;
      try {
        normalized = {
          ...draft,
          parameters: (await storeParameterAssets(draft.parameters, "", new Map(), true)) as Parameters,
        };
        workspace = { ...creation, [creation.mode]: normalized };
        await commit([
          { collection: "draft", id: "current", value: normalized },
          { collection: "creation", id: "current", value: workspace },
          ...changes,
        ]);
      } catch (error) {
        if (state.creation === creation) updateState({ creation: previous.creation });
        if (state.draft === draft) updateState({ draft: previous.draft });
        throw error;
      }
      updateState({
        ...(state.draft === draft ? { draft: normalized } : {}),
        ...(state.creation === creation ? { creation: workspace } : {}),
      });
      const cached = new Set(state.gallery.map((entry) => entry.asset.id));
      const missing = relatedAssetIds(state.tasks, state.draft).filter((id) => !cached.has(id));
      if (missing.length) {
        const entries = await native<GalleryEntry[]>("gallery_entries", { ids: missing }).catch(() => []);
        if (entries.length)
          updateState({
            gallery: [...new Map([...state.gallery, ...entries].map((entry) => [entry.asset.id, entry])).values()],
          });
      }
      // New edits may have arrived while this write was in flight. Protect both snapshots.
      const keep = new Set([
        ...relatedAssetIds(state.tasks, normalized, state.feed, workspace),
        ...relatedAssetIds(state.tasks, state.draft),
      ]);
      const stale = [...committedRelated].filter((id) => !keep.has(id));
      committedRelated = keep;
      if (!stale.length) return;
      const orphans = (await native<GalleryEntry[]>("gallery_entries", { ids: stale }).catch(() => [])).filter(
        (entry) => entry.staged,
      );
      const removed = new Set<string>();
      for (const entry of orphans)
        try {
          await native("asset_delete", { id: entry.asset.id });
          removed.add(entry.asset.id);
        } catch {
          committedRelated.add(entry.asset.id);
        }
      if (removed.size) updateState({ gallery: state.gallery.filter((entry) => !removed.has(entry.asset.id)) });
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
export async function refreshGallery(extraIds: string[] = []) {
  await cleanGallery();
  const ids = [
    ...new Set([
      ...extraIds,
      ...state.gallery.map((entry) => entry.asset.id),
      ...relatedAssetIds(state.tasks, state.draft),
    ]),
  ];
  const [entries, page, masks] = await Promise.all([
    native<GalleryEntry[]>("gallery_entries", { ids }),
    native<{ entries: GalleryEntry[]; total: number }>("gallery_query", { query: {}, limit: 80, offset: 0 }),
    readRecords<StoredImage>("masks"),
  ]);
  updateState({
    gallery: [...new Map([...entries, ...page.entries].map((entry) => [entry.asset.id, entry])).values()],
    masks,
  });
}
function relatedAssetIds(
  tasks: GenerationTask[],
  draft: GenerationDraft,
  feed = state.feed,
  creation = state.creation,
) {
  const visibleTasks = new Set(feed.map((slot) => slot.taskId));
  const needed = tasks.filter(
    (task) =>
      visibleTasks.has(task.id) ||
      ["queued", "submitting", "submission-unknown", "generating", "downloading"].includes(task.status),
  );
  const drafts = [
    draft,
    ...creation.items.map((item) => item.draft),
    ...[creation.regular, creation.batch, creation.editing?.returnDraft].filter(
      (entry): entry is GenerationDraft => !!entry,
    ),
    ...needed.map((task) => task.draft),
  ];
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
  await Promise.all([draftWrites, feedWrites, taskWrites, batchWrites]);
}
let batchWrites: Promise<unknown> = Promise.resolve();
export function mutateBatch(id: string, transform: (batch: GenerationBatch) => GenerationBatch) {
  const operation = batchWrites
    .catch(() => {})
    .then(async () => {
      const current = state.batches.find((batch) => batch.id === id);
      if (!current) throw new Error("Batch not found");
      const next = transform(current);
      await commit([{ collection: "batches", id, value: next }]);
      updateState({ batches: state.batches.map((batch) => (batch.id === id ? next : batch)) });
      return next;
    });
  batchWrites = operation;
  return operation;
}
let feedWrites = Promise.resolve();
export function changeFeed(
  transform: (feed: FeedSlot[]) => FeedSlot[],
  changes: RecordChange[] = [],
  task?: GenerationTask,
) {
  feedWrites = feedWrites
    .catch(() => {})
    .then(async () => {
      const previous = state.feed;
      const next = transform(previous).slice(0, 200);
      const updatedTask = task
        ? structuredClone({
            ...task,
            historyDeletedAt: state.tasks.find((entry) => entry.id === task.id)?.historyDeletedAt,
          })
        : undefined;
      await commit([
        ...changes,
        ...(updatedTask ? [{ collection: "tasks", id: updatedTask.id, value: updatedTask }] : []),
        ...next
          .filter(
            (slot) =>
              !previous.some(
                (old) => old.id === slot.id && old.taskId === slot.taskId && old.resultIndex === slot.resultIndex,
              ),
          )
          .map((slot) => ({ collection: "feed", id: slot.id, value: slot })),
        ...previous
          .filter((slot) => !next.some((entry) => entry.id === slot.id))
          .map((slot) => ({ collection: "feed", id: slot.id })),
      ]);
      updateState({
        feed: next,
        ...(updatedTask
          ? { tasks: state.tasks.map((entry) => (entry.id === updatedTask.id ? updatedTask : entry)) }
          : {}),
      });
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
