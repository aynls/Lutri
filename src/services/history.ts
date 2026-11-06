import type { GenerationTask } from "../domain/types";
import { getState, mutateTasks } from "./store";
import { isTaskScheduled } from "./generation";
import { deletingTaskIds } from "./taskLocks";

export const canDeleteHistory = (task: GenerationTask) =>
  !isTaskScheduled(task.id) && ["completed", "failed", "download-failed", "cancelled"].includes(task.status);

/** Hide history independently from feed slots, recovery and gallery assets. */
export async function deleteHistory(ids: string[]) {
  const selected = new Set(ids);
  ids.forEach((id) => deletingTaskIds.add(id));
  try {
    return await mutateTasks((tasks) => {
      const chosen = tasks.filter((task) => selected.has(task.id) && !task.historyDeletedAt);
      const deletable = new Set(chosen.filter(canDeleteHistory).map((task) => task.id));
      const retained = new Set(getState().feed.map((slot) => slot.taskId));
      return {
        tasks: tasks.flatMap((task) => {
          if (!deletable.has(task.id)) return [task];
          return retained.has(task.id) ? [{ ...task, historyDeletedAt: Date.now() }] : [];
        }),
        result: { deleted: deletable.size, skipped: chosen.length - deletable.size },
      };
    });
  } finally {
    ids.forEach((id) => deletingTaskIds.delete(id));
  }
}

export function purgeHiddenTasks() {
  return mutateTasks((tasks) => ({
    tasks: tasks.filter(
      (task) =>
        !task.historyDeletedAt || !canDeleteHistory(task) || getState().feed.some((slot) => slot.taskId === task.id),
    ),
    result: undefined,
  }));
}
