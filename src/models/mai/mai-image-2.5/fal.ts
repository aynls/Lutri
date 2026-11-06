import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, commonRatios, count, format, toggle } from "../../fields";
import { fal } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  aspect(commonRatios),
  count("num_images", 4),
  format(),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
];

export const maiImage25Fal: ModelCombination = {
  id: "mai-image-2.5:fal",
  model: "mai-image-2.5",
  family: "MAI",
  label: "MAI Image 2.5",
  provider: "fal",
  protocol: "fal",
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
    return fal(`microsoft/mai-image-2.5${context.images.length ? "/edit" : ""}`, p, context);
  },
};
