import { z } from "zod";
import type { GenerationBatch, GenerationDraft, GenerationTask, GalleryEntry } from "../../domain/types";
import { cancelCloudBatch, isCloudBusy } from "../../batch/service";
import { cancelBatch, execute, isTaskScheduled } from "../generation";
import { getState } from "../store";
import { assetExists, native } from "../native";
import { identifier, McpError, pagination, success, tool } from "./contracts";
import { executionMode } from "./creation";

const statuses = z.enum([
  "queued",
  "submitting",
  "submission-unknown",
  "generating",
  "retrieval-failed",
  "downloading",
  "download-failed",
  "completed",
  "cancelled",
  "failed",
]);

export function requireTask(id: string) {
  const task = getState().tasks.find((entry) => entry.id === id && !entry.historyDeletedAt);
  if (!task) throw new McpError("TASK_NOT_FOUND", `Task not found: ${id}`);
  return task;
}

export function requireBatch(id: string) {
  const batch = getState().batches.find((entry) => entry.id === id);
  if (!batch) throw new McpError("BATCH_NOT_FOUND", `Batch not found: ${id}`);
  return batch;
}

function resumable(task: GenerationTask) {
  if (["completed", "cancelled"].includes(task.status)) return false;
  if (task.cloudGroupId) {
    const group = getState()
      .batches.find((batch) => batch.id === task.batchId)
      ?.cloud?.groups.find((group) => group.id === task.cloudGroupId);
    return !!group && (!!group.remoteId || group.status === "submission-unknown");
  }
  return (
    !["queued", "submitting"].includes(task.status) &&
    (!!task.recovery || task.results.some((result) => !result.assetId && (result.url || result.layerSources)))
  );
}

export function taskSummary(task: GenerationTask) {
  const batch = getState().batches.find((entry) => entry.id === task.batchId);
  return {
    taskId: task.id,
    batchId: task.batchId,
    origin: batch?.origin,
    mode: task.cloudGroupId ? "batch" : "regular",
    requestId: batch?.mcpRequest?.id,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    combinationId: task.draft.combinationId,
    prompt: Array.from(task.draft.prompt).slice(0, 160).join(""),
    assetIds: task.results.flatMap((result) => (result.assetId ? [result.assetId] : [])),
    savedResults: task.results.filter((result) => !!result.assetId).length,
    resultCount: task.results.length,
    error: task.error,
    canResume: resumable(task),
  };
}

export function batchSummary(batch: GenerationBatch) {
  const tasks = getState().tasks.filter((task) => task.batchId === batch.id && !task.historyDeletedAt);
  const counts = Object.fromEntries(
    statuses.options.map((status) => [status, tasks.filter((task) => task.status === status).length]),
  );
  return {
    batchId: batch.id,
    mode: batch.cloud ? "batch" : "regular",
    origin: batch.origin,
    requestId: batch.mcpRequest?.id,
    createdAt: batch.createdAt,
    taskIds: tasks.map((task) => task.id),
    taskCounts: counts,
    outputs: tasks[0]
      ? {
          autoSave: !!tasks[0].draft.outputDirectory,
          destination: tasks[0].draft.outputDirectory,
          saveToGallery: tasks[0].draft.saveToGallery !== false,
        }
      : undefined,
    groups: batch.cloud?.groups.map((group) => ({
      groupId: group.id,
      provider: group.provider,
      model: group.model,
      status: group.status,
      requestCount: group.taskIds.length,
      updatedAt: group.updatedAt,
      error: group.error,
    })),
  };
}

function creationInput(draft: GenerationDraft) {
  return {
    combinationId: draft.combinationId,
    prompt: draft.prompt,
    creationMode: draft.creationMode,
    editTargetId: draft.editTargetId,
    parameters: draft.parameters,
    requestCount: 1,
    references: draft.references.map(({ id, assetId, name }) => ({ id, assetId, name })),
    regions: draft.regions,
    mask: draft.mask,
    inputPreparation: draft.inputPreparation?.maxEdge ? { maxEdge: draft.inputPreparation.maxEdge } : undefined,
    layerOutputDirectory: draft.layerOutputDirectory,
  };
}

export const taskTools = [
  tool(
    "list_tasks",
    "Find creation tasks, including the last task after reconnecting. Defaults: all origins, newest submitted first, limit 20. For latest successful results use status=completed, orderBy=updatedAt, limit=1; use origin=mcp to exclude manual creation.",
    z.strictObject({
      batchId: identifier.optional(),
      requestId: identifier.optional(),
      origin: z.enum(["manual", "mcp"]).optional(),
      mode: executionMode.optional(),
      status: statuses.optional(),
      hasResults: z
        .boolean()
        .optional()
        .describe(
          "Filter tasks by whether at least one result has a saved asset ID, including partially successful tasks.",
        ),
      orderBy: z.enum(["createdAt", "updatedAt"]).optional(),
      ...pagination,
    }),
    async (input) => {
      const batches = new Map(getState().batches.map((batch) => [batch.id, batch]));
      const tasks = getState()
        .tasks.filter((task) => {
          const batch = batches.get(task.batchId);
          return (
            !task.historyDeletedAt &&
            (!input.batchId || task.batchId === input.batchId) &&
            (!input.requestId || batch?.mcpRequest?.id === input.requestId) &&
            (!input.origin || batch?.origin === input.origin) &&
            (!input.status || task.status === input.status) &&
            (input.hasResults === undefined || task.results.some((result) => !!result.assetId) === input.hasResults) &&
            (!input.mode || (input.mode === "batch") === !!task.cloudGroupId)
          );
        })
        .sort(
          (a, b) =>
            b[input.orderBy ?? "createdAt"] - a[input.orderBy ?? "createdAt"] ||
            b.createdAt - a.createdAt ||
            b.id.localeCompare(a.id),
        );
      const offset = input.offset ?? 0,
        limit = input.limit ?? 20;
      return success({
        tasks: tasks.slice(offset, offset + limit).map(taskSummary),
        total: tasks.length,
        nextOffset: offset + limit < tasks.length ? offset + limit : null,
      });
    },
    { readOnly: true },
  ),
  tool(
    "get_task",
    "Read one creation task, its request and saved results. Result asset IDs work with get_image and subsequent creation even when saveToGallery=false. Returned creation describes one provider request.",
    z.strictObject({ taskId: identifier }),
    async ({ taskId }) => {
      const task = requireTask(taskId);
      const ids = task.results.flatMap((result) => (result.assetId ? [result.assetId] : []));
      const assets = new Map(
        (await native<GalleryEntry[]>("gallery_entries", { ids })).map((entry) => [entry.asset.id, entry]),
      );
      const results = await Promise.all(
        task.results.map(async (result) => {
          const entry = result.assetId ? assets.get(result.assetId) : undefined;
          return {
            resultId: result.id,
            index: result.index,
            status: result.status,
            assetId: result.assetId,
            available: result.assetId ? await assetExists(result.assetId) : false,
            mediaType: entry?.asset.mediaType ?? result.mediaType,
            width: entry?.asset.width,
            height: entry?.asset.height,
            inGallery: entry ? !entry.unlisted && !entry.staged : false,
            error: result.error,
            exportError: result.exportError,
          };
        }),
      );
      return success({
        ...taskSummary(task),
        creation: creationInput(task.draft),
        results,
        outputs: { saveToGallery: task.draft.saveToGallery !== false, destination: task.draft.outputDirectory },
        pollAfterMs: ["queued", "submitting", "generating", "downloading"].includes(task.status) ? 2000 : null,
      });
    },
    { readOnly: true },
  ),
  tool(
    "get_batch",
    "Read a creation submission's task IDs, status counts and cloud batch group states. Use list_tasks with batchId to page through its tasks.",
    z.strictObject({ batchId: identifier }),
    async ({ batchId }) => success(batchSummary(requireBatch(batchId))),
    { readOnly: true },
  ),
  tool(
    "resume_task",
    "Resume retrieval/download of an existing task without generating again. Returns whether retrieval was scheduled; follow with get_task. For a cloud task this resumes its cloud batch.",
    z.strictObject({ taskId: identifier }),
    async ({ taskId }) => {
      const task = requireTask(taskId);
      if (task.status === "completed" || task.status === "cancelled")
        return success({ accepted: false, reason: "terminal", task: taskSummary(task) });
      if (isTaskScheduled(taskId) || (task.cloudGroupId && isCloudBusy(task.batchId)))
        return success({ accepted: false, reason: "already_running", task: taskSummary(task) });
      if (!resumable(task))
        throw new McpError(
          "TASK_NOT_RESUMABLE",
          "This task has no original result to retrieve. Resume never creates a new request.",
          { taskId, status: task.status },
        );
      void execute(taskId).catch(() => {});
      return success({ accepted: true, task: taskSummary(requireTask(taskId)) });
    },
    { idempotent: true, external: true },
  ),
  tool(
    "cancel_batch",
    "For regular creation, cancel only requests still queued; submitted requests continue. For a cloud batch, request provider cancellation. Returns BATCH_BUSY when a cloud operation is in progress; query get_batch before retrying.",
    z.strictObject({ batchId: identifier }),
    async ({ batchId }) => {
      const batch = requireBatch(batchId);
      if (batch.cloud) {
        if (isCloudBusy(batchId))
          throw new McpError(
            "BATCH_BUSY",
            "The cloud batch is busy. Query its state and retry cancellation later.",
            { batchId },
            true,
          );
        await cancelCloudBatch(batchId);
        return success({ scope: "cloud", batch: batchSummary(requireBatch(batchId)) });
      }
      const cancelled = await cancelBatch(batchId);
      return success({ scope: "queued_requests", cancelled, batch: batchSummary(requireBatch(batchId)) });
    },
    { idempotent: true, external: true },
  ),
];
