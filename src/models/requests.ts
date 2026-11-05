import type { Json, Parameters } from "../domain/types";
import { request } from "./shared";
import type { CompileContext } from "./types";

export function openRouter(model: string, p: Parameters, context: CompileContext) {
  return request("openrouter", "https://openrouter.ai/api/v1/images", {
    ...p,
    model,
    prompt: context.prompt,
    ...(context.images.length
      ? { input_references: context.images.map((url) => ({ type: "image_url", image_url: { url } })) }
      : {}),
  });
}
export function fal(path: string, p: Parameters, context: CompileContext) {
  return request("fal", `https://queue.fal.run/${path}`, {
    ...p,
    prompt: context.prompt,
    ...(context.images.length ? { image_urls: context.images } : {}),
    ...(context.mask ? { mask_url: context.mask } : {}),
  });
}
export function runware(
  model: string,
  p: Parameters,
  context: CompileContext,
  settings: Parameters = {},
  inputs: Parameters = {},
) {
  return request("runware", "https://api.runware.ai/v1", [
    {
      ...p,
      taskType: "imageInference",
      taskUUID: context.taskId,
      model,
      positivePrompt: context.prompt,
      ...(context.images.length || Object.keys(inputs).length
        ? {
            inputs: {
              ...(context.images.length ? { referenceImages: context.images } : {}),
              ...(context.mask ? { maskImage: context.mask } : {}),
              ...inputs,
            },
          }
        : {}),
      ...(Object.keys(settings).length ? { settings } : {}),
      outputType: "URL",
      deliveryMethod: "async",
    },
  ]);
}
export function take(parameters: Parameters, keys: Record<string, string>): Parameters {
  const selected: Parameters = {};
  for (const [key, target] of Object.entries(keys))
    if (parameters[key] !== undefined) {
      selected[target] = parameters[key];
      delete parameters[key];
    }
  return selected;
}
export function imageSize(parameters: Parameters, key = "image_size") {
  const value = parameters[key];
  if (typeof value === "string" && /^\d+\s*[x×*]\s*\d+$/.test(value)) {
    const [width, height] = value.split(/\s*[x×*]\s*/).map(Number);
    parameters[key] = { width, height };
  }
}
export const inlineData = (dataUrl: string): { mimeType: string; data: string } => {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Invalid image data URL");
  return { mimeType: match[1], data: match[2] };
};
export const contentImages = (images: string[]): Json[] => images.map((image) => ({ image }));
