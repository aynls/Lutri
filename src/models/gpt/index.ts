import { ParameterFields } from "../../create/components/Fields";
import { adv, aspect, count, format, height, number, select, text, toggle, width } from "../fields";
import { fal, imageSize, openRouter, runware, take } from "../requests";
import { dimensionErrors, request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination, ProviderId } from "../types";

const quality = () => select("quality", ["Quality", "质量", "品質"], ["auto", "low", "medium", "high", "xhigh", "max"]);
const background = () => select("background", ["Background", "背景", "背景"], ["auto", "transparent", "opaque"]);
const moderation = () => adv(select("moderation", ["Moderation", "审核", "モデレーション"], ["auto", "low"]));
const compression = () => ({
  ...number("output_compression", ["Compression quality", "压缩质量", "圧縮品質"], 0, 100),
  advanced: true,
  visible: (draft: Parameters<typeof values>[1]) => draft.parameters.output_format !== "png",
});

function make(variant: "flare" | "sunburst", provider: ProviderId): ModelCombination {
  const model = `gpt-image-2.5-${variant}`;
  let fields: FieldDefinition[];
  if (provider === "openrouter")
    fields = [
      aspect(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"]),
      quality(),
      background(),
      count("n", 10),
      compression(),
      moderation(),
      adv(toggle("stream", ["Stream", "流式传输", "ストリーミング"])),
    ];
  else if (provider === "runware")
    fields = [
      width(16, 3840, 16),
      height(16, 3840, 16),
      quality(),
      background(),
      moderation(),
      count("numberResults", 20),
      format("outputFormat", ["JPG", "PNG", "WEBP"]),
      adv(number("outputQuality", ["Compression quality", "压缩质量", "圧縮品質"], 20, 99)),
    ];
  else
    fields = [
      text(provider === "fal" ? "image_size" : "size", ["Image size", "图片尺寸", "画像サイズ"]),
      quality(),
      background(),
      count(provider === "fal" ? "num_images" : "n", 10),
      format(),
      compression(),
      ...(provider === "fal"
        ? [
            adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
            adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
          ]
        : [moderation(), adv(text("user", ["User identifier", "用户标识", "ユーザー識別子"]))]),
    ];
  return {
    id: `${model}:${provider}`,
    family: "GPT Image",
    model,
    label: `GPT Image 2.5 ${variant === "flare" ? "Flare" : "Sunburst"}`,
    provider,
    protocol: provider === "fal" || provider === "runware" ? provider : "images",
    maxReferences: 16,
    mask: provider === "openrouter" ? undefined : provider === "comfy" ? "alpha" : "white",
    fields,
    inputPolicy:
      provider === "comfy"
        ? {
            maxBytes: 25 * 1024 * 1024,
            totalBytes: 64 * 1024 * 1024,
            maskBytes: 4 * 1024 * 1024 - 1,
            mediaTypes: ["image/jpeg", "image/png", "image/webp"],
          }
        : undefined,
    primaryReference: true,
    promptLimit: provider === "runware" ? { min: 2, max: 32000 } : undefined,
    groups: [
      { id: "frame", fields: ["aspect_ratio", "size", "image_size", "width", "height"] },
      { id: "generation", fields: ["quality", "background", "n", "num_images", "numberResults"] },
      {
        id: "output",
        fields: ["output_format", "outputFormat", "output_compression", "outputQuality", "stream", "sync_mode"],
        collapsed: true,
      },
      { id: "advanced", fields: ["moderation", "enable_safety_checker", "user"], collapsed: true },
    ],
    Form: ParameterFields,
    docs: [`doc/model/GPT/gpt-image-2.5/gpt-image-2.5-${provider}.md`],
    outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
    initialRecovery: provider === "runware" ? (id) => ({ remoteId: id }) : undefined,
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      errors.push(...dimensionErrors(draft.parameters, 655360, 8294400, 3));
      if (provider === "runware" && (draft.prompt.length < 2 || draft.prompt.length > 32000))
        errors.push("prompt: 2–32000");
      const size = draft.parameters.image_size ?? draft.parameters.size;
      if (
        typeof size === "string" &&
        /^\d+\s*[x×*]\s*\d+$/.test(size) &&
        size
          .split(/\s*[x×*]\s*/)
          .map(Number)
          .some((side) => side % 16 !== 0 || side > 3840)
      )
        errors.push("size: 16px / ≤3840px");
      if (
        draft.parameters.background === "transparent" &&
        ((provider === "runware" && (!draft.parameters.outputFormat || draft.parameters.outputFormat === "JPG")) ||
          draft.parameters.output_format === "jpeg")
      )
        errors.push("transparent: PNG / WebP");
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft);
      if (provider === "openrouter") {
        const options = take(p, { moderation: "moderation" });
        if (Object.keys(options).length) p.provider = { options: { openai: options } };
        return openRouter(`openai/${model}`, p, context);
      }
      if (provider === "runware")
        return runware(
          `openai:gpt-image@2.5-${variant}`,
          p,
          context,
          take(p, { quality: "quality", background: "background", moderation: "moderation" }),
        );
      if (provider === "fal") {
        imageSize(p);
        return fal(`openai/gpt-image-2.5/${variant}/${context.images.length ? "edit" : "text-to-image"}`, p, context);
      }
      return request("comfy", `https://api.comfy.org/v2/models/openai/${model}`, {
        ...p,
        prompt: context.prompt,
        ...(context.images.length ? { image: context.images } : {}),
        ...(context.mask ? { mask: context.mask } : {}),
      });
    },
  };
}
export const gptCombinations = (["flare", "sunburst"] as const).flatMap((variant) =>
  (["openrouter", "fal", "runware", "comfy"] as const).map((provider) => make(variant, provider)),
);
