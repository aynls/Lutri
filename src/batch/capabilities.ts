import type { GenerationDraft, Parameters } from "../domain/types";
import { combinations, combinationById } from "../models";
import type { CompileContext, ModelCombination } from "../models/types";
import { initialDraft, validateFields } from "../models/shared";
import { validateDraft } from "../models/validateDraft";
import { inlineData } from "../models/requests";
import { submittedPrompt } from "../providers/submittedPrompt";
import { b } from "./messages";

export const batchCombinations = combinations.filter((entry) => entry.batch);
export const batchRequestLimit = 50_000;

/** Keep unavailable fields visible when populated so the user can explicitly clear them. */
export function batchForm(combination: ModelCombination): ModelCombination {
  const unsupported = new Set(combination.batch?.unsupportedFields);
  return {
    ...combination,
    fields: combination.fields.map((field) =>
      unsupported.has(field.key)
        ? { ...field, visible: (draft: GenerationDraft) => !!draft.parameters[field.key] }
        : field,
    ),
  };
}

export function validateBatchDraft(draft: GenerationDraft, requirePrompt = true) {
  const combination = combinationById(draft.combinationId);
  const errors = validateDraft(draft, batchRequestLimit);
  if (!combination.batch) errors.push(b("unsupported"));
  if (requirePrompt && !draft.prompt.trim()) errors.push(b("promptRequired"));
  for (const key of combination.batch?.unsupportedFields ?? []) {
    if (
      draft.parameters[key] !== undefined &&
      draft.parameters[key] !== null &&
      draft.parameters[key] !== "" &&
      draft.parameters[key] !== false
    )
      errors.push(`${b("unavailableField")}: ${key}`);
  }
  return errors;
}

/** Copy fields only when their schemas agree, then check the complete target configuration. */
export function transferDraft(current: GenerationDraft, next: ModelCombination, remembered?: GenerationDraft) {
  const previous = combinationById(current.combinationId);
  const base = remembered ?? initialDraft(next);
  const parameters: Parameters = { ...base.parameters };
  for (const field of next.fields) {
    const source = previous.fields.find((entry) => entry.key === field.key && entry.kind === field.kind);
    if (!source || !(field.key in current.parameters)) continue;
    const candidate = { ...base, parameters: { ...parameters, [field.key]: current.parameters[field.key] } };
    if (!validateFields([field], candidate).length) parameters[field.key] = current.parameters[field.key];
  }
  const draft: GenerationDraft = {
    ...base,
    combinationId: next.id,
    prompt: current.prompt,
    references: current.references,
    parameters,
    requestCount: current.requestCount,
    inputPreparation: current.inputPreparation,
    creationMode: next.creationControl ? (current.creationMode ?? base.creationMode) : undefined,
    editTargetId: next.creationControl ? current.editTargetId : undefined,
    mask: current.mask,
    regions: current.regions,
  };
  if (next.validate(draft).length) draft.parameters = { ...base.parameters };
  return draft;
}

export function compileBatchRequest(combination: ModelCombination, context: CompileContext) {
  if (combination.batch?.protocol === "openai") {
    const request = combination.compile(context);
    return { endpoint: new URL(request.url).pathname, body: request.body!, prompt: submittedPrompt(request) };
  }
  if (combination.batch?.protocol !== "google") throw new Error(b("unsupported"));
  const p = context.draft.parameters;
  return {
    endpoint: `models/${combination.model}:batchGenerateContent`,
    prompt: context.prompt,
    body: {
      contents: [
        {
          role: "user",
          parts: [{ text: context.prompt }, ...context.images.map((image) => ({ inlineData: inlineData(image) }))],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          ...(p.aspect_ratio ? { aspectRatio: p.aspect_ratio } : {}),
          ...(p.resolution ? { imageSize: p.resolution } : {}),
        },
        ...(p.thinking_level ? { thinkingConfig: { thinkingLevel: String(p.thinking_level).toUpperCase() } } : {}),
      },
      ...(p.enable_web_search ? { tools: [{ googleSearch: {} }] } : {}),
    },
  };
}
