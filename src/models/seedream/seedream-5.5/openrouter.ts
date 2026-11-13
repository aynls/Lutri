import { ParameterFields } from "../../../create/components/Fields";
import { c } from "../../../create/messages";
import { aspect, format, number, resolution, seed, select, toggle } from "../../fields";
import { openRouter } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const generationFields: FieldDefinition[] = [
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
const fields: FieldDefinition[] = [
  ...generationFields.map<FieldDefinition>((field) => ({
    ...field,
    visible: (draft) => !draft.parameters.layer_decomposition && (field.visible?.(draft) ?? true),
  })),
  toggle("layer_decomposition", ["Separate layers", "图层拆分", "レイヤー分離"], {
    default: false,
    allowDefault: false,
  }),
  {
    ...select("layer_resolution", ["Layer resolution", "图层分辨率", "レイヤー解像度"], ["1K", "1.5K", "2K"]),
    default: "1K",
    allowDefault: false,
    visible: (draft) => draft.parameters.layer_decomposition === true,
  },
  {
    ...number("max_layers", ["Maximum layers", "最大图层数", "最大レイヤー数"], 1, 99),
    default: 29,
    allowDefault: false,
    visible: (draft) => draft.parameters.layer_decomposition === true,
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
  layerDecomposition: { maxLayers: 99 },
  inputPolicy: (draft) =>
    draft.parameters.layer_decomposition
      ? {
          minPixels: 262144,
          maxPixels: 36000000,
          maxRatio: 16,
          maxBytes: 30000000,
          mediaTypes: ["image/png", "image/jpeg"],
        }
      : {},
  fields,
  groups: [
    { id: "frame", fields: ["resolution", "aspect_ratio"] },
    { id: "generation", fields: ["layer_decomposition", "layer_resolution", "max_layers", "background", "seed"] },
    { id: "output", fields: ["output_format"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Seedream/seedream-5.5/OpenRouter.md"],
  outputCount: () => 1,
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.parameters.layer_decomposition && draft.references.length !== 1) errors.push(c("singleLayerSource"));
    return errors;
  },
  compile: (context) => {
    const { layer_decomposition, layer_resolution, max_layers, ...p } = values(fields, context.draft);
    if (layer_decomposition)
      return openRouter(
        "bytedance-seed/seedream-5-5",
        {
          resolution: layer_resolution,
          output_format: "png",
          provider: {
            options: {
              seed: { layer_decomposition: true, layer_decomposition_options: { max_images: Number(max_layers) + 1 } },
            },
          },
        },
        {
          ...context,
          prompt: context.prompt.trim() ? context.prompt : "Separate the main elements into independent layers.",
        },
      );
    if (p.background === "transparent") p.output_format = "png";
    return openRouter("bytedance-seed/seedream-5-5", p, context);
  },
};
