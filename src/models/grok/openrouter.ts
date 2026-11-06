import { ParameterFields } from "../../create/components/Fields";
import { aspect, commonRatios, resolution, select } from "../fields";
import { openRouter } from "../requests";
import { dimensionErrors, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

const quality = select("quality", ["Quality", "质量", "品質"], ["low", "medium"]);
const fields: FieldDefinition[] = [
  aspect([...commonRatios, "9:19.5", "19.5:9", "9:20", "20:9", "1:2", "2:1"]),
  resolution(["1K", "2K"]),
  quality,
];
export const combination: ModelCombination = {
  id: "grok-imagine-image-2.0:openrouter",
  model: "grok-imagine-image-2.0",
  family: "Grok",
  label: "Grok Imagine Image 2.0",
  provider: "openrouter",
  protocol: "images",
  maxReferences: 3,
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
    return openRouter("x-ai/grok-imagine-image-2.0", p, context);
  },
};
