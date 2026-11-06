import { ParameterFields } from "../../../create/components/Fields";
import { count, format, height, width } from "../../fields";
import { runware, take } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  width(64, 4096),
  height(64, 4096),
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
];
export const combination: ModelCombination = {
  id: "seedream-5-lite:runware",
  family: "Seedream",
  model: "seedream-5-lite",
  label: "Seedream 5 Lite",
  provider: "runware",
  protocol: "runware",
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
  initialRecovery: (id) => ({ remoteId: id }),
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
    const settings = take(p, { layer_decomposition: "layerDecomposition", background: "background" });
    if (settings.layerDecomposition) {
      delete p.width;
      delete p.height;
    }
    const compiled = runware("bytedance:seedream@5.0-lite", p, context, settings);
    if (settings.layerDecomposition && Array.isArray(compiled.body))
      delete (compiled.body[0] as Record<string, unknown>).positivePrompt;
    return compiled;
  },
};
