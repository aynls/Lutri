import { z } from "zod";
import type { GenerationDraft, Parameters } from "../../domain/types";
import { combinationById } from "../../models";
import { initialDraft, maxRequestCount } from "../../models/shared";
import { validateDraft } from "../../models/validateDraft";
import { batchRequestLimit, validateBatchDraft } from "../../batch/capabilities";
import { missingPromptReferences } from "../../domain/references";
import { assetExists, native } from "../native";
import { getState } from "../store";
import { resolveOutputs } from "../outputs";
import { identifier, McpError } from "./contracts";
import type { FieldDefinition, ModelCombination } from "../../models/types";

const coordinate = z.number().min(0).max(1000);
const rectangle = z
  .tuple([coordinate, coordinate, coordinate, coordinate])
  .describe("[top, left, bottom, right] in normalized 0–1000 coordinates; top < bottom and left < right.");
export const outputFields = {
  autoSave: z.boolean().optional().describe("Save an additional copy. Defaults to this creation mode's page setting."),
  destination: z
    .string()
    .min(1)
    .optional()
    .describe("Existing absolute folder. Enables autoSave unless autoSave is false."),
};
export const creationSchema = z.strictObject({
  combinationId: identifier.describe("Model/provider combination from list_models."),
  prompt: z.string().optional().describe("Use [[ref:REFERENCE_ID]] to refer to an image by its reference id."),
  creationMode: z
    .enum(["generate", "edit"])
    .optional()
    .describe("For models with creation control; defaults to generate. Edit requires editTargetId."),
  editTargetId: identifier.optional().describe("The references[].id of the image to edit, not its assetId."),
  parameters: z
    .record(z.string(), z.json())
    .optional()
    .describe("Model parameters from get_model; supplied values override model defaults."),
  requestCount: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Number of independent requests. Distinct from the model's per-request image count. Limits are returned by get_model.",
    ),
  references: z
    .array(
      z.strictObject({
        id: identifier
          .regex(/^[A-Za-z0-9_-]+$/)
          .describe("Unique reference identity used by the prompt, regions, mask and editTargetId."),
        assetId: identifier,
        name: z.string().optional(),
      }),
    )
    .optional()
    .describe("Ordered reference images. Use import_image or an existing result/gallery asset ID."),
  regions: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[A-Za-z0-9_]+$/),
        description: z.string(),
        operation: z.enum(["place", "move", "anchor", "remove"]).optional(),
        referenceId: identifier.optional(),
        source: rectangle.optional(),
        target: rectangle.optional(),
      }),
    )
    .optional()
    .describe(
      "Model-dependent regions. Source rectangles require referenceId; each region needs target or source plus referenceId.",
    ),
  mask: z
    .strictObject({ assetId: identifier, referenceId: identifier })
    .optional()
    .describe("Mask asset and the reference id it applies to. Mask semantics are returned by get_model."),
  inputPreparation: z
    .strictObject({ maxEdge: z.number().int().min(256).max(8192) })
    .optional()
    .describe("Resize request copies to this longest edge; stored originals remain unchanged."),
  layerOutputDirectory: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Existing absolute folder required for layer_decomposition=true; delivers composite.png and layers.psd in a Lutri-<result ID> subfolder.",
    ),
});
export type CreationInput = z.infer<typeof creationSchema>;
export const executionMode = z.enum(["regular", "batch"]);
export type ExecutionMode = z.infer<typeof executionMode>;

function fieldSchema(field: FieldDefinition): z.ZodType {
  let schema: z.ZodType;
  if (field.kind === "number" || field.kind === "seed") {
    let number = z.number();
    if (field.integer !== false) number = number.int();
    if (field.min !== undefined) number = number.min(field.min);
    if (field.max !== undefined) number = number.max(field.max);
    if (field.step && field.step >= 1) number = number.multipleOf(field.step);
    schema = number;
  } else if (field.kind === "select" && field.options?.length) {
    schema = z.literal(field.options.map((option) => (field.integer ? Number(option) : option)));
  } else if (field.kind === "toggle") schema = z.boolean();
  else if (field.kind === "json") schema = z.json();
  else schema = field.maxLength ? z.string().max(field.maxLength) : z.string();
  return z
    .union([schema, z.null(), z.literal("")])
    .optional()
    .describe(field.label.en);
}

export function parametersSchema(combination: ModelCombination) {
  return z.strictObject(Object.fromEntries(combination.fields.map((field) => [field.key, fieldSchema(field)])));
}

export function modelById(id: string) {
  try {
    return combinationById(id);
  } catch {
    throw new McpError("MODEL_NOT_FOUND", `Unknown model/provider combination: ${id}`);
  }
}

export function creationDraft(input: CreationInput): GenerationDraft {
  const combination = modelById(input.combinationId);
  const base = initialDraft(combination);
  return {
    ...base,
    prompt: input.prompt ?? base.prompt,
    creationMode: input.creationMode ?? base.creationMode,
    editTargetId: input.editTargetId,
    parameters: { ...base.parameters, ...input.parameters } as Parameters,
    requestCount: input.requestCount ?? 1,
    references: (input.references ?? []).map((reference) => ({
      ...reference,
      name: reference.name ?? reference.id,
      purpose: "reference",
    })),
    regions: input.regions ?? [],
    mask: input.mask,
    inputPreparation: input.inputPreparation ? { version: 1, ...input.inputPreparation } : undefined,
    layerOutputDirectory: input.layerOutputDirectory,
  };
}

export function creationIssues(input: CreationInput, mode: ExecutionMode): string[] {
  const parameters = parametersSchema(modelById(input.combinationId)).safeParse(input.parameters ?? {});
  if (!parameters.success)
    return parameters.error.issues.map(({ path, message }) => `parameters.${path.join(".")}: ${message}`);
  const draft = creationDraft(input);
  const combination = modelById(input.combinationId);
  const issues =
    mode === "batch" ? validateBatchDraft(draft) : validateDraft(draft, maxRequestCount(getState().preferences));
  if (
    mode === "regular" &&
    !draft.prompt.trim() &&
    !draft.parameters.layer_decomposition &&
    !draft.parameters.structured_prompt
  )
    issues.push("A prompt is required unless layer_decomposition or structured_prompt supplies the request.");
  const missing = missingPromptReferences(draft);
  if (missing.length) issues.push(`Unknown prompt reference IDs: ${missing.join(", ")}`);
  for (const field of combination.fields) {
    const value = input.parameters?.[field.key];
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      value !== false &&
      field.visible &&
      !field.visible(draft)
    )
      issues.push(`Parameter is unavailable for these inputs: ${field.key}`);
  }
  return [...new Set(issues)];
}

export async function checkCreation(input: CreationInput, mode: ExecutionMode) {
  const issues = creationIssues(input, mode);
  const draft = creationDraft(input);
  const ids = [
    ...new Set([
      ...draft.references.map((reference) => reference.assetId),
      ...(draft.mask ? [draft.mask.assetId] : []),
    ]),
  ];
  if (
    draft.parameters.layer_decomposition === true &&
    draft.layerOutputDirectory &&
    !(await native<boolean>("layer_directory_available", { directory: draft.layerOutputDirectory }))
  )
    issues.push("layerOutputDirectory must be an existing absolute folder.");
  const assets = await Promise.all(ids.map(async (id) => ({ assetId: id, available: await assetExists(id) })));
  const credentialConfigured = await native<boolean>("credential_present", {
    provider: modelById(input.combinationId).provider,
  });
  return {
    draft,
    issues,
    assets,
    credentialConfigured,
    requestLimit: mode === "batch" ? batchRequestLimit : maxRequestCount(getState().preferences),
  };
}

export async function requireCreation(input: CreationInput, mode: ExecutionMode) {
  const checked = await checkCreation(input, mode);
  if (checked.issues.length)
    throw new McpError("INVALID_CREATION", "Correct the creation request before submitting.", checked.issues);
  const missing = checked.assets.filter((asset) => !asset.available);
  if (missing.length) throw new McpError("ASSET_UNAVAILABLE", "Reference or mask images are missing.", missing);
  if (!checked.credentialConfigured)
    throw new McpError("CREDENTIAL_REQUIRED", "Configure this provider in Lutri Settings before submitting.");
  return checked.draft;
}

export async function checkedOutput(mode: ExecutionMode, options: z.infer<z.ZodObject<typeof outputFields>>) {
  let output;
  try {
    output = resolveOutputs(mode === "batch" ? "batch" : "generation", options);
  } catch (error) {
    throw new McpError("OUTPUT_DIRECTORY_REQUIRED", String(error));
  }
  if (output.directory && !(await native<boolean>("layer_directory_available", { directory: output.directory })))
    throw new McpError("OUTPUT_DIRECTORY_UNAVAILABLE", "The output directory must be an existing absolute folder.");
  return { autoSave: !!output.directory, destination: output.directory };
}
