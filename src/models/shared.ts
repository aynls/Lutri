import type { GenerationDraft, Json, Parameters } from "../domain/types";
import { locale } from "../i18n";
import type { CompiledRequest, FieldDefinition, ModelCombination, ProviderId } from "./types";

export const defaultMaxRequestCount = 20;
export function maxRequestCount(preferences: { generation?: { maxRequestCount?: number } }): number {
  const value = preferences.generation?.maxRequestCount;
  return value !== undefined && Number.isSafeInteger(value) && value >= 1 ? value : defaultMaxRequestCount;
}

export const providerNames: Record<ProviderId, string> = {
  bfl: "Black Forest Labs",
  fal: "fal",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  runware: "Runware",
  comfy: "Comfy Router",
  google: "Google",
  qwencloud: "QwenCloud",
  ark: "Volcengine",
  byteplus: "BytePlus",
  xai: "xAI",
  azure: "Microsoft Foundry",
  meta: "Meta",
  recraft: "Recraft",
  ideogram: "Ideogram",
};
export function request(provider: ProviderId, url: string, body: Json): CompiledRequest {
  const [authHeader, authPrefix] =
    provider === "bfl"
      ? ["x-key", ""]
      : provider === "fal"
        ? ["Authorization", "Key "]
        : provider === "google"
          ? ["x-goog-api-key", ""]
          : provider === "ideogram"
            ? ["Api-Key", ""]
            : provider === "azure"
              ? ["api-key", ""]
              : ["Authorization", "Bearer "];
  return { provider, url, method: "POST", authHeader, authPrefix, body };
}
export function values(fields: FieldDefinition[], draft: GenerationDraft): Parameters {
  return Object.fromEntries(
    fields
      .filter((field) => !field.visible || field.visible(draft))
      .flatMap((field) => {
        const value = draft.parameters[field.key] ?? (field.allowDefault === false ? field.default : undefined);
        return value === undefined || value === null || value === "" ? [] : [[field.key, value]];
      }),
  );
}
export function validateFields(fields: FieldDefinition[], draft: GenerationDraft): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (field.visible && !field.visible(draft)) continue;
    const value = draft.parameters[field.key];
    if (value === undefined || value === null || value === "") continue;
    const name = field.label[locale];
    if (
      (field.kind === "number" || field.kind === "seed") &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        (field.integer !== false && !Number.isInteger(value)) ||
        value < (field.min ?? -Infinity) ||
        value > (field.max ?? Infinity) ||
        (field.step && field.step >= 1 && value % field.step !== 0))
    )
      errors.push(`${name}: ${field.min}–${field.max}${field.step && field.step > 1 ? ` / ${field.step}` : ""}`);
    if (field.kind === "select" && !field.options?.includes(String(value)))
      errors.push(`${name}: ${field.options?.join(", ")}`);
    if (field.kind === "toggle" && typeof value !== "boolean") errors.push(`${name}: true / false`);
    if ((field.kind === "text" || field.kind === "size") && typeof value !== "string") errors.push(`${name}: text`);
    if (["size", "image_size"].includes(field.key) && typeof value === "string") {
      const dimensions = value.match(/^(\d*)\s*[x×*]\s*(\d*)$/);
      if (dimensions && (!dimensions[1] || !dimensions[2])) errors.push(`${name}: W × H`);
    }
    if (field.maxLength && typeof value === "string" && value.length > field.maxLength)
      errors.push(`${name}: ≤ ${field.maxLength}`);
  }
  return errors;
}
export function initialDraft(combination: ModelCombination): GenerationDraft {
  return {
    combinationId: combination.id,
    ...(combination.creationControl ? { creationMode: "generate" as const } : {}),
    prompt: "",
    references: [],
    regions: [],
    requestCount: 1,
    parameters: Object.fromEntries(
      combination.fields.flatMap((field) => (field.default === undefined ? [] : [[field.key, field.default]])),
    ),
  };
}
export function dimensionErrors(
  parameters: Parameters,
  minPixels = 0,
  maxPixels = Infinity,
  maxRatio = Infinity,
): string[] {
  let { width, height } = parameters;
  const size = parameters.size ?? parameters.image_size;
  if (typeof size === "string" && /^\d+\s*[x×*]\s*\d+$/.test(size))
    [width, height] = size.split(/\s*[x×*]\s*/).map(Number);
  else if (size && typeof size === "object" && !Array.isArray(size)) {
    width = size.width;
    height = size.height;
  }
  if (width === undefined && height === undefined) return [];
  if (typeof width !== "number" || typeof height !== "number") return ["width + height"];
  return width * height < minPixels || width * height > maxPixels || Math.max(width / height, height / width) > maxRatio
    ? [`${minPixels} ≤ width × height ≤ ${maxPixels}; ratio ≤ ${maxRatio}`]
    : [];
}
