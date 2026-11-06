import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, number, select, text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const watermark = toggle("watermark", ["Watermark", "水印", "透かし"]);
const size = text("image_size", ["Image size", "图片尺寸", "画像サイズ"]);
const sequential = select("sequential_image_generation", ["Image sequence", "组图", "連続画像"], ["disabled", "auto"]);
const maxImages = {
  ...number("max_images", ["Sequence limit", "组图上限", "連続画像の上限"], 1, 15),
  visible: (d: Parameters<typeof values>[1]) => d.parameters.sequential_image_generation === "auto",
};
const fields: FieldDefinition[] = [
  size,
  count("num_images", 6),
  format("output_format", ["jpeg", "png"]),
  watermark,
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
  adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
  sequential,
  maxImages,
];
export const combination: ModelCombination = {
  id: "seedream-5-lite:fal",
  family: "Seedream",
  model: "seedream-5-lite",
  label: "Seedream 5 Lite",
  provider: "fal",
  protocol: "fal",
  maxReferences: 14,
  regions: undefined,
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
    imageSize(p);
    return fal(`bytedance/seedream/v5/lite/${context.images.length ? "edit" : "text-to-image"}`, p, context);
  },
};
