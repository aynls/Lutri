import type { GenerationBatch, GenerationDraft, GenerationTask, Parameters } from "../domain/types";
import { compilePrompt } from "../domain/references";
import { validateDraft } from "../models/validateDraft";
import { combinationById } from "../models";
import { HttpError, send } from "../providers/transport";
import { imageResults, responseMetadata, type RemoteImage } from "../providers/results";
import { poll, recoveryFrom } from "../providers/recovery";
import { assetData, assetExists, downloadAsset, native } from "./native";
import { changeFeed, getState, refreshGallery, saveTask, updateState, mutateTasks } from "./store";
import { prepareGenerationInputs } from "../create/prepareInputs";
import { resolveParameterAssets, storeParameterAssets } from "./parameterAssets";
import { sanitizeDiagnostic } from "../providers/diagnostics";
import { deletingTaskIds } from "./taskLocks";
import { submittedPrompt } from "../providers/submittedPrompt";

const running = new Set<string>();
const providerRuns = new Map<string, number>();
const providerBlockedUntil = new Map<string, number>();
const waiting = new Map<
  string,
  { initial: boolean; resolve: () => void; reject: (reason: unknown) => void; promise: Promise<void> }
>();
let wake: ReturnType<typeof setTimeout> | undefined;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let submissions: Promise<unknown> = Promise.resolve();

export function submitBatch(draft: GenerationDraft, origin: "manual" | "mcp" = "manual"): Promise<GenerationBatch> {
  const snapshot = structuredClone(draft);
  const result = submissions.catch(() => {}).then(() => createBatch(snapshot, origin));
  submissions = result;
  return result;
}

async function createBatch(draft: GenerationDraft, origin: "manual" | "mcp" = "manual") {
  const combination = combinationById(draft.combinationId);
  const errors = validateDraft(draft);
  if (!draft.prompt.trim() && !draft.parameters.layer_decomposition && !draft.parameters.structured_prompt)
    errors.push("prompt");
  if (errors.length) throw new Error(errors.join("\n"));
  if (!(await native<boolean>("credential_present", { provider: combination.provider })))
    throw new Error(`${combination.provider}: API key`);
  draft.parameters = (await storeParameterAssets(draft.parameters)) as Parameters;
  const now = Date.now();
  const batch: GenerationBatch = { id: crypto.randomUUID(), createdAt: now, origin, taskIds: [] };
  const tasks: GenerationTask[] = Array.from({ length: draft.requestCount }, () => ({
    id: crypto.randomUUID(),
    batchId: batch.id,
    createdAt: now,
    updatedAt: now,
    draft: structuredClone(draft),
    status: "queued",
    feedPublishedThrough: combination.outputCount(draft.parameters) - 1,
    results: [],
  }));
  batch.taskIds = tasks.map((task) => task.id);
  const slots = tasks.flatMap((task) =>
    Array.from({ length: combination.outputCount(draft.parameters) }, (_, resultIndex) => ({
      id: crypto.randomUUID(),
      taskId: task.id,
      resultIndex,
    })),
  );
  await changeFeed(
    (feed) => [...slots, ...feed],
    [
      { collection: "batches", id: batch.id, value: batch },
      ...tasks.map((task) => ({ collection: "tasks", id: task.id, value: task })),
    ],
  );
  updateState({ batches: [batch, ...getState().batches], tasks: [...tasks, ...getState().tasks] });
  for (const task of tasks) void execute(task.id, true).catch(() => {});
  return batch;
}

async function receive(
  task: GenerationTask,
  images: RemoteImage[],
  complete = true,
  metadata?: Parameters,
): Promise<void> {
  task.awaitingResults = !complete;
  for (const [index, image] of images.entries()) {
    const remoteId = image.remoteId ?? `result:${index}`;
    const existing = task.results.find((result) => result.remoteId === remoteId);
    if (existing) continue;
    task.results.push({
      id: crypto.randomUUID(),
      remoteId,
      index: task.results.length,
      url: image.url?.startsWith("data:") ? await native<string>("result_stage", { dataUrl: image.url }) : image.url,
      mediaType: image.mediaType,
      status: image.error ? ("failed" as const) : ("pending" as const),
      error: image.error ? sanitizeDiagnostic(image.error) : undefined,
      metadata: image.metadata,
    });
  }
  task.status = "downloading";
  const publishedThrough =
    task.feedPublishedThrough ?? combinationById(task.draft.combinationId).outputCount(task.draft.parameters) - 1;
  task.feedPublishedThrough = Math.max(publishedThrough, task.results.length - 1);
  await saveTask(task);
  if (metadata) {
    const known = new Map<string, string>();
    for (const [index, image] of images.entries()) {
      const result = task.results.find((result) => result.remoteId === (image.remoteId ?? `result:${index}`));
      if (result && image.url) known.set(image.url, result.id);
    }
    if (metadata.conversations) {
      for (const reference of task.draft.references) {
        if (await assetExists(reference.assetId)) known.set(await assetData(reference.assetId), reference.assetId);
      }
    }
    task.metadata = { ...task.metadata, ...((await storeParameterAssets(metadata, "", known)) as Parameters) };
    await saveTask(task);
  }
  // Publish extra results only if the user has retained at least one slot for this task.
  await changeFeed((feed) => {
    const current = feed.filter((slot) => slot.taskId === task.id);
    if (!current.length) return feed;
    const extra = task.results
      .filter((result) => result.index > publishedThrough)
      .map((result) => ({ id: crypto.randomUUID(), taskId: task.id, resultIndex: result.index }));
    const obsolete = complete ? current.filter((slot) => slot.resultIndex >= task.results.length) : [];
    return [...extra, ...feed.filter((slot) => !obsolete.some((o) => o.id === slot.id))];
  });
  await downloadResults(task);
}

async function downloadResults(task: GenerationTask) {
  for (const result of task.results) {
    if (result.assetId || !result.url) continue;
    result.status = "downloading";
    await saveTask({ ...task, results: [...task.results] });
    try {
      const asset = await downloadAsset(
        result.url,
        `${combinationById(task.draft.combinationId).label} · ${result.index + 1}`,
        result.id,
      );
      result.assetId = asset.asset.id;
      result.status = "saved";
      delete result.error;
      const combination = combinationById(task.draft.combinationId);
      try {
        await native("asset_provenance", {
          id: asset.asset.id,
          provenance: { kind: "generation", model: combination.model, provider: combination.provider, taskId: task.id },
        });
      } catch (error) {
        result.metadata = { ...result.metadata, provenance_error: sanitizeDiagnostic(error) };
      }
      await refreshGallery();
      try {
        await native("asset_auto_export", { id: asset.asset.id, kind: "generation" });
        delete result.exportError;
      } catch (error) {
        result.exportError = sanitizeDiagnostic(error);
      }
    } catch (error) {
      result.status = "failed";
      result.error = sanitizeDiagnostic(error);
    }
    await saveTask({ ...task, results: [...task.results] });
  }
  task.status = task.awaitingResults
    ? "generating"
    : task.results.every((result) => result.status === "saved")
      ? "completed"
      : task.results.some((result) => result.url && !result.assetId)
        ? "download-failed"
        : "failed";
  task.updatedAt = Date.now();
  await saveTask({ ...task });
}

/** Every manual, MCP and recovered task shares the same provider limits. */
export function execute(id: string, initial = false): Promise<void> {
  if (deletingTaskIds.has(id)) return Promise.resolve();
  const existing = waiting.get(id);
  if (existing) return existing.promise;
  const task = getState().tasks.find((entry) => entry.id === id);
  if (!task || task.status === "cancelled" || task.status === "completed") return Promise.resolve();
  if (task.historyDeletedAt && !getState().feed.some((slot) => slot.taskId === id)) return Promise.resolve();
  // A queued task can only be submitted through the initial queue, never by resume_task.
  if (task.status === "queued" && !initial) return Promise.resolve();
  let resolve!: () => void, reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  waiting.set(id, { initial, resolve, reject, promise });
  pump();
  updateState({ tasks: [...getState().tasks] });
  return promise;
}
export const isTaskScheduled = (id: string) => waiting.has(id);

function pump() {
  if (wake) clearTimeout(wake);
  let nextWake = Infinity;
  for (const [id, entry] of waiting) {
    if (running.has(id)) continue;
    const task = getState().tasks.find((value) => value.id === id);
    if (!task || task.status === "cancelled" || task.status === "completed") {
      waiting.delete(id);
      entry.resolve();
      continue;
    }
    const provider = combinationById(task.draft.combinationId).provider;
    const delay = (providerBlockedUntil.get(provider) ?? 0) - Date.now();
    if (delay > 0) {
      nextWake = Math.min(nextWake, delay);
      continue;
    }
    if ((providerRuns.get(provider) ?? 0) >= 2) continue;
    running.add(id);
    providerRuns.set(provider, (providerRuns.get(provider) ?? 0) + 1);
    void runTask(id, entry.initial)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        waiting.delete(id);
        running.delete(id);
        providerRuns.set(provider, Math.max(0, (providerRuns.get(provider) ?? 1) - 1));
        pump();
        updateState({ tasks: [...getState().tasks] });
      });
  }
  if (Number.isFinite(nextWake)) wake = setTimeout(pump, Math.max(1, nextWake));
}

export async function cancelBatch(batchId: string): Promise<number> {
  const count = await mutateTasks((tasks) => {
    let count = 0;
    return {
      tasks: tasks.map((task) => {
        if (task.batchId !== batchId || task.status !== "queued") return task;
        count++;
        return { ...task, status: "cancelled" as const, updatedAt: Date.now() };
      }),
      result: count,
    };
  });
  pump();
  return count;
}
export const cancelBatchQueued = cancelBatch;

export async function retryResultExport(taskId: string, resultId: string) {
  const saved = getState().tasks.find((task) => task.id === taskId);
  const result = saved?.results.find((entry) => entry.id === resultId);
  if (!result?.assetId) return;
  let error: string | undefined;
  try {
    await native("asset_auto_export", { id: result.assetId, kind: "generation" });
  } catch (value) {
    error = sanitizeDiagnostic(value);
  }
  await mutateTasks((tasks) => ({
    tasks: tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            results: task.results.map((entry) => (entry.id === resultId ? { ...entry, exportError: error } : entry)),
          }
        : task,
    ),
    result: undefined,
  }));
}

async function runTask(id: string, initial = false) {
  const saved = getState().tasks.find((task) => task.id === id);
  if (!saved) return;
  const task = structuredClone(saved),
    combination = combinationById(task.draft.combinationId);
  try {
    delete task.error;
    delete task.httpStatus;
    if (task.results.some((result) => result.url) && !task.awaitingResults) {
      await downloadResults(task);
      if (task.status === "download-failed" && task.recovery) {
        const refreshed = await poll(combination, task.recovery);
        if (refreshed.done) {
          for (const result of task.results) {
            const remote = refreshed.images[result.index];
            if (!result.assetId && remote?.url) {
              result.url = remote.url.startsWith("data:")
                ? await native<string>("result_stage", { dataUrl: remote.url })
                : remote.url;
            }
          }
          await saveTask({ ...task });
          await downloadResults(task);
        }
      }
      return;
    }
    if (initial && task.status === "queued") {
      const available = await Promise.all(
        task.draft.references.map(async (reference) => ({ reference, exists: await assetExists(reference.assetId) })),
      );
      const references = available.filter((item) => item.exists).map((item) => item.reference);
      const missingIds = new Set(available.filter((item) => !item.exists).map((item) => item.reference.id));
      const executionDraft = {
        ...task.draft,
        parameters: (await resolveParameterAssets(task.draft.parameters)) as Parameters,
        references,
        regions: task.draft.regions.filter((region) => !region.referenceId || !missingIds.has(region.referenceId)),
        mask: task.draft.mask && missingIds.has(task.draft.mask.referenceId) ? undefined : task.draft.mask,
      };
      if (executionDraft.mask && executionDraft.references[0]?.id !== executionDraft.mask.referenceId)
        throw new Error("Mask must be bound to the first input image.");
      const prepared = await prepareGenerationInputs(executionDraft, combination);
      const compiledPrompt = compilePrompt(prepared.draft, references);
      const compiled = combination.compile({
        draft: prepared.draft,
        prompt: compiledPrompt,
        images: prepared.images,
        mask: prepared.mask,
        taskId: task.id,
        configuration: getState().preferences.providers[combination.provider] ?? {},
      });
      task.compiledPrompt = submittedPrompt(compiled);
      task.submittedAt = Date.now();
      task.status = "submitting";
      task.recovery = combination.initialRecovery?.(task.id);
      const claimed = await mutateTasks((tasks) => {
        const current = tasks.find((value) => value.id === task.id);
        if (current?.status !== "queued") return { tasks, result: false };
        return { tasks: tasks.map((value) => (value.id === task.id ? structuredClone(task) : value)), result: true };
      });
      if (!claimed) return;
      let response;
      try {
        response = await send(compiled);
      } catch (error) {
        if (error instanceof HttpError) {
          task.httpStatus = error.status;
          if (error.status === 429) {
            const seconds = Number(error.retryAfter);
            const until =
              error.retryAfter && !Number.isFinite(seconds)
                ? Date.parse(error.retryAfter)
                : Date.now() + (Number.isFinite(seconds) ? seconds : 5) * 1000;
            providerBlockedUntil.set(
              combination.provider,
              Number.isFinite(until) ? Math.max(Date.now(), until) : Date.now() + 5000,
            );
          }
        }
        task.status =
          error instanceof HttpError && error.status >= 400 && error.status < 500 ? "failed" : "submission-unknown";
        throw error;
      }
      task.recovery = recoveryFrom(combination, response, task.id);
      task.providerTaskId = task.recovery?.remoteId ?? providerId(response);
      const { conversations: _conversations, ...metadata } = responseMetadata(response);
      task.metadata = { ...task.metadata, ...metadata };
      task.status = "generating";
      await saveTask({ ...task });
      const results = imageResults(combination.protocol, response);
      if (results.length && combination.protocol !== "runware") {
        await receive(task, results, true, responseMetadata(response));
        return;
      }
      task.status = "generating";
      await saveTask({ ...task });
    }
    if (!task.recovery) throw new Error("Original task cannot be queried; no new request was sent.");
    task.status = "generating";
    await saveTask({ ...task });
    let interval = 2000;
    for (;;) {
      const result = await poll(combination, task.recovery);
      if (result.images.length) await receive(task, result.images, result.done, result.metadata);
      if (result.done) return;
      task.status = "generating";
      await saveTask({ ...task });
      await pause(interval);
      interval = Math.min(10000, Math.round(interval * 1.3));
    }
  } catch (error) {
    if (getState().tasks.find((entry) => entry.id === id)?.status === "cancelled") return;
    if (error instanceof HttpError) task.httpStatus = error.status;
    if (saved.status === "submission-unknown" && !task.results.length) task.status = "submission-unknown";
    else if (task.status !== "submission-unknown" && task.status !== "failed")
      task.status = task.results.length ? "download-failed" : "failed";
    task.error = sanitizeDiagnostic(error);
    task.updatedAt = Date.now();
    await saveTask({ ...task });
  }
}

function providerId(response: import("../domain/types").Json): string | undefined {
  if (!response || typeof response !== "object" || Array.isArray(response)) return undefined;
  for (const key of ["id", "request_id", "generation_id", "responseId"])
    if (typeof response[key] === "string") return response[key];
  return undefined;
}

export async function resumeTasks() {
  for (const saved of getState().tasks) {
    if (saved.status === "submitting") await saveTask({ ...saved, status: "submission-unknown" });
    else if (saved.status === "queued") void execute(saved.id, true).catch(() => {});
    else if (saved.status === "generating" || saved.status === "downloading") void execute(saved.id).catch(() => {});
  }
}
