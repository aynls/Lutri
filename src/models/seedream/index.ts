import { ParameterFields } from "../../create/components/Fields";
import { seedreamRegions } from "./regions";
import { aspect, count, format, height, number, resolution, seed, select, text, toggle, width } from "../fields";
import { fal, imageSize, openRouter, runware, take } from "../requests";
import { dimensionErrors, request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination, ProviderId } from "../types";

function make(variant: "pro" | "flash" | "lite", provider: ProviderId): ModelCombination {
  const lite = variant === "lite",
    model = `seedream-5-${variant}`;
  const layer = toggle("layer_decomposition", ["Separate layers", "图层拆分", "レイヤー分離"]);
  const watermark = toggle("watermark", ["Watermark", "水印", "透かし"]);
  const size = text(provider === "fal" ? "image_size" : "size", ["Image size", "图片尺寸", "画像サイズ"]);
  const sequential = select(
    "sequential_image_generation",
    ["Image sequence", "组图", "連続画像"],
    ["disabled", "auto"],
  );
  const maxImages = {
    ...number("max_images", ["Sequence limit", "组图上限", "連続画像の上限"], 1, 15),
    visible: (d: Parameters<typeof values>[1]) => d.parameters.sequential_image_generation === "auto",
  };
  const enhance = select(
    "enhance_prompt_mode",
    ["Prompt optimization", "提示词优化", "プロンプト最適化"],
    variant === "pro" ? ["standard", "fast"] : ["standard"],
  );
  let fields: FieldDefinition[];
  if (provider === "openrouter")
    fields = [
      resolution(lite ? ["2K", "4K"] : ["1K", "2K"]),
      aspect([
        "auto",
        "1:1",
        "1:2",
        "2:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "4:5",
        "5:4",
        "9:16",
        "16:9",
        "9:19.5",
        "19.5:9",
        "9:20",
        "20:9",
        "9:21",
        "21:9",
      ]),
      seed(),
      ...(lite ? [count("n", 4)] : []),
    ];
  else if (provider === "runware")
    fields = [
      width(64, 4096),
      height(64, 4096),
      ...(!lite
        ? [
            resolution(["1K", "1.5K", "2K", "auto"]),
            layer,
            select("background", ["Background", "背景", "背景"], ["opaque", "transparent"]),
          ]
        : []),
      count("numberResults", 20),
      format("outputFormat", ["JPG", "PNG", "WEBP"]),
    ];
  else if (provider === "fal")
    fields = [
      size,
      count("num_images", 6),
      format("output_format", ["jpeg", "png"]),
      watermark,
      toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"]),
      toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"]),
      ...(lite ? [sequential, maxImages] : variant === "pro" ? [enhance] : []),
    ];
  else
    fields = [
      size,
      format("output_format", ["jpeg", "png"]),
      select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"]),
      watermark,
      ...(lite
        ? [
            sequential,
            maxImages,
            ...(provider !== "comfy" ? [toggle("stream", ["Stream", "流式传输", "ストリーミング"])] : []),
            ...(provider === "ark" ? [toggle("web_search", ["Web search", "联网搜索", "ウェブ検索"])] : []),
          ]
        : [
            layer,
            enhance,
            ...(provider === "ark"
              ? [select("background", ["Background", "背景", "背景"], ["opaque", "transparent"])]
              : []),
          ]),
    ];
  return {
    id: `${model}:${provider}`,
    family: "Seedream",
    model,
    label: `Seedream 5 ${variant[0].toUpperCase() + variant.slice(1)}`,
    provider,
    protocol: provider === "fal" || provider === "runware" ? provider : "images",
    maxReferences: provider === "openrouter" || lite ? 14 : 10,
    regions: lite ? undefined : "seedream",
    fields,
    Form: ParameterFields,
    docs: ["doc/model/Seedream/seedream-5/"],
    outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
    initialRecovery: provider === "runware" ? (id) => ({ remoteId: id }) : undefined,
    validate: (draft) => {
      const errors = [
        ...validateFields(fields, draft),
        ...dimensionErrors(
          draft.parameters,
          lite ? 3686400 : provider === "comfy" && variant === "pro" ? 1048576 : 921600,
          lite
            ? provider === "comfy"
              ? 9437184
              : 16777216
            : provider === "comfy" && variant === "pro"
              ? 4194304
              : 4624220,
          16,
        ),
      ];
      if (draft.parameters.layer_decomposition && draft.references.length !== 1)
        errors.push("layer_decomposition: references = 1");
      if (
        draft.parameters.sequential_image_generation === "auto" &&
        Number(draft.parameters.max_images ?? 15) + draft.references.length > 15
      )
        errors.push("references + max_images ≤ 15");
      return errors;
    },
    compile: (context) => {
      if (!lite && context.draft.regions.length) context = { ...context, prompt: seedreamRegions(context) };
      const p = values(fields, context.draft);
      if (provider === "openrouter") return openRouter(`bytedance-seed/seedream-5-0-${variant}`, p, context);
      if (provider === "fal") {
        imageSize(p);
        return fal(`bytedance/seedream/v5/${variant}/${context.images.length ? "edit" : "text-to-image"}`, p, context);
      }
      if (provider === "runware") {
        const settings = take(p, { layer_decomposition: "layerDecomposition", background: "background" });
        if (settings.layerDecomposition) {
          delete p.width;
          delete p.height;
        }
        const compiled = runware(`bytedance:seedream@5.0-${variant}`, p, context, settings);
        if (settings.layerDecomposition && Array.isArray(compiled.body))
          delete (compiled.body[0] as Record<string, unknown>).positivePrompt;
        return compiled;
      }
      if (p.max_images !== undefined) {
        p.sequential_image_generation_options = { max_images: p.max_images };
        delete p.max_images;
      }
      if (p.enhance_prompt_mode !== undefined) {
        p.optimize_prompt_options = { mode: p.enhance_prompt_mode };
        delete p.enhance_prompt_mode;
      }
      if (p.web_search) {
        p.tools = [{ type: "web_search" }];
      }
      delete p.web_search;
      const suffix = lite ? "5-0-260128" : variant === "pro" ? "5-0-pro-260628" : "5-0-flash-260915";
      const remote =
        provider === "ark" ? `doubao-seedream-${suffix}` : lite ? `seedream-${suffix}` : `dola-seedream-${suffix}`;
      const url =
        provider === "comfy"
          ? `https://api.comfy.org/v2/models/byteplus/seedream-${suffix}`
          : `${context.configuration.endpoint || (provider === "ark" ? "https://ark.cn-beijing.volces.com" : "https://ark.ap-southeast.bytepluses.com")}/api/v3/images/generations`;
      const compiled = request(provider, url, {
        ...p,
        ...(provider === "comfy" ? {} : { model: remote }),
        prompt: context.prompt,
        ...(context.images.length ? { image: context.images } : {}),
      });
      if (provider === "comfy") {
        compiled.authHeader = "X-API-Key";
        compiled.authPrefix = "";
      }
      return compiled;
    },
  };
}
export const seedreamCombinations = (["pro", "flash", "lite"] as const).flatMap((variant) =>
  (["ark", "byteplus", "comfy", "fal", "openrouter", "runware"] as const).map((provider) => make(variant, provider)),
);
