import { ParameterFields } from "../../../create/components/Fields";
import { c } from "../../../create/messages";
import { format, number, select, toggle } from "../../fields";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  {
    ...select("size", ["Resolution", "分辨率", "解像度"], ["1K", "1.5K", "2K"]),
    default: "2K",
    visible: (draft) => !draft.parameters.layer_decomposition,
  },
  toggle("layer_decomposition", ["Separate layers", "图层拆分", "レイヤー分離"], {
    default: false,
    allowDefault: false,
  }),
  {
    ...select("layer_resolution", ["Layer resolution", "图层分辨率", "レイヤー解像度"], ["auto", "1K", "1.5K", "2K"]),
    visible: (draft) => draft.parameters.layer_decomposition === true,
  },
  {
    ...number("max_layers", ["Maximum layers", "最大图层数", "最大レイヤー数"], 1, 99),
    default: 29,
    allowDefault: false,
    visible: (draft) => draft.parameters.layer_decomposition === true,
  },
  {
    ...select("background", ["Background", "背景", "背景"], ["auto", "opaque", "transparent"]),
    visible: (draft) => !draft.parameters.layer_decomposition,
  },
  {
    ...format("output_format", ["png", "jpeg"]),
    default: "png",
    visible: (draft) => !!draft.parameters.layer_decomposition || draft.parameters.background !== "transparent",
  },
  select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"]),
  toggle("watermark", ["Watermark", "水印", "透かし"]),
];

export const combination: ModelCombination = {
  id: "seedream-5.5:comfy",
  family: "Seedream",
  model: "seedream-5.5",
  label: "Seedream 5.5",
  provider: "comfy",
  protocol: "images",
  maxReferences: 10,
  layerDecomposition: { maxLayers: 99 },
  fields,
  groups: [
    { id: "frame", fields: ["size"] },
    { id: "generation", fields: ["layer_decomposition", "layer_resolution", "max_layers", "background"] },
    { id: "output", fields: ["output_format", "watermark", "response_format"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Seedream/seedream-5.5/Comfy.md"],
  outputCount: () => 1,
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.parameters.layer_decomposition && draft.references.length !== 1) errors.push(c("singleLayerSource"));
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    if (p.layer_decomposition) {
      p.size = p.layer_resolution ?? "auto";
      p.layer_decomposition_options = { max_images: Number(p.max_layers ?? 29) + 1 };
    } else {
      p.size ??= "2K";
      if (p.background === "transparent") p.output_format = "png";
    }
    delete p.layer_resolution;
    delete p.max_layers;
    const compiled = request("comfy", "https://api.comfy.org/v2/models/byteplus/seedream-5-5-261028", {
      ...p,
      ...(context.prompt.trim() ? { prompt: context.prompt } : {}),
      ...(context.images.length ? { image: context.images } : {}),
    });
    compiled.authHeader = "X-API-Key";
    compiled.authPrefix = "";
    return compiled;
  },
};
