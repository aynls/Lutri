import { ParameterFields } from "../../../create/components/Fields";
import { c } from "../../../create/messages";
import { count, format, number, resolution, select, toggle } from "../../fields";
import { runware, take } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  { ...resolution(["1K", "1.5K", "2K"]), default: "2K", visible: (draft) => !draft.parameters.layer_decomposition },
  toggle("layer_decomposition", ["Separate layers", "图层拆分", "レイヤー分離"], {
    default: false,
    allowDefault: false,
  }),
  {
    ...select("layer_resolution", ["Layer resolution", "图层分辨率", "レイヤー解像度"], ["1K", "1.5K", "2K"]),
    visible: (draft) => draft.parameters.layer_decomposition === true,
  },
  {
    ...number("max_layers", ["Maximum layers", "最大图层数", "最大レイヤー数"], 1, 99),
    default: 29,
    allowDefault: false,
    visible: (draft) => draft.parameters.layer_decomposition === true,
  },
  {
    ...select("background", ["Background", "背景", "背景"], ["opaque", "transparent"]),
    visible: (draft) => !draft.parameters.layer_decomposition,
  },
  { ...count("numberResults", 20), visible: (draft) => !draft.parameters.layer_decomposition },
  {
    ...format("outputFormat", ["PNG", "JPG", "WEBP"]),
    default: "PNG",
    visible: (draft) => !!draft.parameters.layer_decomposition || draft.parameters.background !== "transparent",
  },
];

export const combination: ModelCombination = {
  id: "seedream-5.5:runware",
  family: "Seedream",
  model: "seedream-5.5",
  label: "Seedream 5.5",
  provider: "runware",
  protocol: "runware",
  maxReferences: 10,
  layerDecomposition: { maxLayers: 99 },
  promptLimit: { max: 10000 },
  fields,
  groups: [
    { id: "frame", fields: ["resolution"] },
    {
      id: "generation",
      fields: ["layer_decomposition", "layer_resolution", "max_layers", "background", "numberResults"],
    },
    { id: "output", fields: ["outputFormat"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Seedream/seedream-5.5/Runware.md"],
  outputCount: (p) => (p.layer_decomposition ? 1 : Number(p.numberResults ?? 1)),
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.parameters.layer_decomposition && draft.references.length !== 1) errors.push(c("singleLayerSource"));
    if ((!draft.parameters.layer_decomposition && !draft.prompt.trim()) || draft.prompt.length > 10000)
      errors.push("prompt: 1–10000");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const settings = take(p, { layer_decomposition: "layerDecomposition", background: "background" });
    if (settings.layerDecomposition) {
      if (p.layer_resolution) p.resolution = p.layer_resolution;
      settings.layerDecompositionMaxImages = Number(p.max_layers ?? 29) + 1;
    } else {
      p.resolution ??= "2K";
      if (settings.background === "transparent") p.outputFormat = "PNG";
    }
    delete p.layer_resolution;
    delete p.max_layers;
    const compiled = runware("bytedance:seedream@5.5", p, context, settings);
    if (settings.layerDecomposition && !context.prompt.trim() && Array.isArray(compiled.body))
      delete (compiled.body[0] as Record<string, unknown>).positivePrompt;
    return compiled;
  },
};
