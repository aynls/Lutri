import { t } from "../i18n";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { GenerationDraft } from "../domain/types";
import { combinations, combinationById } from "../models";
import { initialDraft, maxRequestCount } from "../models/shared";
import { assetData, importAsset, native } from "./native";
import { execute, submitBatch, cancelBatch } from "./generation";
import { getState, refreshGallery } from "./store";

import { loadUpscaleModels, resolveUpscaleModel, noiseOptions } from "../upscale/catalog";
import { runUpscale } from "../upscale/queue";

const string = { type: "string" };
const buildTools = () => [
  {
    name: "list_models",
    description: "List model/provider combinations, fields, constraints and supported inputs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "generate",
    description:
      "Submit one generation batch. Requests and per-request output counts are distinct. Returns existing task IDs; use get_tasks to monitor and resume_task to retrieve original results.",
    inputSchema: {
      type: "object",
      properties: {
        combinationId: { ...string, enum: combinations.map((c) => c.id) },
        prompt: string,
        creationMode: {
          enum: ["generate", "edit", "auto"],
          description:
            "Only for combinations with creationControl. Generate uses references without designating a source canvas; prompt-based controls may still call an edit endpoint. Defaults to generate for new requests. Auto preserves input-driven routing.",
        },
        editTargetId: {
          ...string,
          description:
            "Reference id of the source image, required for explicit edit mode. Use a stable id in references.",
        },
        requestCount: { type: "integer", minimum: 1, maximum: maxRequestCount(getState().preferences) },
        inputPreparation: {
          type: "object",
          properties: { version: { const: 1 }, maxEdge: { type: "integer", minimum: 256, maximum: 8192 } },
          required: ["version"],
          additionalProperties: false,
        },
        parameters: { type: "object" },
        references: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: string,
              assetId: string,
              name: string,
              purpose: { enum: ["reference", "style", "subject"] },
            },
            required: ["assetId"],
          },
        },
        regions: { type: "array", items: { type: "object" } },
        mask: {
          type: "object",
          properties: { assetId: string, referenceId: string },
          required: ["assetId", "referenceId"],
        },
      },
      required: ["combinationId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_tasks",
    description:
      "List generation task summaries (status, prompt preview, saved asset IDs). Pass taskId to read one full task with original parameters for resubmission.",
    inputSchema: { type: "object", properties: { batchId: string, taskId: string }, additionalProperties: false },
  },
  {
    name: "resume_task",
    description: "Resume polling or download for an existing task. Never submits another generation request.",
    inputSchema: { type: "object", properties: { taskId: string }, required: ["taskId"], additionalProperties: false },
  },
  {
    name: "cancel_batch",
    description:
      "Cancel only requests still queued in a generation batch. Already submitted requests continue retrieving original results.",
    inputSchema: {
      type: "object",
      properties: { batchId: string },
      required: ["batchId"],
      additionalProperties: false,
    },
  },
  {
    name: "find_assets",
    description: "Find gallery assets by asset ID or source.",
    inputSchema: {
      type: "object",
      properties: { query: string, source: { enum: ["generated", "imported"] } },
      additionalProperties: false,
    },
  },
  {
    name: "get_image",
    description: "Read an image by its gallery asset ID.",
    inputSchema: {
      type: "object",
      properties: { assetId: string },
      required: ["assetId"],
      additionalProperties: false,
    },
  },
  {
    name: "import_image",
    description: "Copy a local image or Base64 data URL into reference materials and return its asset ID.",
    inputSchema: {
      type: "object",
      properties: { path: string, dataUrl: string },
      additionalProperties: false,
    },
  },
  {
    name: "upscale",
    description:
      "Run local neural super resolution on a gallery asset and wait for completion. Track or cancel a submitted jobId with get_upscale_jobs and cancel_upscale. Results do not enter generation history.",
    inputSchema: {
      type: "object",
      properties: {
        assetId: string,
        modelId: string,
        noise: { enum: noiseOptions.map((option) => option.id) },
        scale: { type: "integer", minimum: 1, maximum: 4 },
        tileSize: { type: "integer", minimum: 32, maximum: 512 },
        destination: string,
        saveToGallery: { type: "boolean" },
        jobId: string,
      },
      required: ["assetId", "modelId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_upscale_jobs",
    description: "List active local super-resolution jobs with states and jobIds for cancel_upscale.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cancel_upscale",
    description: "Cancel a queued or running local upscale job by its jobId.",
    inputSchema: { type: "object", properties: { jobId: string }, required: ["jobId"], additionalProperties: false },
  },
  {
    name: "list_upscale_models",
    description: "List installed local super-resolution models.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];
let unlisten: UnlistenFn | undefined;
export let connection: { url: string; token: string } | undefined;

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "list_models":
      return combinations.map(
        ({ id, label, provider, maxReferences, mask, regions, fields, docs, creationControl }) => ({
          id,
          label,
          provider,
          maxReferences,
          mask,
          regions,
          docs,
          creationControl,
          ...(creationControl
            ? { creationModes: ["generate", "edit", "auto"], defaultCreationMode: "generate", editTargetRequired: true }
            : {}),
          fields: fields.map(({ visible, ...field }) => ({ ...field, conditional: !!visible })),
        }),
      );
    case "generate": {
      const combination = combinationById(String(args.combinationId));
      const draft = { ...initialDraft(combination), ...args } as GenerationDraft;
      draft.references = (draft.references ?? []).map((ref) => ({
        ...ref,
        id: ref.id ?? crypto.randomUUID(),
        name: ref.name ?? t("referenceAlias"),
        purpose: ref.purpose ?? "reference",
      }));
      return submitBatch(draft, "mcp");
    }
    case "get_tasks": {
      const tasks = getState().tasks.filter(
        (task) => (!args.batchId || task.batchId === args.batchId) && (!args.taskId || task.id === args.taskId),
      );
      const task = args.taskId ? tasks[0] : undefined;
      if (args.taskId && !task) throw new Error("Task not found");
      if (task) return task;
      const preview = (text: string) => (text.length > 160 ? `${Array.from(text).slice(0, 160).join("")}…` : text);
      return tasks.map(({ id, batchId, status, createdAt, updatedAt, draft, results, error }) => ({
        taskId: id,
        batchId,
        status,
        createdAt,
        updatedAt,
        combinationId: draft.combinationId,
        requestCount: draft.requestCount,
        prompt: preview(draft.prompt),
        assetIds: results.flatMap((result) => (result.assetId ? [result.assetId] : [])),
        error,
      }));
    }
    case "resume_task": {
      const id = String(args.taskId);
      if (!getState().tasks.some((task) => task.id === id)) throw new Error("Task not found");
      void execute(id).catch(() => {});
      return { taskId: id };
    }
    case "cancel_batch": {
      const batchId = String(args.batchId);
      if (!getState().batches.some((batch) => batch.id === batchId)) throw new Error("Batch not found");
      return { batchId, cancelled: await cancelBatch(batchId) };
    }
    case "cancel_upscale":
      return {
        jobId: String(args.jobId),
        cancelled: await native<boolean>("upscale_cancel", { id: String(args.jobId) }),
      };
    case "get_upscale_jobs":
      return native("upscale_jobs");
    case "find_assets":
      return getState()
        .gallery.filter(
          (entry) =>
            (!args.source || entry.source === args.source) &&
            (!args.query || entry.asset.id.toLowerCase().includes(String(args.query).toLowerCase())),
        )
        .map(({ asset, source, addedAt, favorite, boardIds, bytes, tags, availability, provenance }) => ({
          assetId: asset.id,
          mediaType: asset.mediaType,
          width: asset.width,
          height: asset.height,
          source,
          addedAt,
          favorite,
          boardIds,
          bytes,
          tags,
          availability,
          provenance,
        }));
    case "get_image":
      return { image: await assetData(String(args.assetId)) };
    case "import_image": {
      const entry = await importAsset({
        path: typeof args.path === "string" ? args.path : undefined,
        dataUrl: typeof args.dataUrl === "string" ? args.dataUrl : undefined,
      });
      await refreshGallery();
      return entry;
    }
    case "list_upscale_models":
      return loadUpscaleModels();
    case "upscale": {
      const models = await loadUpscaleModels();
      const modelId = String(args.modelId);
      const model = models.find((entry) => entry.id === modelId);
      const scale = Number(args.scale ?? (model?.scales.includes(4) ? 4 : model?.scales[0]));
      const fileId = resolveUpscaleModel(
        models,
        modelId,
        scale,
        typeof args.noise === "string" ? args.noise : undefined,
      );
      const result = await runUpscale({
        assetId: String(args.assetId),
        modelId: fileId,
        scale,
        tileSize: Number(args.tileSize ?? 128),
        destination: typeof args.destination === "string" ? args.destination : null,
        saveToGallery: args.saveToGallery !== false,
        jobId: typeof args.jobId === "string" ? args.jobId : undefined,
      });
      await refreshGallery();
      return result;
    }
    default:
      throw new Error("Unknown tool");
  }
}

export async function startMcp(port: number) {
  unlisten = await listen<{ id: string; name: string; arguments?: Record<string, unknown> }>(
    "mcp-request",
    async ({ payload }) => {
      let result;
      try {
        const value = await dispatch(payload.name, payload.arguments ?? {});
        if (payload.name === "get_image") {
          const image = (value as { image: string }).image;
          const match = /^data:([^;]+);base64,(.*)$/s.exec(image)!;
          result = { content: [{ type: "image", mimeType: match[1], data: match[2] }] };
        } else result = { content: [{ type: "text", text: JSON.stringify(value) }] };
      } catch (error) {
        result = { isError: true, content: [{ type: "text", text: String(error) }] };
      }
      await native("mcp_reply", { id: payload.id, result });
    },
  );
  try {
    connection = await native<{ url: string; token: string }>("mcp_start", { port, tools: buildTools() });
    return connection;
  } catch (error) {
    unlisten();
    unlisten = undefined;
    throw error;
  }
}
export async function stopMcp() {
  await native("mcp_stop");
  unlisten?.();
  unlisten = undefined;
  connection = undefined;
}

export function setConnectionToken(token: string) {
  if (connection) connection = { ...connection, token };
}
