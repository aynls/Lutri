import { ParameterFields } from "../../../create/components/Fields";
import { aspect, format, resolution, seed, select } from "../../fields";
import { openRouter } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  resolution(["1K", "1.5K", "2K"]),
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
  select("background", ["Background", "背景", "背景"], ["auto", "opaque", "transparent"]),
  {
    ...format("output_format", ["png", "jpeg"]),
    visible: (draft) => draft.parameters.background !== "transparent",
  },
];

export const combination: ModelCombination = {
  id: "seedream-5.5:openrouter",
  family: "Seedream",
  model: "seedream-5.5",
  label: "Seedream 5.5",
  provider: "openrouter",
  protocol: "images",
  maxReferences: 10,
  fields,
  groups: [
    { id: "frame", fields: ["resolution", "aspect_ratio"] },
    { id: "generation", fields: ["background", "seed"] },
    { id: "output", fields: ["output_format"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Seedream/seedream-5.5/OpenRouter.md"],
  outputCount: () => 1,
  validate: (draft) => validateFields(fields, draft),
  compile: (context) => {
    const p = values(fields, context.draft);
    if (p.background === "transparent") p.output_format = "png";
    return openRouter("bytedance-seed/seedream-5-5", p, context);
  },
};
