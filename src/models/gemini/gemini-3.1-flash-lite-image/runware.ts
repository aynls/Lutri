import { ParameterFields } from "../../../create/components/Fields";
import { count, format, height, resolution, width } from "../../fields";
import { runware } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const sizes = ["1K"];
const fields: FieldDefinition[] = [
  width(256, 8192),
  height(256, 8192),
  resolution(sizes),
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
];

export const combination: ModelCombination = {
  id: "gemini-3.1-flash-lite-image:runware",
  family: "Nano Banana",
  model: "gemini-3.1-flash-lite-image",
  label: "Nano Banana 2 Lite",
  provider: "runware",
  protocol: "runware",
  maxReferences: 14,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height"] },
    {
      id: "generation",
      fields: ["thinking_level", "enable_web_search", "enable_image_search", "seed", "num_images", "numberResults"],
    },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "mime_type", "sync_mode", "limit_generations", "return_history"],
      collapsed: true,
    },
    {
      id: "advanced",
      fields: [
        "safety_tolerance",
        "system_prompt",
        "temperature",
        "top_p",
        "max_output_tokens",
        "history",
        "context",
        "previous_interaction_id",
        "uploadImagesToStorage",
      ],
      collapsed: true,
    },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Gemini/Nano-Banana-API.md"],
  outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters)];
    if (draft.parameters.resolution && (!draft.references.length || draft.parameters.width || draft.parameters.height))
      errors.push("resolution: references, no width / height");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    return runware("google:nano-banana@2-lite", p, context);
  },
};
