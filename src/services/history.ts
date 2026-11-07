import type { GenerationTask } from "../domain/types";
import { getState, mutateTasks } from "./store";
import { isTaskScheduled } from "./generation";
import { deletingTaskIds } from "./taskLocks";
import { native } from "./native";
import { canDeleteCloudBatch } from "../batch/service";

export const canDeleteHistory = (task: GenerationTask) =>
  (!task.cloudGroupId ||
    !!getState().batches.find((batch) => batch.id === task.batchId && canDeleteCloudBatch(batch))) &&
  !isTaskScheduled(task.id) &&
  ["completed", "failed", "retrieval-failed", "download-failed", "cancelled"].includes(task.status);

/** Hide history independently from feed slots, recovery and gallery assets. */
export async function deleteHistory(ids: string[]) {
  const selected = new Set(ids);
  ids.forEach((id) => deletingTaskIds.add(id));
  try {
    const result = await mutateTasks((tasks) => {
      const chosen = tasks.filter((task) => selected.has(task.id) && !task.historyDeletedAt);
      const deletable = new Set(chosen.filter(canDeleteHistory).map((task) => task.id));
      const retained = new Set(getState().feed.map((slot) => slot.taskId));
      return {
        tasks: tasks.flatMap((task) => {
          if (!deletable.has(task.id)) return [task];
          return retained.has(task.id) ? [{ ...task, historyDeletedAt: Date.now() }] : [];
        }),
        result: {
          deleted: deletable.size,
          skipped: chosen.length - deletable.size,
          removed: chosen.filter((task) => deletable.has(task.id) && !retained.has(task.id)),
        },
      };
    });
    await discardStagedResults(result.removed);
    return { deleted: result.deleted, skipped: result.skipped };
  } finally {
    ids.forEach((id) => deletingTaskIds.delete(id));
  }
}

export async function purgeHiddenTasks() {
  const removed = await mutateTasks((tasks) => {
    const retained = new Set(getState().feed.map((slot) => slot.taskId));
    const removed = tasks.filter((task) => task.historyDeletedAt && canDeleteHistory(task) && !retained.has(task.id));
    const ids = new Set(removed.map((task) => task.id));
    return { tasks: tasks.filter((task) => !ids.has(task.id)), result: removed };
  });
  await discardStagedResults(removed);
}

async function discardStagedResults(removed: GenerationTask[]) {
  const resultUrls = (task: GenerationTask) =>
    task.results.flatMap((result) => [
      ...(result.url ? [result.url] : []),
      ...(result.layerSources ?? []).map((source) => source.url),
    ]);
  const current = getState();
  const retainedIds = new Set(current.feed.map((slot) => slot.taskId));
  const retainedUrls = new Set(current.tasks.flatMap(resultUrls));
  const urls = [
    ...new Set(
      removed
        .filter((task) => !retainedIds.has(task.id) && !isTaskScheduled(task.id))
        .flatMap(resultUrls)
        .filter((url) => url.startsWith("staged:") && !retainedUrls.has(url)),
    ),
  ];
  if (urls.length) await native("result_discard", { urls });
}
