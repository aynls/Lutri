import { ParameterFields } from "../../../create/components/Fields";
import { aspect, count, resolution, seed } from "../../fields";
import { openRouter } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  resolution(["2K", "4K"]),
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
  count("n", 4),
];
export const combination: ModelCombination = {
  id: "seedream-5-lite:openrouter",
  family: "Seedream",
  model: "seedream-5-lite",
  label: "Seedream 5 Lite",
  provider: "openrouter",
  protocol: "images",
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
    return openRouter("bytedance-seed/seedream-5-0-lite", p, context);
  },
};
