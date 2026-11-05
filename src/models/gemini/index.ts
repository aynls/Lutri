import { ParameterFields } from "../../create/components/Fields";
import {
  adv,
  aspect,
  count,
  format,
  height,
  json,
  resolution,
  select,
  text,
  toggle,
  width,
  seed,
  number,
} from "../fields";
import { fal, inlineData, openRouter, runware } from "../requests";
import { dimensionErrors, request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination, ProviderId } from "../types";

const variants = [
  { id: "2-lite", label: "2 Lite", model: "gemini-3.1-flash-lite-image", runware: "google:nano-banana@2-lite" },
  { id: "2.1", label: "2.1", model: "gemini-nano-banana-2.1", runware: "google:nano-banana@2.1" },
  { id: "2", label: "2", model: "gemini-3.1-flash-image", runware: "google:4@3" },
  { id: "pro", label: "Pro", model: "gemini-3-pro-image", runware: "google:4@2" },
];
function make(variant: (typeof variants)[number], provider: ProviderId): ModelCombination {
  const lite = variant.id === "2-lite",
    pro = variant.id === "pro";
  const ratios = [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
    ...(!pro ? ["1:4", "4:1", "1:8", "8:1"] : []),
  ];
  const sizes = lite
    ? ["1K"]
    : variant.id === "2"
      ? [provider === "openrouter" ? "512" : "0.5K", "1K", "2K", "4K"]
      : ["1K", "2K", "4K"];
  const web = toggle("enable_web_search", ["Web search", "联网搜索", "ウェブ検索"]);
  const thinking = select(
    "thinking_level",
    ["Thinking level", "思考强度", "思考レベル"],
    pro ? ["high"] : variant.id === "2.1" ? ["minimal", "medium", "high"] : ["minimal", "high"],
  );
  let fields: FieldDefinition[];
  if (provider === "openrouter") fields = [aspect(ratios), resolution(sizes)];
  else if (provider === "runware")
    fields = [
      width(256, 8192),
      height(256, 8192),
      resolution(sizes),
      count("numberResults", 20),
      format("outputFormat", ["JPG", "PNG", "WEBP"]),
    ];
  else if (provider === "fal")
    fields = [
      aspect(["auto", ...ratios]),
      resolution(sizes),
      count("num_images", 4),
      format(),
      select("safety_tolerance", ["Safety tolerance", "审核容忍度", "安全許容度"], ["1", "2", "3", "4", "5", "6"]),
      adv(text("system_prompt", ["System instruction", "系统指令", "システム指示"])),
      adv(toggle("limit_generations", ["Limit generations", "限制生成数量", "生成数を制限"])),
      thinking,
      web,
      ...(variant.id === "2" ? [toggle("enable_image_search", ["Image search", "图片搜索", "画像検索"])] : []),
      adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
      adv(json("history", ["Conversation", "会话", "会話"])),
      ...(variant.id !== "2.1"
        ? [
            seed(),
            adv({ ...number("temperature", ["Temperature", "温度", "温度"], 0, 2, 0.01), integer: false }),
            adv({ ...number("top_p", ["Top P", "Top P", "Top P"], 0, 1, 0.01), integer: false }),
            adv(number("max_output_tokens", ["Output token limit", "输出令牌上限", "出力トークン上限"], 1, 65536)),
          ]
        : []),
      adv(json("context", ["Context", "上下文", "コンテキスト"])),
      adv(toggle("return_history", ["Return conversation", "返回会话", "会話を返す"])),
    ];
  else
    fields = [
      aspect(ratios),
      resolution(sizes),
      format("mime_type", ["image/png", "image/jpeg"]),
      web,
      ...(!lite ? [thinking] : []),
      ...(provider === "google"
        ? [adv(text("previous_interaction_id", ["Previous interaction", "上一轮交互", "前の対話"]))]
        : [adv(toggle("uploadImagesToStorage", ["Hosted images", "托管图片", "画像ホスティング"]))]),
    ];
  return {
    id: `${variant.model}:${provider}`,
    family: "Nano Banana",
    model: variant.model,
    label: `Nano Banana ${variant.label}`,
    provider,
    protocol:
      provider === "google"
        ? "interactions"
        : provider === "comfy"
          ? "gemini"
          : provider === "fal" || provider === "runware"
            ? provider
            : "images",
    maxReferences: 14,
    fields,
    Form: ParameterFields,
    docs: ["doc/model/Gemini/Nano-Banana-API.md"],
    outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
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
      if (provider === "openrouter") return openRouter(`google/${variant.model}`, p, context);
      if (provider === "runware") return runware(variant.runware, p, context);
      if (provider === "fal")
        return fal(
          `${variant.id === "2.1" ? "google/nano-banana-2.1" : `fal-ai/nano-banana-${variant.id}`}${context.images.length ? "/edit" : ""}`,
          p,
          context,
        );
      if (provider === "google") {
        const compiled = request(provider, "https://generativelanguage.googleapis.com/v1beta/interactions", {
          model: variant.model,
          input: [
            { type: "text", text: context.prompt },
            ...context.images.map((image) => {
              const data = inlineData(image);
              return { type: "image", mime_type: data.mimeType, data: data.data };
            }),
          ],
          response_format: {
            type: "image",
            ...(p.aspect_ratio ? { aspect_ratio: p.aspect_ratio } : {}),
            ...(p.resolution ? { image_size: p.resolution } : {}),
            ...(p.mime_type ? { mime_type: p.mime_type } : {}),
          },
          ...(p.enable_web_search ? { tools: [{ type: "google_search" }] } : {}),
          ...(p.thinking_level ? { generation_config: { thinking_level: p.thinking_level } } : {}),
          ...(p.previous_interaction_id ? { previous_interaction_id: p.previous_interaction_id } : {}),
        });
        compiled.headers = { "Api-Revision": "2026-05-20" };
        return compiled;
      }
      return request("comfy", `https://api.comfy.org/v2/models/vertexai/${variant.model}`, {
        contents: [
          {
            role: "user",
            parts: [{ text: context.prompt }, ...context.images.map((image) => ({ inlineData: inlineData(image) }))],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            ...(p.aspect_ratio ? { aspectRatio: p.aspect_ratio } : {}),
            ...(p.resolution ? { imageSize: p.resolution } : {}),
            ...(p.mime_type ? { imageOutputOptions: { mimeType: p.mime_type } } : {}),
          },
          ...(p.thinking_level ? { thinkingConfig: { thinkingLevel: String(p.thinking_level).toUpperCase() } } : {}),
        },
        ...(p.enable_web_search ? { tools: [{ googleSearch: {} }] } : {}),
        ...(p.uploadImagesToStorage ? { uploadImagesToStorage: true } : {}),
      });
    },
  };
}
export const geminiCombinations = variants.flatMap((variant) =>
  (variant.id === "2-lite"
    ? (["google", "openrouter", "runware"] as const)
    : (["google", "openrouter", "runware", "comfy", "fal"] as const)
  ).map((provider) => make(variant, provider)),
);
