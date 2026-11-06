import { ParameterFields } from "../../../create/components/Fields";
import { adv, format, number, select, text, toggle } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const watermark = toggle("watermark", ["Watermark", "水印", "透かし"]);
const size = text("size", ["Image size", "图片尺寸", "画像サイズ"]);
const sequential = select("sequential_image_generation", ["Image sequence", "组图", "連続画像"], ["disabled", "auto"]);
const maxImages = {
  ...number("max_images", ["Sequence limit", "组图上限", "連続画像の上限"], 1, 15),
  visible: (d: Parameters<typeof values>[1]) => d.parameters.sequential_image_generation === "auto",
};
const fields: FieldDefinition[] = [
  size,
  format("output_format", ["jpeg", "png"]),
  adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
  watermark,
  sequential,
  maxImages,
  adv(toggle("stream", ["Stream", "流式传输", "ストリーミング"])),
  toggle("web_search", ["Web search", "联网搜索", "ウェブ検索"]),
];
export const combination: ModelCombination = {
  id: "seedream-5-lite:ark",
  family: "Seedream",
  model: "seedream-5-lite",
  label: "Seedream 5 Lite",
  provider: "ark",
  protocol: "images",
  maxReferences: 14,
  regions: undefined,
  fields,
  inputPolicy: (draft) => ({
    minEdge: 15,
    minPixels: draft.parameters.layer_decomposition ? 262144 : 196,
    maxPixels: 36000000,
    maxRatio: 16,
    maxBytes: 30000000,
    mediaTypes: draft.parameters.layer_decomposition
      ? ["image/png", "image/jpeg"]
      : ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif", "image/heic", "image/heif"],
  }),
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height", "size", "image_size"] },
    {
      id: "generation",
      fields: [
        "seed",
        "layer_decomposition",
        "background",
        "n",
        "num_images",
        "numberResults",
        "sequential_image_generation",
        "max_images",
        "enhance_prompt_mode",
        "web_search",
      ],
    },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "watermark", "response_format", "stream", "sync_mode"],
      collapsed: true,
    },
    { id: "advanced", fields: ["enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Seedream/seedream-5/"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters, 3686400, 16777216, 16)];
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
    const p = values(fields, context.draft);
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
    const suffix = "5-0-260128";
    const remote = `doubao-seedream-${suffix}`;
    const url = `${context.configuration.endpoint || "https://ark.cn-beijing.volces.com"}/api/v3/images/generations`;
    const compiled = request("ark", url, {
      ...p,
      model: remote,
      prompt: context.prompt,
      ...(context.images.length ? { image: context.images } : {}),
    });
    return compiled;
  },
};
