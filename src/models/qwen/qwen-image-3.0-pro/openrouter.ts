import { ParameterFields } from "../../../create/components/Fields";
import { aspect, count, resolution, seed } from "../../fields";
import { openRouter } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  resolution(["1K", "2K"]),
  aspect(["1:1", "1:2", "1:4", "2:1", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "9:16", "16:9"]),
  count("n", 6),
  seed(),
];
export const combination: ModelCombination = {
  id: "qwen-image-3.0-pro:openrouter",
  family: "Qwen",
  model: "qwen-image-3.0-pro",
  label: "Qwen Image 3.0-pro",
  provider: "openrouter",
  protocol: "images",
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
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters, 262144, 4194304, 8)];
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    if (typeof p.size === "string") p.size = p.size.replace(/\s*[x×]\s*/g, "*");
    return openRouter("qwen/qwen-image-3-pro", p, context);
  },
};
