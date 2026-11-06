import { ParameterFields } from "../../create/components/Fields";
import { adv, aspect, commonRatios, count, format, resolution, select, toggle } from "../fields";
import { fal } from "../requests";
import { dimensionErrors, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

const quality = select("quality", ["Quality", "质量", "品質"], ["auto", "low", "medium"]);
const fields: FieldDefinition[] = [
  aspect([...commonRatios, "21:9", "5:2"]),
  resolution(["1k", "1.5k", "2k"]),
  quality,
  count("num_images", 10),
  format(),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
];
export const combination: ModelCombination = {
  id: "grok-imagine-image-2.0:fal",
  model: "grok-imagine-image-2.0",
  family: "Grok",
  label: "Grok Imagine Image 2.0",
  provider: "fal",
  protocol: "fal",
  creationControl: "prompt",
  maxReferences: 5,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height"] },
    { id: "generation", fields: ["quality", "n", "num_images", "numberResults"] },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "outputQuality", "response_format", "sync_mode"],
      collapsed: true,
    },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Grok/Grok-Imagine-Image-2.0-API.md"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters)];
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    return fal(`xai/grok-imagine-image/v2.0/${context.images.length ? "edit" : "text-to-image"}`, p, context);
  },
};
