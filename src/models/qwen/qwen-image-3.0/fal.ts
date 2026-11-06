import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, seed, text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
  adv(text("negative_prompt", ["Negative prompt", "负面提示词", "ネガティブプロンプト"], 500)),
  toggle("enable_prompt_expansion", ["Expand prompt", "扩展提示词", "プロンプト拡張"]),
  seed(),
  count("num_images", 6),
  format(),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
  adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
];
export const combination: ModelCombination = {
  id: "qwen-image-3.0:fal",
  family: "Qwen",
  model: "qwen-image-3.0",
  label: "Qwen Image 3.0",
  provider: "fal",
  protocol: "fal",
  maxReferences: 3,
  fields,
  inputPolicy: {
    minEdge: 384,
    maxEdge: 2048,
    maxBytes: 10000000,
    mediaTypes: ["image/jpeg", "image/png", "image/webp"],
    opaque: true,
  },
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height", "size", "image_size"] },
    {
      id: "generation",
      fields: [
        "seed",
        "n",
        "num_images",
        "numberResults",
        "prompt_extend",
        "prompt_extend_mode",
        "enable_prompt_expansion",
        "enable_thinking",
      ],
    },
    { id: "output", fields: ["output_format", "watermark", "sync_mode"], collapsed: true },
    { id: "advanced", fields: ["negative_prompt", "enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Qwen/qwen-image/"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters, 262144, 4194304, 8)];
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    if (typeof p.size === "string") p.size = p.size.replace(/\s*[x×]\s*/g, "*");
    imageSize(p);
    return fal(`alibaba/qwen-image-3/${context.images.length ? "edit" : "text-to-image"}`, p, context);
  },
};
