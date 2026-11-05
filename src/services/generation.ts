import type { GenerationBatch, GenerationDraft, GenerationTask, Parameters } from "../domain/types";
import { compilePrompt } from "../domain/references";
import { validateDraft } from "../models/validateDraft";
import { combinationById } from "../models";
import { HttpError, send } from "../providers/transport";
import { imageResults, responseMetadata, type RemoteImage } from "../providers/results";
import { poll, recoveryFrom } from "../providers/recovery";
import { assetData, assetExists, downloadAsset, native } from "./native";
import { changeFeed, getState, refreshGallery, saveTask, updateState } from "./store";
import { prepareMask } from "./masks";
import { resolveParameterAssets, storeParameterAssets } from "./parameterAssets";

const running = new Set<string>();
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
  for (const task of tasks) void execute(task.id, true);
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
      error: image.error,
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
    task.metadata = (await storeParameterAssets(metadata, "", known)) as Parameters;
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
      await refreshGallery();
    } catch (error) {
      result.status = "failed";
      result.error = String(error);
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

export async function execute(id: string, initial = false) {
  if (running.has(id)) return;
  const saved = getState().tasks.find((task) => task.id === id);
  if (!saved) return;
  const task = structuredClone(saved),
    combination = combinationById(task.draft.combinationId);
  running.add(id);
  try {
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
      const images = await Promise.all(references.map((reference) => assetData(reference.assetId)));
      if (executionDraft.mask && executionDraft.references[0]?.id !== executionDraft.mask.referenceId)
        throw new Error("Mask must be bound to the first input image.");
      const mask =
        executionDraft.mask && combination.mask
          ? await prepareMask(await assetData(executionDraft.mask.assetId), combination.mask)
          : undefined;
      const compiled = combination.compile({
        draft: executionDraft,
        prompt: compilePrompt(task.draft, references),
        images,
        mask,
        taskId: task.id,
        configuration: getState().preferences.providers[combination.provider] ?? {},
      });
      task.status = "submitting";
      task.recovery = combination.initialRecovery?.(task.id);
      await saveTask({ ...task });
      let response;
      try {
        response = await send(compiled);
      } catch (error) {
        task.status =
          error instanceof HttpError && error.status >= 400 && error.status < 500 ? "failed" : "submission-unknown";
        throw error;
      }
      task.recovery = recoveryFrom(combination, response, task.id);
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
    if (task.status !== "submission-unknown" && task.status !== "failed")
      task.status = task.results.length ? "download-failed" : "failed";
    task.error = String(error);
    task.updatedAt = Date.now();
    await saveTask({ ...task });
  } finally {
    running.delete(id);
  }
}

export async function resumeTasks() {
  for (const saved of getState().tasks) {
    if (saved.status === "submitting") await saveTask({ ...saved, status: "submission-unknown" });
    else if (saved.status === "queued") void execute(saved.id, true);
    else if (saved.status === "generating" || saved.status === "downloading") void execute(saved.id);
  }
}
