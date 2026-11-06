import { ParameterFields } from "../../../create/components/Fields";
import { seedreamRegions } from "../regions";
import { count, format, height, resolution, select, toggle, width } from "../../fields";
import { runware, take } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const layer = toggle("layer_decomposition", ["Separate layers", "图层拆分", "レイヤー分離"]);
const fields: FieldDefinition[] = [
  width(64, 4096),
  height(64, 4096),
  resolution(["1K", "1.5K", "2K", "auto"]),
  layer,
  select("background", ["Background", "背景", "背景"], ["opaque", "transparent"]),
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
];
export const combination: ModelCombination = {
  id: "seedream-5-pro:runware",
  family: "Seedream",
  model: "seedream-5-pro",
  label: "Seedream 5 Pro",
  provider: "runware",
  protocol: "runware",
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
  initialRecovery: (id) => ({ remoteId: id }),
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
    const settings = take(p, { layer_decomposition: "layerDecomposition", background: "background" });
    if (settings.layerDecomposition) {
      delete p.width;
      delete p.height;
    }
    const compiled = runware("bytedance:seedream@5.0-pro", p, context, settings);
    if (settings.layerDecomposition && Array.isArray(compiled.body))
      delete (compiled.body[0] as Record<string, unknown>).positivePrompt;
    return compiled;
  },
};
