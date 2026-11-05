import { useSyncExternalStore } from "react";
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
import { commit, readRecords, type RecordChange } from "./native";
import { cleanGallery } from "./cleanup";
import { storeParameterAssets } from "./parameterAssets";
import type { Parameters } from "../domain/types";

export interface Preferences {
  id: "preferences";
  theme: "system" | "light" | "dark";
  providers: Record<string, { endpoint?: string; deployment?: string }>;
  cleanup: Record<"generated" | "imported", CleanupPolicy>;
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
      readRecords<GalleryEntry>("gallery"),
      readRecords<Board>("boards"),
      readRecords<GenerationTask>("tasks"),
      readRecords<GenerationBatch>("batches"),
      readRecords<FeedSlot>("feed"),
      readRecords<GenerationDraft>("draft"),
      readRecords<Preferences>("preferences"),
    ]);
    const draft = drafts[0] ?? state.draft;
    combinationById(draft.combinationId);
    const createdAt = new Map(tasks.map((task) => [task.id, task.createdAt]));
    feed.sort(
      (a, b) => (createdAt.get(b.taskId) ?? 0) - (createdAt.get(a.taskId) ?? 0) || a.resultIndex - b.resultIndex,
    );
    updateState({
      gallery,
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
    });
  return draftWrites;
}
export async function savePreferences(preferences: Preferences) {
  await commit([{ collection: "preferences", id: "preferences", value: preferences }]);
  updateState({ preferences });
  await cleanGallery();
}
export async function saveTask(task: GenerationTask) {
  await commit([{ collection: "tasks", id: task.id, value: task }]);
  updateState({ tasks: state.tasks.map((entry) => (entry.id === task.id ? structuredClone(task) : entry)) });
}
export async function refreshGallery() {
  updateState({ gallery: await readRecords<GalleryEntry>("gallery") });
  await cleanGallery();
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
    });
  return feedWrites;
}
export function removeFeed(ids: string[]) {
  return changeFeed((feed) => feed.filter((slot) => !ids.includes(slot.id)));
}
