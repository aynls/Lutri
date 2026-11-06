import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, seed, select, text, toggle } from "../../fields";
import { contentImages } from "../../requests";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const expand = toggle("prompt_extend", ["Expand prompt", "扩展提示词", "プロンプト拡張"]);
const mode = {
  ...select("prompt_extend_mode", ["Expansion mode", "扩写模式", "拡張モード"], ["direct", "agent"]),
  visible: (d: Parameters<typeof values>[1]) => d.parameters.prompt_extend !== false && !d.references.length,
};
const fields: FieldDefinition[] = [
  text("size", ["Image size", "图片尺寸", "画像サイズ"]),
  count("n", 6),
  adv(text("negative_prompt", ["Negative prompt", "负面提示词", "ネガティブプロンプト"], 500)),
  expand,
  mode,
  toggle("watermark", ["Watermark", "水印", "透かし"]),
  seed(),
];
export const combination: ModelCombination = {
  id: "qwen-image-3.0-pro:comfy",
  family: "Qwen",
  model: "qwen-image-3.0-pro",
  label: "Qwen Image 3.0-pro",
  provider: "comfy",
  protocol: "qwen",
  maxReferences: 3,
  fields,
  inputPolicy: undefined,
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
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters, 262144, 6553600, 8)];
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    if (typeof p.size === "string") p.size = p.size.replace(/\s*[x×]\s*/g, "*");
    const compiled = request("comfy", "https://api.comfy.org/v2/models/qwen/qwen-image-3.0-pro", {
      input: {
        messages: [{ role: "user", content: [...contentImages(context.images), { text: context.prompt }] }],
      },
      parameters: p,
    });
    compiled.authHeader = "X-API-Key";
    compiled.authPrefix = "";
    return compiled;
  },
};
