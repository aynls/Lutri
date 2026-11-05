import { ParameterFields } from "../../create/components/Fields";
import { adv, aspect, commonRatios, count, format, height, number, resolution, select, toggle, width } from "../fields";
import { fal, openRouter, runware, take } from "../requests";
import { dimensionErrors, request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination, ProviderId } from "../types";
function make(provider: ProviderId): ModelCombination {
  const quality = select(
    "quality",
    ["Quality", "质量", "品質"],
    provider === "openrouter" || provider === "runware" ? ["low", "medium"] : ["auto", "low", "medium"],
  );
  const fields: FieldDefinition[] =
    provider === "runware"
      ? [
          width(256, 4096),
          height(256, 4096),
          resolution(["1K", "2K"]),
          quality,
          count("numberResults", 20),
          format("outputFormat", ["JPG", "PNG", "WEBP"]),
          adv(number("outputQuality", ["Compression quality", "压缩质量", "圧縮品質"], 20, 99)),
        ]
      : [
          aspect([
            ...commonRatios,
            ...(provider === "openrouter" ? ["9:19.5", "19.5:9", "9:20", "20:9", "1:2", "2:1"] : ["21:9", "5:2"]),
          ]),
          resolution(
            provider === "openrouter" ? ["1K", "2K"] : provider === "fal" ? ["1k", "1.5k", "2k"] : ["1k", "2k"],
          ),
          quality,
          ...(provider !== "openrouter" ? [count(provider === "fal" ? "num_images" : "n", 10)] : []),
          ...(provider === "fal"
            ? [format(), adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"]))]
            : provider !== "openrouter"
              ? [adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"]))]
              : []),
        ];
  return {
    id: `grok-imagine-image-2.0:${provider}`,
    model: "grok-imagine-image-2.0",
    family: "Grok",
    label: "Grok Imagine Image 2.0",
    provider,
    protocol: provider === "fal" || provider === "runware" ? provider : "images",
    maxReferences: provider === "comfy" ? 0 : provider === "openrouter" ? 3 : 5,
    fields,
    Form: ParameterFields,
    docs: ["doc/model/Grok/Grok-Imagine-Image-2.0-API.md"],
    outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
    initialRecovery: provider === "runware" ? (id) => ({ remoteId: id }) : undefined,
    validate: (draft) => {
      const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters)];
      if (
        provider === "runware" &&
        draft.parameters.resolution &&
        (!draft.references.length || draft.parameters.width || draft.parameters.height)
      )
        errors.push("resolution: references, no width / height");
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft);
      if (provider === "openrouter") return openRouter("x-ai/grok-imagine-image-2.0", p, context);
      if (provider === "fal")
        return fal(`xai/grok-imagine-image/v2.0/${context.images.length ? "edit" : "text-to-image"}`, p, context);
      if (provider === "runware")
        return runware("xai:grok-imagine@image-2.0", p, context, take(p, { quality: "quality" }));
      return request(
        provider,
        provider === "comfy"
          ? "https://api.comfy.org/v2/models/xai/grok-imagine-image-2.0"
          : `https://api.x.ai/v1/images/${context.images.length ? "edits" : "generations"}`,
        {
          ...p,
          ...(provider === "xai" ? { model: "grok-imagine-image-2.0" } : {}),
          prompt: context.prompt,
          ...(context.images.length ? { images: context.images.map((url) => ({ url, type: "image_url" })) } : {}),
        },
      );
    },
  };
}
export const grokCombinations = (["xai", "openrouter", "runware", "comfy", "fal"] as const).map(make);
