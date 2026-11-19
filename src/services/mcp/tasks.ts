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

function requireTask(id: string) {
  const task = getState().tasks.find((entry) => entry.id === id && !entry.historyDeletedAt);
  if (!task) throw new McpError("TASK_NOT_FOUND", `Task not found: ${id}`);
  return task;
}

function requireBatch(id: string) {
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
    (!!task.recovery || task.results.some((result) => result.layerSources || (!result.assetId && result.url)))
  );
}

function taskSummary(task: GenerationTask) {
  const assetIds = task.results.flatMap((result) => (result.assetId ? [result.assetId] : []));
  return {
    taskId: task.id,
    batchId: task.batchId,
    status: task.status,
    updatedAt: task.updatedAt,
    prompt: Array.from(task.draft.prompt).slice(0, 160).join(""),
    ...(assetIds.length ? { assetIds } : {}),
  };
}

function countByStatus<Status extends string>(entries: readonly { status: Status }[]) {
  const counts: Partial<Record<Status, number>> = {};
  for (const { status } of entries) counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}

function batchProgress(batch: GenerationBatch, includeGroups: boolean) {
  const tasks = getState().tasks.filter((task) => task.batchId === batch.id && !task.historyDeletedAt);
  const groups = batch.cloud?.groups;
  return {
    batchId: batch.id,
    taskCounts: countByStatus(tasks),
    cloudGroupCounts: groups ? countByStatus(groups) : undefined,
    groups: includeGroups
      ? groups?.map((group) => ({
          groupId: group.id,
          provider: group.provider,
          model: group.model,
          status: group.status,
          requestCount: group.taskIds.length,
          error: group.error,
        }))
      : undefined,
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
    "Read a task's status and results. Use result asset IDs with get_image or a subsequent creation.",
    z.strictObject({
      taskId: identifier,
      includeCreation: z.boolean().optional().describe("Include the creation and output settings for this request."),
    }),
    async ({ taskId, includeCreation }) => {
      const task = requireTask(taskId);
      const ids = task.results.flatMap((result) => (result.assetId ? [result.assetId] : []));
      const entries = ids.length ? await native<GalleryEntry[]>("gallery_entries", { ids }) : [];
      const assets = new Map(entries.map((entry) => [entry.asset.id, entry]));
      const results = await Promise.all(
        task.results.map(async (result) => {
          const entry = result.assetId ? assets.get(result.assetId) : undefined;
          return {
            index: result.index,
            status: result.status,
            assetId: result.assetId,
            available: result.assetId ? await assetExists(result.assetId) : false,
            mediaType: entry?.asset.mediaType ?? result.mediaType,
            width: entry?.asset.width,
            height: entry?.asset.height,
            error: result.error,
            exportError: result.exportError,
            path: entry?.path,
            layerDelivery: result.layerDelivery,
          };
        }),
      );
      return success({
        taskId,
        status: task.status,
        error: task.error,
        canResume: resumable(task),
        ...(results.length ? { results } : {}),
        ...(includeCreation
          ? {
              creation: creationInput(task.draft),
              outputs: { autoSave: !!task.draft.outputDirectory, destination: task.draft.outputDirectory },
            }
          : {}),
        pollAfterMs: ["queued", "submitting", "generating", "downloading"].includes(task.status) ? 2000 : null,
      });
    },
    { readOnly: true },
  ),
  tool(
    "get_batch",
    "Read task and cloud group counts by status. Use list_tasks with batchId to find tasks and their results.",
    z.strictObject({
      batchId: identifier,
      includeGroups: z.boolean().optional().describe("Include individual cloud group states and errors."),
    }),
    async ({ batchId, includeGroups = false }) => success(batchProgress(requireBatch(batchId), includeGroups)),
    { readOnly: true },
  ),
  tool(
    "resume_task",
    "Resume retrieval/download of an existing task without generating again. Returns whether retrieval was scheduled; follow with get_task. For a cloud task this resumes its cloud batch.",
    z.strictObject({ taskId: identifier }),
    async ({ taskId }) => {
      const task = requireTask(taskId);
      const receipt = { taskId, batchId: task.cloudGroupId ? task.batchId : undefined };
      if (task.status === "completed" || task.status === "cancelled")
        return success({ ...receipt, accepted: false, reason: "terminal" });
      if (isTaskScheduled(taskId) || (task.cloudGroupId && isCloudBusy(task.batchId)))
        return success({ ...receipt, accepted: false, reason: "already_running" });
      if (!resumable(task))
        throw new McpError(
          "TASK_NOT_RESUMABLE",
          "This task has no original result to retrieve. Resume never creates a new request.",
          { taskId, status: task.status },
        );
      void execute(taskId).catch(() => {});
      return success({ ...receipt, accepted: true });
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
        const counts = countByStatus(requireBatch(batchId).cloud?.groups ?? []);
        return success({
          batchId,
          scope: "cloud",
          cancellingGroups: counts.cancelling ?? 0,
          cancelledGroups: counts.cancelled ?? 0,
        });
      }
      const cancelled = await cancelBatch(batchId);
      return success({ batchId, scope: "queued_requests", cancelled });
    },
    { idempotent: true, external: true },
  ),
];
