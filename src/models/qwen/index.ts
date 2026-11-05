import { ParameterFields } from "../../create/components/Fields";
import { aspect, count, format, height, resolution, seed, select, text, toggle, width } from "../fields";
import { contentImages, fal, imageSize, openRouter, runware, take } from "../requests";
import { dimensionErrors, request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination, ProviderId } from "../types";

function make(version: string, provider: ProviderId): ModelCombination {
  const old = version.startsWith("2.1"),
    model = `qwen-image-${version}`;
  const expand = toggle("prompt_extend", ["Expand prompt", "扩展提示词", "プロンプト拡張"]);
  const mode = {
    ...select("prompt_extend_mode", ["Expansion mode", "扩写模式", "拡張モード"], ["direct", "agent"]),
    visible: (d: Parameters<typeof values>[1]) => d.parameters.prompt_extend !== false && !d.references.length,
  };
  let fields: FieldDefinition[];
  if (provider === "openrouter")
    fields = [
      resolution(["1K", "2K"]),
      aspect(["1:1", "1:2", "1:4", "2:1", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "9:16", "16:9"]),
      count("n", 6),
      seed(),
    ];
  else if (provider === "runware")
    fields = [
      width(old ? 192 : 512, 4096),
      height(old ? 192 : 512, 4096),
      count("numberResults", 20),
      seed(),
      expand,
      mode,
      ...(old
        ? [
            {
              ...toggle("enable_thinking", ["Thinking", "思考", "思考"]),
              visible: (d: Parameters<typeof values>[1]) => d.parameters.prompt_extend !== false,
            },
          ]
        : []),
    ];
  else if (provider === "fal")
    fields = [
      text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
      text("negative_prompt", ["Negative prompt", "负面提示词", "ネガティブプロンプト"], 500),
      toggle("enable_prompt_expansion", ["Expand prompt", "扩展提示词", "プロンプト拡張"]),
      seed(),
      count("num_images", 6),
      format(),
      toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"]),
      toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"]),
    ];
  else
    fields = [
      text("size", ["Image size", "图片尺寸", "画像サイズ"]),
      count("n", 6),
      ...(!old ? [text("negative_prompt", ["Negative prompt", "负面提示词", "ネガティブプロンプト"], 500)] : []),
      expand,
      mode,
      ...(provider === "qwencloud" ? [toggle("enable_thinking", ["Thinking", "思考", "思考"])] : []),
      toggle("watermark", ["Watermark", "水印", "透かし"]),
      seed(),
    ];
  return {
    id: `${model}:${provider}`,
    family: "Qwen",
    model,
    label: `Qwen Image ${version}`,
    provider,
    protocol: provider === "fal" || provider === "runware" ? provider : provider === "openrouter" ? "images" : "qwen",
    maxReferences: old ? 10 : 3,
    fields,
    Form: ParameterFields,
    docs: ["doc/model/Qwen/qwen-image/"],
    outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
    initialRecovery: provider === "runware" ? (id) => ({ remoteId: id }) : undefined,
    validate: (draft) => {
      const errors = [
        ...validateFields(fields, draft),
        ...dimensionErrors(draft.parameters, 262144, provider === "comfy" ? 6553600 : 4194304, 8),
      ];
      if (provider === "runware" && (draft.prompt.length < (old ? 2 : 1) || draft.prompt.length > (old ? 3000 : 32000)))
        errors.push(`prompt: ${old ? "2–3000" : "1–32000"}`);
      if (provider === "runware" && !old && (!draft.parameters.width || !draft.parameters.height))
        errors.push("width + height");
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft);
      if (typeof p.size === "string") p.size = p.size.replace(/\s*[x×]\s*/g, "*");
      if (provider === "openrouter") return openRouter(`qwen/${model.replace("3.0", "3")}`, p, context);
      if (provider === "fal") {
        imageSize(p);
        return fal(`alibaba/qwen-image-3/${context.images.length ? "edit" : "text-to-image"}`, p, context);
      }
      if (provider === "runware")
        return runware(
          `alibaba:qwen-image@${version}`,
          p,
          context,
          take(p, {
            prompt_extend: "promptExtend",
            prompt_extend_mode: "promptExtendMode",
            enable_thinking: "thinking",
          }),
        );
      const compiled = request(
        provider,
        provider === "comfy"
          ? `https://api.comfy.org/v2/models/qwen/${model}`
          : `${context.configuration.endpoint || "https://ap-southeast-1.maas.qwencloudapi.com"}/api/v1/services/aigc/multimodal-generation/generation`,
        {
          ...(provider === "qwencloud" ? { model } : {}),
          input: {
            messages: [{ role: "user", content: [...contentImages(context.images), { text: context.prompt }] }],
          },
          parameters: p,
        },
      );
      if (provider === "comfy") {
        compiled.authHeader = "X-API-Key";
        compiled.authPrefix = "";
      }
      return compiled;
    },
  };
}
export const qwenCombinations = [
  make("3.0", "fal"),
  ...(["3.0", "3.0-pro"] as const).flatMap((v) =>
    (["openrouter", "comfy", "qwencloud", "runware"] as const).map((p) => make(v, p)),
  ),
  ...(["2.1-pro", "2.1-turbo"] as const).flatMap((v) => (["qwencloud", "runware"] as const).map((p) => make(v, p))),
];
