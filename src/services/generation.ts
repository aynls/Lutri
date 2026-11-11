import type {
  GalleryEntry,
  GenerationBatch,
  GenerationDraft,
  GenerationResult,
  GenerationTask,
  Parameters,
} from "../domain/types";
import { c } from "../create/messages";
import { t } from "../i18n";
import { compilePrompt } from "../domain/references";
import { validateDraft } from "../models/validateDraft";
import { combinationById } from "../models";
import { maxRequestCount, values } from "../models/shared";
import { HttpError, array, object, send } from "../providers/transport";
import { imageResults, responseMetadata, type RemoteImage } from "../providers/results";
import { poll, recoveryFrom } from "../providers/recovery";
import { runwareResponse } from "../providers/runware";
import { assetData, assetExists, downloadAsset, native } from "./native";
import { changeFeed, getState, refreshGallery, saveTask, updateState, mutateTasks } from "./store";
import { prepareGenerationInputs } from "../create/prepareInputs";
import { resolveParameterAssets, storeParameterAssets, parameterAssetIds } from "./parameterAssets";
import { sanitizeDiagnostic } from "../providers/diagnostics";
import { deletingTaskIds } from "./taskLocks";
import { submittedPrompt } from "../providers/submittedPrompt";
import { orderedCreationDraft, validateCreation } from "../models/creation";
import { resolveOutputs, type OutputOptions } from "./outputs";
import { validateLayerSources } from "../providers/layers";

const running = new Set<string>();
const providerBlockedUntil = new Map<string, number>();
const waiting = new Map<
  string,
  { initial: boolean; resolve: () => void; reject: (reason: unknown) => void; promise: Promise<void> }
>();
let wake: ReturnType<typeof setTimeout> | undefined;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let submissions: Promise<unknown> = Promise.resolve();

async function validateLayerDirectory(draft: GenerationDraft) {
  if (draft.parameters.layer_decomposition !== true) return;
  if (typeof draft.layerOutputDirectory !== "string" || !draft.layerOutputDirectory.trim())
    throw new Error(c("layerDirectoryRequired"));
  if (!(await native<boolean>("layer_directory_available", { directory: draft.layerOutputDirectory })))
    throw new Error(c("layerDirectoryUnavailable"));
}

async function stageImage(image: RemoteImage): Promise<RemoteImage> {
  const staged = new Map<string, string>();
  const stage = async (url: string | undefined) => {
    if (!url?.startsWith("data:")) return url;
    if (!staged.has(url)) staged.set(url, await native<string>("result_stage", { dataUrl: url }));
    return staged.get(url)!;
  };
  const url = await stage(image.url);
  const layerSources = [];
  for (const source of image.layerSources ?? []) layerSources.push({ ...source, url: (await stage(source.url))! });
  return { ...image, url, ...(image.layerSources ? { layerSources } : {}) };
}

function layerError(error: unknown) {
  const messages = {
    layer_directory_unavailable: "layerDirectoryUnavailable",
    layer_output_conflict: "layerOutputConflict",
    invalid_layer_result: "invalidLayerResult",
    invalid_layer_bounds: "invalidLayerBounds",
    psd_size_limit: "psdSizeLimit",
  } as const;
  const key = messages[String(error) as keyof typeof messages];
  return key ? c(key) : sanitizeDiagnostic(error);
}

export function submitBatch(
  draft: GenerationDraft,
  origin: "manual" | "mcp" = "manual",
  options: OutputOptions = {},
  mcpRequest?: GenerationBatch["mcpRequest"],
): Promise<GenerationBatch> {
  const snapshot = structuredClone(draft);
  try {
    const output = resolveOutputs("generation", options);
    snapshot.outputDirectory = output.directory;
  } catch (error) {
    return Promise.reject(error);
  }
  const result = submissions.catch(() => {}).then(() => createBatch(snapshot, origin, mcpRequest));
  submissions = result;
  return result;
}

async function createBatch(
  draft: GenerationDraft,
  origin: "manual" | "mcp" = "manual",
  mcpRequest?: GenerationBatch["mcpRequest"],
) {
  const combination = combinationById(draft.combinationId);
  const errors = validateDraft(draft, maxRequestCount(getState().preferences));
  if (!draft.prompt.trim() && !draft.parameters.layer_decomposition && !draft.parameters.structured_prompt)
    errors.push("prompt");
  if (errors.length) throw new Error(errors.join("\n"));
  await validateLayerDirectory(draft);
  if (!(await native<boolean>("credential_present", { provider: combination.provider })))
    throw new Error(`${combination.provider}: API key`);
  draft.parameters = (await storeParameterAssets(draft.parameters)) as Parameters;
  await native("assets_publish", {
    ids: [...draft.references.map((reference) => reference.assetId), ...parameterAssetIds(draft.parameters)],
  });
  const now = Date.now();
  const batch: GenerationBatch = { id: crypto.randomUUID(), createdAt: now, origin, taskIds: [], mcpRequest };
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
  void refreshGallery().catch(() => {});
  for (const task of tasks) void execute(task.id, true).catch(() => {});
  return batch;
}

export async function receive(
  currentTask: GenerationTask,
  images: RemoteImage[],
  complete = true,
  metadata?: Parameters,
  failures?: string[],
): Promise<void> {
  const task = structuredClone(currentTask);
  if (complete && task.draft.parameters.layer_decomposition === true && !images.length && !failures?.length)
    throw new Error(c("invalidLayerResult"));
  task.awaitingResults = !complete;
  const previousResults = [...task.results];
  const remainingFailures = failures?.map(sanitizeDiagnostic);
  if (remainingFailures) {
    task.results = task.results.filter((result) => {
      if (!result.remoteId?.startsWith("runware:error:")) return true;
      const index = remainingFailures.indexOf(result.error ?? "");
      if (index < 0) return false;
      remainingFailures.splice(index, 1);
      return true;
    });
  }
  const removedCount = previousResults.length - task.results.length;
  for (const [index, received] of images.entries()) {
    const image =
      task.draft.parameters.layer_decomposition === true && !received.layerSources && !received.error
        ? { ...received, url: undefined, error: c("invalidLayerResult") }
        : received;
    if (!complete && (image.layerSources || task.draft.parameters.layer_decomposition === true)) continue;
    const remoteId = image.remoteId ?? `result:${index}`;
    const existing = task.results.find((result) => result.remoteId === remoteId);
    if (existing) {
      // A later snapshot may renew an expiring result URL.
      if (!existing.assetId && image.url && !image.url.startsWith("data:") && !image.layerSources) {
        existing.url = image.url;
        existing.mediaType = image.mediaType ?? existing.mediaType;
      }
      continue;
    }
    const staged = await stageImage(image);
    task.results.push({
      id: crypto.randomUUID(),
      remoteId,
      index: task.results.length,
      url: staged.url,
      layerSources: staged.layerSources,
      ...(staged.layerSources ? { layerDelivery: { status: "pending" as const } } : {}),
      mediaType: image.mediaType,
      status: image.error ? ("failed" as const) : ("pending" as const),
      error: image.error ? sanitizeDiagnostic(image.error) : undefined,
      metadata: image.metadata,
    });
  }
  for (const error of remainingFailures ?? []) {
    const id = crypto.randomUUID();
    task.results.push({ id, remoteId: `runware:error:${id}`, index: task.results.length, status: "failed", error });
  }
  task.results.forEach((result, index) => {
    result.index = index;
  });
  task.status = "downloading";
  const publishedThrough =
    (task.feedPublishedThrough ?? combinationById(task.draft.combinationId).outputCount(task.draft.parameters) - 1) -
    removedCount;
  task.feedPublishedThrough = Math.max(publishedThrough, task.results.length - 1);
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
  }
  // Publish extra results only if the user has retained at least one slot for this task.
  if (task.cloudGroupId) await saveTask(task);
  else
    await changeFeed(
      (feed) => {
        const current = feed.filter((slot) => slot.taskId === task.id);
        if (!current.length) return feed;
        // Keep cards attached to the same successful result when an anonymous error
        // disappears from a newer snapshot. Shift only unfilled placeholders.
        const indices = new Map(task.results.map((result) => [result.id, result.index]));
        const retained = feed.flatMap((slot) => {
          if (slot.taskId !== task.id) return [slot];
          const previous = previousResults[slot.resultIndex];
          const index = previous ? indices.get(previous.id) : slot.resultIndex - removedCount;
          if (index === undefined || (complete && index >= task.results.length)) return [];
          return [{ ...slot, resultIndex: index }];
        });
        const extra = task.results
          .filter((result) => result.index > publishedThrough)
          .map((result) => ({ id: crypto.randomUUID(), taskId: task.id, resultIndex: result.index }));
        return [...extra, ...retained];
      },
      [],
      task,
    );
  Object.assign(currentTask, task);
  await downloadResults(currentTask);
}

export async function downloadResults(task: GenerationTask) {
  for (const result of task.results) {
    if ((result.assetId && !result.layerSources) || (!result.url && !result.layerSources)) continue;
    result.status = "downloading";
    await saveTask({ ...task, results: [...task.results] });
    try {
      const layerSources = result.layerSources;
      const combination = combinationById(task.draft.combinationId);
      let asset: GalleryEntry;
      if (layerSources) {
        const parameters = values(combination.fields, task.draft);
        const maxLayers = Math.min(
          combination.layerDecomposition?.maxLayers ?? 0,
          Number(
            parameters.max_layers ??
              combination.fields.find((field) => field.key === "max_layers")?.default ??
              combination.layerDecomposition?.maxLayers ??
              0,
          ),
        );
        const invalid = validateLayerSources(layerSources, maxLayers);
        if (invalid) throw invalid;
        const saved = await native<{ asset: GalleryEntry; delivery: NonNullable<GenerationResult["layerDelivery"]> }>(
          "layer_result_save",
          {
            directory: task.draft.layerOutputDirectory ?? "",
            resultId: result.id,
            sources: layerSources,
            maxLayers,
          },
        );
        asset = saved.asset;
        result.layerDelivery = saved.delivery;
        if (result.layerDelivery.error) result.layerDelivery.error = layerError(result.layerDelivery.error);
      } else asset = await downloadAsset(result.url!, result.id);
      result.assetId = asset.asset.id;
      result.mediaType = asset.asset.mediaType;
      result.status = "saved";
      delete result.error;
      if (layerSources && result.layerDelivery?.status === "completed") {
        const urls = [...new Set(layerSources.map((source) => source.url).filter((url) => url.startsWith("staged:")))];
        delete result.layerSources;
        delete result.url;
        await saveTask({ ...task, results: [...task.results] });
        if (urls.length) await native("result_discard", { urls }).catch(() => {});
      }
      try {
        await native("asset_provenance", {
          id: asset.asset.id,
          provenance: { kind: "generation", model: combination.model, provider: combination.provider, taskId: task.id },
        });
      } catch (error) {
        result.metadata = { ...result.metadata, provenance_error: sanitizeDiagnostic(error) };
      }
      try {
        if (task.draft.outputDirectory)
          await native("asset_auto_export", { id: asset.asset.id, directory: task.draft.outputDirectory });
        delete result.exportError;
      } catch (error) {
        result.exportError = sanitizeDiagnostic(error);
      }
      try {
        await refreshGallery([asset.asset.id]);
      } catch (error) {
        result.metadata = { ...result.metadata, gallery_refresh_error: sanitizeDiagnostic(error) };
      }
    } catch (error) {
      result.status = result.assetId ? "saved" : "failed";
      result.error = result.layerSources ? layerError(error) : sanitizeDiagnostic(error);
      if (result.layerSources)
        result.layerDelivery = { ...result.layerDelivery, status: "failed", error: result.error };
    }
    await saveTask({ ...task, results: [...task.results] });
  }
  task.status = task.awaitingResults
    ? "generating"
    : task.results.every(
          (result) =>
            result.status === "saved" && (!result.layerDelivery || result.layerDelivery.status === "completed"),
        )
      ? "completed"
      : task.results.some((result) => result.layerSources || (result.url && !result.assetId))
        ? "download-failed"
        : "failed";
  task.updatedAt = Date.now();
  await saveTask({ ...task });
}

/** Deduplicate tasks and respect provider cooldowns without limiting concurrency. */
export function execute(id: string, initial = false): Promise<void> {
  if (deletingTaskIds.has(id)) return Promise.resolve();
  const existing = waiting.get(id);
  if (existing) return existing.promise;
  const task = getState().tasks.find((entry) => entry.id === id);
  if (task?.cloudGroupId)
    return import("../batch/service").then(({ resumeCloudBatch }) => resumeCloudBatch(task.batchId));
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
    running.add(id);
    void runTask(id, entry.initial)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        waiting.delete(id);
        running.delete(id);
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
        if (task.cloudGroupId || task.batchId !== batchId || task.status !== "queued") return task;
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
    if (!saved?.draft.outputDirectory) throw new Error(t("saveDirectoryRequired"));
    await native("asset_auto_export", { id: result.assetId, directory: saved.draft.outputDirectory });
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
    if (task.results.some((result) => result.url || result.layerSources || result.assetId) && !task.awaitingResults) {
      await downloadResults(task);
      if (task.status === "download-failed" && task.recovery && task.results.some((result) => !result.assetId)) {
        const refreshed = await poll(combination, task.recovery);
        if (refreshed.done) {
          for (const result of task.results) {
            const remote = refreshed.images.find(
              (image, index) => (image.remoteId ?? `result:${index}`) === result.remoteId,
            );
            if (!result.assetId && remote && (remote.url || remote.layerSources)) {
              const previous = [result.url, ...(result.layerSources ?? []).map((source) => source.url)].filter(
                (url): url is string => !!url?.startsWith("staged:"),
              );
              const staged = await stageImage(remote);
              result.url = staged.url;
              result.layerSources = staged.layerSources;
              await saveTask({ ...task, results: [...task.results] });
              if (previous.length) await native("result_discard", { urls: [...new Set(previous)] }).catch(() => {});
            }
          }
          await receive(task, refreshed.images, true, refreshed.metadata, refreshed.failures);
        }
      }
      return;
    }
    if (initial && task.status === "queued") {
      await validateLayerDirectory(task.draft);
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
      const creationErrors = validateCreation(executionDraft, combination);
      if (executionDraft.parameters.layer_decomposition === true)
        creationErrors.push(...validateDraft(executionDraft, maxRequestCount(getState().preferences)));
      if (creationErrors.length) throw new Error(creationErrors.join("\n"));
      if (
        executionDraft.mask &&
        orderedCreationDraft(executionDraft, combination).references[0]?.id !== executionDraft.mask.referenceId
      )
        throw new Error("Mask must be bound to the first input image.");
      const prepared = await prepareGenerationInputs(executionDraft, combination);
      const compiledPrompt = compilePrompt(prepared.draft, prepared.draft.references);
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
          if (error.status >= 400 && error.status < 500) delete task.recovery;
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
      if (combination.protocol === "runware") {
        const body = object(response);
        if (
          body.error ||
          (!array(body.data).length &&
            array(body.errors).length > 0 &&
            !array(body.errors).some((entry) => object(entry).taskUUID === task.id))
        ) {
          delete task.recovery;
          delete task.providerTaskId;
        }
        const result = runwareResponse(response, task.id, "submit");
        await receive(task, result.images, result.done, result.metadata, result.failures);
        if (result.done) return;
      } else {
        const results = imageResults(combination.protocol, response);
        if (results.length) {
          await receive(task, results, true, responseMetadata(response));
          return;
        }
      }
      task.status = "generating";
      await saveTask({ ...task });
    }
    if (!task.recovery) throw new Error("Original task cannot be queried; no new request was sent.");
    task.awaitingResults = true;
    task.status = "generating";
    await saveTask({ ...task });
    let interval = 2000;
    const deadline = Date.now() + 360000;
    for (;;) {
      const result = await poll(combination, task.recovery);
      if (result.images.length || result.failures !== undefined || result.done)
        await receive(task, result.images, result.done, result.metadata, result.failures);
      if (result.done) return;
      if (Date.now() >= deadline) throw new Error("Timed out after 360s waiting for the provider.");
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
      task.status =
        task.awaitingResults && task.recovery
          ? "retrieval-failed"
          : task.results.some((result) => (result.url || result.layerSources) && !result.assetId)
            ? "download-failed"
            : "failed";
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
    if (saved.cloudGroupId) continue;
    if (saved.status === "submitting") await saveTask({ ...saved, status: "submission-unknown" });
    else if (saved.status === "queued") void execute(saved.id, true).catch(() => {});
    else if (saved.status === "generating" || saved.status === "downloading") void execute(saved.id).catch(() => {});
  }
  const { resumeCloudJobs } = await import("../batch/service");
  await resumeCloudJobs();
}
