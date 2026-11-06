import { ParameterFields } from "../../../create/components/Fields";
import { aspect, commonRatios, toggle } from "../../fields";
import { openRouter } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  aspect(commonRatios),
  toggle("web_grounding", ["Web search", "联网搜索", "ウェブ検索"]),
];

export const maiImage26OpenRouter: ModelCombination = {
  id: "mai-image-2.6:openrouter",
  model: "mai-image-2.6",
  family: "MAI",
  label: "MAI Image 2.6",
  provider: "openrouter",
  protocol: "images",
  maxReferences: 5,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "auto_aspect_ratio", "width", "height"] },
    { id: "generation", fields: ["web_grounding", "num_images"] },
    { id: "output", fields: ["output_format", "sync_mode"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/MAI/MAI-Image.md"],
  outputCount: (p) => Number(p.num_images ?? 1),
  validate: (draft) => [...validateFields(fields, draft), ...dimensionErrors(values(fields, draft), 0, 2359296)],
  compile: (context) => {
    const p = values(fields, context.draft);
    if (p.web_grounding !== undefined) {
      p.provider = { options: { azure: { web_grounding: p.web_grounding } } };
      delete p.web_grounding;
    }
    return openRouter("microsoft/mai-image-2.6", p, context);
  },
};
