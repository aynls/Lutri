import { ParameterFields } from "../../../create/components/Fields";
import { height, width, toggle } from "../../fields";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { maiAzureRequest } from "../azure";

const fields: FieldDefinition[] = [
  { ...width(768, 3072), visible: (d) => !d.references.length && !d.parameters.auto_aspect_ratio },
  { ...height(768, 3072), visible: (d) => !d.references.length && !d.parameters.auto_aspect_ratio },
  toggle("auto_aspect_ratio", ["Automatic aspect ratio", "自动宽高比", "自動アスペクト比"]),
  toggle("web_grounding", ["Web search", "联网搜索", "ウェブ検索"]),
];

export const maiImage26Azure: ModelCombination = {
  id: "mai-image-2.6:azure",
  model: "mai-image-2.6",
  family: "MAI",
  label: "MAI Image 2.6",
  provider: "azure",
  protocol: "images",
  creationControl: "prompt",
  maxReferences: 5,
  fields,
  inputPolicy: { mediaTypes: ["image/jpeg", "image/png"] },
  groups: [
    { id: "frame", fields: ["aspect_ratio", "auto_aspect_ratio", "width", "height"] },
    { id: "generation", fields: ["web_grounding", "num_images"] },
    { id: "output", fields: ["output_format", "sync_mode"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/MAI/MAI-Image.md"],
  outputCount: (p) => Number(p.num_images ?? 1),
  validate: (draft) => [...validateFields(fields, draft), ...dimensionErrors(values(fields, draft), 0, 2359296)],
  compile: (context) => maiAzureRequest(context, values(fields, context.draft)),
};
