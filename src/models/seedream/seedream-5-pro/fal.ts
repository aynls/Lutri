import { ParameterFields } from "../../../create/components/Fields";
import { seedreamRegions } from "../regions";
import { adv, count, format, select, text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const watermark = toggle("watermark", ["Watermark", "水印", "透かし"]);
const size = text("image_size", ["Image size", "图片尺寸", "画像サイズ"]);
const enhance = select(
  "enhance_prompt_mode",
  ["Prompt optimization", "提示词优化", "プロンプト最適化"],
  ["standard", "fast"],
);
const fields: FieldDefinition[] = [
  size,
  count("num_images", 6),
  format("output_format", ["jpeg", "png"]),
  watermark,
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
  adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
  enhance,
];
export const combination: ModelCombination = {
  id: "seedream-5-pro:fal",
  family: "Seedream",
  model: "seedream-5-pro",
  label: "Seedream 5 Pro",
  provider: "fal",
  protocol: "fal",
  creationControl: "prompt",
  maxReferences: 10,
  regions: "seedream",
  fields,
  inputPolicy: undefined,
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
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters, 921600, 4624220, 16)];
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
    if (context.draft.regions.length) context = { ...context, prompt: seedreamRegions(context) };
    const p = values(fields, context.draft);
    imageSize(p);
    return fal(`bytedance/seedream/v5/pro/${context.images.length ? "edit" : "text-to-image"}`, p, context);
  },
};
