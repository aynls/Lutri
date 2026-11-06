import { ParameterFields } from "../../../create/components/Fields";
import { aspect, commonRatios } from "../../fields";
import { openRouter } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [aspect(commonRatios)];

export const maiImage25OpenRouter: ModelCombination = {
  id: "mai-image-2.5:openrouter",
  model: "mai-image-2.5",
  family: "MAI",
  label: "MAI Image 2.5",
  provider: "openrouter",
  protocol: "images",
  maxReferences: 1,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "auto_aspect_ratio", "width", "height"] },
    { id: "generation", fields: ["web_grounding", "num_images"] },
    { id: "output", fields: ["output_format", "sync_mode"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/MAI/MAI-Image.md"],
  outputCount: (p) => Number(p.num_images ?? 1),
  validate: (draft) => [...validateFields(fields, draft), ...dimensionErrors(values(fields, draft), 0, 1048576)],
  compile: (context) => {
    const p = values(fields, context.draft);
    return openRouter("microsoft/mai-image-2.5", p, context);
  },
};
