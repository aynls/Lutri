import type {
  BatchDraftItem,
  CloudBatchGroup,
  CloudBatchStatus,
  GenerationBatch,
  GenerationTask,
  Json,
} from "../domain/types";
import { compilePrompt } from "../domain/references";
import { combinationById } from "../models";
import { request } from "../models/shared";
import { prepareGenerationInputs } from "../create/prepareInputs";
import { assetExists, commit, native } from "../services/native";
import {
  flushWrites,
  getState,
  mutateBatch,
  mutateTasks,
  refreshGallery,
  saveCreation,
  saveTask,
  updateState,
} from "../services/store";
import { receive, downloadResults } from "../services/generation";
import { resolveOutputs, type OutputOptions } from "../services/outputs";
import { imageResults, responseMetadata } from "../providers/results";
import { HttpError, array, object, send, string } from "../providers/transport";
import { sanitizeDiagnostic } from "../providers/diagnostics";
import { compileBatchRequest, validateBatchDraft } from "./capabilities";
import { b, type BatchMessage } from "./messages";

export class BatchValidationError extends Error {
  constructor(public issues: Record<string, string[]>) {
    super(Object.values(issues).flat().join("\n"));
  }
}

const busy = new Map<string, Promise<void>>();
let submitting = false;
let timer: ReturnType<typeof setTimeout> | undefined;
export const isCloudBusy = (id: string) => busy.has(id);
const remoteActive = new Set<CloudBatchStatus>(["queued", "running", "cancelling"]);
const terminal = new Set<CloudBatchStatus>(["completed", "failed", "cancelled", "expired"]);
const remoteTerminal = new Set([
  "completed",
  "failed",
  "cancelled",
  "expired",
  "BATCH_STATE_SUCCEEDED",
  "BATCH_STATE_FAILED",
  "BATCH_STATE_CANCELLED",
  "BATCH_STATE_EXPIRED",
  "JOB_STATE_SUCCEEDED",
  "JOB_STATE_FAILED",
  "JOB_STATE_CANCELLED",
  "JOB_STATE_EXPIRED",
]);
export const canDeleteCloudBatch = (batch: GenerationBatch) =>
  !isCloudBusy(batch.id) &&
  !!batch.cloud &&
  batch.cloud.groups.every(
    (group) =>
      terminal.has(group.status) ||
      group.status === "submission-failed" ||
      (group.status === "retrieval-failed" && remoteTerminal.has(group.remoteState ?? "")),
  );

export function cloudSummary(batch: GenerationBatch, tasks: GenerationTask[]): BatchMessage {
  const groups = batch.cloud?.groups ?? [];
  if (
    groups.some((group) => ["submission-failed", "submission-unknown"].includes(group.status)) &&
    groups.some((group) => group.remoteId)
  )
    return "partial-submission";
  for (const status of [
    "submitting",
    "uploading",
    "prepared",
    "submission-unknown",
    "submission-failed",
    "cancelling",
    "retrieval-failed",
    "retrieving",
    "running",
    "queued",
  ] as const)
    if (groups.some((group) => group.status === status)) return status;
  if (tasks.some((task) => ["download-failed", "retrieval-failed"].includes(task.status))) return "retrieval-failed";
  if (tasks.length && tasks.every((task) => task.status === "completed")) return "completed";
  if (tasks.some((task) => task.results.some((result) => result.assetId))) return "partial";
  if (groups.some((group) => group.status === "expired")) return "expired";
  if (groups.some((group) => group.status === "cancelled")) return "cancelled";
  return "failed";
}

function groupById(batchId: string, groupId: string) {
  return getState()
    .batches.find((batch) => batch.id === batchId)
    ?.cloud?.groups.find((group) => group.id === groupId);
}
async function patchGroup(batchId: string, groupId: string, patch: Partial<CloudBatchGroup>) {
  await mutateBatch(batchId, (batch) => ({
    ...batch,
    cloud: {
      ...batch.cloud!,
      groups: batch.cloud!.groups.map((group) =>
        group.id === groupId ? { ...group, ...patch, updatedAt: Date.now() } : group,
      ),
    },
  }));
}
async function groupTasks(group: CloudBatchGroup, status: GenerationTask["status"], error?: string) {
  const ids = new Set(group.taskIds);
  await mutateTasks((tasks) => ({
    tasks: tasks.map((task) =>
      ids.has(task.id) && !["completed", "cancelled"].includes(task.status)
        ? { ...task, status, error, providerTaskId: group.remoteId, updatedAt: Date.now() }
        : task,
    ),
    result: undefined,
  }));
}

/** Validate and prepare every item before uploading anything or emptying the draft. */
export async function submitCloudBatch(options?: {
  items: BatchDraftItem[];
  output: OutputOptions;
  mcpRequest: NonNullable<GenerationBatch["mcpRequest"]>;
}): Promise<GenerationBatch> {
  if (submitting) throw new Error(b("submitting"));
  submitting = true;
  const fileIds: string[] = [];
  let persisted = false;
  try {
    if (!options) await flushWrites();
    const workspace = getState().creation;
    if (!options && workspace.editing) throw new Error(b("pendingEdit"));
    const items = structuredClone(options?.items ?? workspace.items);
    if (!items.length) throw new Error(b("empty"));
    const output = resolveOutputs("batch", options?.output);
    if (output.directory && !(await native<boolean>("layer_directory_available", { directory: output.directory })))
      throw new Error(output.directory);
    const credentials = new Map(
      await Promise.all(
        [...new Set(items.map((item) => combinationById(item.draft.combinationId).provider))].map(
          async (provider) => [provider, await native<boolean>("credential_present", { provider })] as const,
        ),
      ),
    );
    const issues: Record<string, string[]> = {};
    for (const item of items) {
      const errors = validateBatchDraft(item.draft);
      const combination = combinationById(item.draft.combinationId);
      if (!credentials.get(combination.provider)) errors.push(`${combination.provider}: ${b("credentials")}`);
      const ids = [
        ...item.draft.references.map((reference) => reference.assetId),
        ...(item.draft.mask ? [item.draft.mask.assetId] : []),
      ];
      if ((await Promise.all(ids.map(assetExists))).some((exists) => !exists)) errors.push(b("missingAsset"));
      if (errors.length) issues[item.id] = errors;
    }
    if (Object.keys(issues).length) throw new BatchValidationError(issues);
    const now = Date.now();
    const batch: GenerationBatch = {
      id: crypto.randomUUID(),
      createdAt: now,
      origin: options ? "mcp" : "manual",
      mcpRequest: options?.mcpRequest,
      taskIds: [],
      cloud: { items, groups: [] },
    };
    const tasks: GenerationTask[] = [];
    const sizes = new Map<string, number>();
    for (const item of items) {
      try {
        const combination = combinationById(item.draft.combinationId);
        const prepared = await prepareGenerationInputs(item.draft, combination);
        const prompt = compilePrompt(prepared.draft, prepared.draft.references);
        const compiled = compileBatchRequest(combination, { ...prepared, prompt, taskId: item.id, configuration: {} });
        const provider = combination.batch!.protocol;
        // Conservative headroom for JSONL keys and encoding. Google file input allows 2 GB;
        // use smaller groups so completed output files can be retrieved independently.
        const limit = provider === "openai" ? 190_000_000 : 100_000_000;
        const bytes = new TextEncoder().encode(JSON.stringify(compiled.body)).length + 256;
        if (bytes > limit) throw new Error(b("tooLarge"));
        let remaining = item.draft.requestCount;
        while (remaining > 0) {
          let group = [...batch.cloud!.groups]
            .reverse()
            .find(
              (entry) =>
                entry.provider === provider &&
                entry.model === combination.model &&
                entry.endpoint === compiled.endpoint &&
                entry.taskIds.length < 50_000 &&
                (sizes.get(entry.id) ?? 0) + bytes <= limit,
            );
          if (!group) {
            group = {
              id: crypto.randomUUID(),
              provider,
              model: combination.model,
              endpoint: compiled.endpoint,
              taskIds: [],
              status: "prepared",
              updatedAt: now,
            };
            batch.cloud!.groups.push(group);
            fileIds.push(group.id);
          }
          const count = Math.min(
            remaining,
            50_000 - group.taskIds.length,
            Math.floor((limit - (sizes.get(group.id) ?? 0)) / bytes),
          );
          const ids = Array.from({ length: count }, () => crypto.randomUUID());
          await native("batch_input_append", {
            id: group.id,
            provider,
            endpoint: compiled.endpoint,
            body: compiled.body,
            taskIds: ids,
          });
          group.taskIds.push(...ids);
          sizes.set(group.id, (sizes.get(group.id) ?? 0) + count * bytes);
          tasks.push(
            ...ids.map((id): GenerationTask => ({
              id,
              batchId: batch.id,
              cloudGroupId: group.id,
              draftItemId: item.id,
              createdAt: now,
              updatedAt: now,
              draft: {
                ...structuredClone(item.draft),
                outputDirectory: output.directory,
              },
              compiledPrompt: compiled.prompt,
              status: "queued",
              results: [],
            })),
          );
          remaining -= count;
        }
      } catch (error) {
        throw new BatchValidationError({ [item.id]: [sanitizeDiagnostic(error)] });
      }
    }
    await native("assets_publish", {
      ids: [...new Set(items.flatMap((item) => item.draft.references.map((ref) => ref.assetId)))],
    });
    batch.taskIds = tasks.map((task) => task.id);
    const current = getState();
    const submitted = new Set(items.map((item) => item.id));
    const changes = [
      { collection: "batches", id: batch.id, value: batch },
      ...tasks.map((task) => ({ collection: "tasks", id: task.id, value: task })),
    ];
    if (options) await commit(changes);
    else
      await saveCreation(
        current.draft,
        { ...current.creation, items: current.creation.items.filter((item) => !submitted.has(item.id)) },
        changes,
      );
    persisted = true;
    updateState({ batches: [batch, ...getState().batches], tasks: [...tasks, ...getState().tasks] });
    void refreshGallery().catch(() => {});
    void runBatch(batch.id, true).catch(() => {});
    return batch;
  } finally {
    submitting = false;
    if (!persisted && fileIds.length) await native("batch_files_remove", { ids: fileIds }).catch(() => {});
  }
}

function api(group: CloudBatchGroup, path: string, body?: Json) {
  return {
    ...request(
      group.provider,
      `${group.provider === "openai" ? "https://api.openai.com/v1" : "https://generativelanguage.googleapis.com/v1beta"}/${path}`,
      body ?? null,
    ),
    method: body === undefined ? ("GET" as const) : ("POST" as const),
    body,
  };
}

async function submitGroup(batchId: string, source: CloudBatchGroup) {
  let group = source;
  try {
    if (!group.inputFileId) {
      await patchGroup(batchId, group.id, { status: "uploading", error: undefined });
      const inputFileId = await native<string>("batch_upload", { id: group.id, provider: group.provider });
      await patchGroup(batchId, group.id, { inputFileId });
      group = { ...group, inputFileId };
    }
  } catch (error) {
    await patchGroup(batchId, group.id, { status: "submission-failed", error: sanitizeDiagnostic(error) });
    await groupTasks(group, "failed", sanitizeDiagnostic(error));
    return;
  }
  // Durable intent precedes the billable call. A crash here must reconcile, never resubmit.
  await patchGroup(batchId, group.id, { status: "submitting", error: undefined });
  await groupTasks(group, "submitting");
  try {
    const response = await send(
      group.provider === "openai"
        ? api(group, "batches", {
            input_file_id: group.inputFileId!,
            endpoint: group.endpoint,
            completion_window: "24h",
            metadata: { lutri_group: group.id },
          })
        : api(group, group.endpoint, {
            batch: { displayName: `lutri-${group.id}`, inputConfig: { fileName: group.inputFileId! } },
          }),
    );
    const remoteId = string(object(response)[group.provider === "openai" ? "id" : "name"]);
    if (!remoteId) throw new Error(b("unknown"));
    await patchGroup(batchId, group.id, { remoteId, status: "queued" });
    await groupTasks({ ...group, remoteId }, "generating");
  } catch (error) {
    const rejected = error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 408;
    await patchGroup(batchId, group.id, {
      status: rejected ? "submission-failed" : "submission-unknown",
      error: sanitizeDiagnostic(error),
    });
    await groupTasks(group, rejected ? "failed" : "submission-unknown", sanitizeDiagnostic(error));
  }
}

async function reconcile(batchId: string, group: CloudBatchGroup) {
  if (group.remoteId) {
    await patchGroup(batchId, group.id, { status: "queued", error: undefined });
    await groupTasks(group, "generating");
    return;
  }
  let cursor = "";
  for (let page = 0; page < 100; page++) {
    const suffix =
      group.provider === "openai"
        ? `?limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`
        : `?pageSize=100${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ""}`;
    const response = object(await send(api(group, `batches${suffix}`)));
    const entries = array(group.provider === "openai" ? response.data : response.operations);
    const matches = entries
      .map(object)
      .filter((entry) =>
        group.provider === "openai"
          ? object(entry.metadata).lutri_group === group.id && entry.input_file_id === group.inputFileId
          : object(entry.metadata).displayName === `lutri-${group.id}`,
      );
    if (matches.length === 1) {
      const remoteId = string(matches[0][group.provider === "openai" ? "id" : "name"]);
      if (remoteId) {
        await patchGroup(batchId, group.id, { remoteId, status: "queued", error: undefined });
        await groupTasks({ ...group, remoteId }, "generating");
        return;
      }
    }
    if (matches.length > 1) break;
    cursor =
      group.provider === "openai"
        ? response.has_more
          ? (string(response.last_id) ?? "")
          : ""
        : (string(response.nextPageToken) ?? "");
    if (!cursor) break;
  }
  await patchGroup(batchId, group.id, { error: b("unknown") });
}

function remoteSnapshot(group: CloudBatchGroup, response: Json) {
  const raw = object(response);
  const metadata = group.provider === "openai" ? raw : object(raw.metadata);
  const state = string(metadata[group.provider === "openai" ? "status" : "state"]) ?? "";
  const counts = object(group.provider === "openai" ? raw.request_counts : metadata.batchStats);
  const output = object(metadata.output);
  const outputFileIds =
    group.provider === "openai"
      ? [string(raw.output_file_id), string(raw.error_file_id)].filter((id): id is string => !!id)
      : [string(output.responsesFile)].filter((id): id is string => !!id);
  const status: CloudBatchStatus = ["completed", "BATCH_STATE_SUCCEEDED", "JOB_STATE_SUCCEEDED"].includes(state)
    ? "completed"
    : ["failed", "BATCH_STATE_FAILED", "JOB_STATE_FAILED"].includes(state)
      ? "failed"
      : ["cancelled", "BATCH_STATE_CANCELLED", "JOB_STATE_CANCELLED"].includes(state)
        ? "cancelled"
        : ["expired", "BATCH_STATE_EXPIRED", "JOB_STATE_EXPIRED"].includes(state)
          ? "expired"
          : ["cancelling", "BATCH_STATE_CANCELLING", "JOB_STATE_CANCELLING"].includes(state)
            ? "cancelling"
            : [
                  "validating",
                  "BATCH_STATE_PENDING",
                  "JOB_STATE_PENDING",
                  "BATCH_STATE_QUEUED",
                  "JOB_STATE_QUEUED",
                ].includes(state)
              ? "queued"
              : "running";
  const completed = counts[group.provider === "openai" ? "completed" : "successfulRequestCount"];
  const failed = counts[group.provider === "openai" ? "failed" : "failedRequestCount"];
  return {
    status,
    remoteState: state,
    outputFileIds,
    processed:
      completed !== undefined || failed !== undefined ? Number(completed ?? 0) + Number(failed ?? 0) : undefined,
    failed: failed === undefined ? undefined : Number(failed),
    error: raw.error || raw.errors ? sanitizeDiagnostic(JSON.stringify(raw.error ?? raw.errors)) : undefined,
  };
}

async function consumeResult(group: CloudBatchGroup, taskIds: Set<string>, raw: Json) {
  const row = object(raw);
  const id = string(group.provider === "openai" ? row.custom_id : row.key);
  if (!id || !taskIds.has(id)) throw new Error(b("unknownRequest"));
  const task = getState().tasks.find((entry) => entry.id === id);
  if (!task || task.historyDeletedAt || task.status === "completed") return;
  const response = object(row.response);
  const failure =
    row.error || (group.provider === "openai" && Number(response.status_code) >= 400 ? response.body : undefined);
  if (failure) {
    await saveTask({
      ...task,
      status: "failed",
      error: sanitizeDiagnostic(JSON.stringify(failure)),
      awaitingResults: false,
    });
    return;
  }
  const body = group.provider === "openai" ? response.body : row.response;
  if (!body) throw new Error(b("incomplete"));
  const images = imageResults(group.provider === "openai" ? "images" : "gemini", body);
  if (!images.length) {
    await saveTask({ ...task, status: "failed", error: b("noImages"), awaitingResults: false });
    return;
  }
  await receive(task, images, true, responseMetadata(body));
}

async function retrieveGroup(batchId: string, group: CloudBatchGroup, finish: CloudBatchStatus) {
  const taskIds = new Set(group.taskIds);
  await patchGroup(batchId, group.id, { status: "retrieving", error: undefined });
  for (const [index, fileId] of (group.outputFileIds ?? []).entries()) {
    const id = `${group.id}-output-${index}`;
    await native("batch_output_fetch", { id, provider: group.provider, fileId });
    let offset = 0;
    for (;;) {
      const next = await native<{ line: string; offset: number }>("batch_output_read", { id, offset });
      if (next.offset === offset) break;
      offset = next.offset;
      if (next.line.trim()) await consumeResult(group, taskIds, JSON.parse(next.line) as Json);
    }
  }
  const tasks = getState().tasks.filter((task) => taskIds.has(task.id));
  for (const task of tasks) {
    if (task.results.some((result) => !result.assetId && result.url)) await downloadResults(structuredClone(task));
    else if (["queued", "generating", "submitting", "submission-unknown", "retrieval-failed"].includes(task.status)) {
      if (finish === "completed") throw new Error(b("incomplete"));
      await saveTask({
        ...task,
        status: finish === "cancelled" ? "cancelled" : "failed",
        error: group.error ?? b(finish as "failed" | "cancelled" | "expired"),
        awaitingResults: false,
      });
    }
  }
  await patchGroup(batchId, group.id, { status: finish, error: undefined });
  if (
    getState()
      .tasks.filter((task) => taskIds.has(task.id))
      .every((task) => !["download-failed", "retrieval-failed"].includes(task.status))
  )
    await native("batch_files_remove", {
      ids: [group.id, ...(group.outputFileIds ?? []).map((_, index) => `${group.id}-output-${index}`)],
    }).catch(() => {});
}

async function checkGroup(batchId: string, group: CloudBatchGroup) {
  if (!group.remoteId) return;
  const snapshot = remoteSnapshot(
    group,
    await send(
      api(group, group.provider === "openai" ? `batches/${encodeURIComponent(group.remoteId)}` : group.remoteId),
    ),
  );
  await patchGroup(batchId, group.id, {
    ...snapshot,
    status: terminal.has(snapshot.status) ? "retrieving" : snapshot.status,
  });
  const current = { ...group, ...snapshot };
  if (terminal.has(snapshot.status)) await retrieveGroup(batchId, current, snapshot.status);
  else await groupTasks(current, "generating");
}

function schedule() {
  if (timer) clearTimeout(timer);
  if (!getState().batches.some((batch) => batch.cloud?.groups.some((group) => remoteActive.has(group.status)))) return;
  timer = setTimeout(() => {
    timer = undefined;
    for (const batch of getState().batches)
      if (batch.cloud?.groups.some((group) => remoteActive.has(group.status))) void runBatch(batch.id).catch(() => {});
  }, 30_000);
}

function runBatch(batchId: string, submit = false, retry = false): Promise<void> {
  const existing = busy.get(batchId);
  if (existing) return existing;
  const operation = (async () => {
    const ids =
      getState()
        .batches.find((batch) => batch.id === batchId)
        ?.cloud?.groups.map((group) => group.id) ?? [];
    for (const id of ids) {
      let group = groupById(batchId, id)!;
      try {
        if (
          (submit && ["prepared", "uploading"].includes(group.status)) ||
          (retry && group.status === "submission-failed")
        )
          await submitGroup(batchId, group);
        group = groupById(batchId, id)!;
        if (group.status === "submission-unknown") await reconcile(batchId, group);
        group = groupById(batchId, id)!;
        if (remoteActive.has(group.status) || ["retrieving", "retrieval-failed"].includes(group.status))
          await checkGroup(batchId, group);
        else if (terminal.has(group.status)) {
          const pending = getState().tasks.filter(
            (task) =>
              task.cloudGroupId === id &&
              ["queued", "generating", "downloading", "download-failed", "retrieval-failed"].includes(task.status),
          );
          if (pending.some((task) => !task.results.length)) await checkGroup(batchId, group);
          else for (const task of pending) await downloadResults(structuredClone(task));
        }
      } catch (error) {
        const latest = groupById(batchId, id)!;
        const status = ["submitting", "submission-unknown"].includes(latest.status)
          ? "submission-unknown"
          : !latest.remoteId && ["prepared", "uploading", "submission-failed"].includes(latest.status)
            ? "submission-failed"
            : "retrieval-failed";
        await patchGroup(batchId, id, {
          status,
          error: sanitizeDiagnostic(error),
        });
        if (status === "retrieval-failed" && remoteTerminal.has(latest.remoteState ?? "")) {
          const taskIds = new Set(latest.taskIds);
          await mutateTasks((tasks) => ({
            tasks: tasks.map((task) =>
              taskIds.has(task.id) &&
              ["queued", "submitting", "submission-unknown", "generating", "downloading"].includes(task.status)
                ? { ...task, status: "retrieval-failed", error: sanitizeDiagnostic(error), updatedAt: Date.now() }
                : task,
            ),
            result: undefined,
          }));
        }
        if (status !== "retrieval-failed")
          await groupTasks(
            latest,
            status === "submission-failed" ? "failed" : "submission-unknown",
            sanitizeDiagnostic(error),
          );
      }
    }
  })().finally(() => {
    busy.delete(batchId);
    updateState({ batches: [...getState().batches] });
    schedule();
  });
  busy.set(batchId, operation);
  updateState({ batches: [...getState().batches] });
  return operation;
}

export const resumeCloudBatch = (id: string) => runBatch(id);
export const retryCloudSubmission = (id: string) => runBatch(id, true, true);

export async function cancelCloudBatch(id: string) {
  if (busy.has(id)) return;
  const operation = (async () => {
    for (const source of getState().batches.find((batch) => batch.id === id)?.cloud?.groups ?? []) {
      if (["prepared", "submission-failed", "uploading"].includes(source.status)) {
        await patchGroup(id, source.id, { status: "cancelled" });
        await groupTasks(source, "cancelled");
      } else if (source.remoteId && remoteActive.has(source.status)) {
        await send(
          api(
            source,
            source.provider === "openai"
              ? `batches/${encodeURIComponent(source.remoteId)}/cancel`
              : `${source.remoteId}:cancel`,
            {},
          ),
        );
        await patchGroup(id, source.id, { status: "cancelling" });
      }
    }
  })().finally(() => {
    busy.delete(id);
    updateState({ batches: [...getState().batches] });
    schedule();
  });
  busy.set(id, operation);
  updateState({ batches: [...getState().batches] });
  return operation;
}

export async function resumeCloudJobs() {
  for (const batch of getState().batches) {
    if (!batch.cloud) continue;
    for (const group of batch.cloud.groups) {
      if (group.status === "submitting") {
        await patchGroup(batch.id, group.id, { status: "submission-unknown" });
        await groupTasks(group, "submission-unknown");
      }
    }
    if (
      batch.cloud.groups.some((group) => !terminal.has(group.status)) ||
      getState().tasks.some(
        (task) =>
          task.batchId === batch.id &&
          ["downloading", "download-failed", "retrieval-failed", "generating"].includes(task.status),
      )
    )
      void runBatch(batch.id, true).catch(() => {});
  }
  schedule();
}

export function failedDrafts(batch: GenerationBatch, tasks: GenerationTask[]): BatchDraftItem[] {
  return (batch.cloud?.items ?? []).flatMap((item) => {
    const count = tasks.filter(
      (task) =>
        task.draftItemId === item.id && task.status === "failed" && groupById(batch.id, task.cloudGroupId!)?.remoteId,
    ).length;
    return count ? [{ ...item, draft: { ...item.draft, requestCount: count } }] : [];
  });
}

export async function deleteCloudBatch(id: string) {
  const batch = getState().batches.find((entry) => entry.id === id);
  if (!batch || !canDeleteCloudBatch(batch)) return;
  const { deleteHistory } = await import("../services/history");
  const result = await deleteHistory(batch.taskIds);
  if (result.skipped) return;
  await commit([{ collection: "batches", id }]);
  updateState({ batches: getState().batches.filter((entry) => entry.id !== id) });
  await native("batch_files_remove", {
    ids: batch.cloud!.groups.flatMap((group) => [
      group.id,
      ...(group.outputFileIds ?? []).map((_, index) => `${group.id}-output-${index}`),
    ]),
  });
}
