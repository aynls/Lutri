import { c } from "../../../create/messages";
import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, number, resolution, select, toggle } from "../../fields";
import { fal } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const tiers = ["1K", "1.5K", "2K"];
const fields: FieldDefinition[] = [
  { ...resolution(tiers), default: "2K", visible: (draft) => !draft.parameters.layer_decomposition },
  toggle("layer_decomposition", ["Separate layers", "图层拆分", "レイヤー分離"], {
    default: false,
    allowDefault: false,
  }),
  {
    ...select("layer_resolution", ["Layer resolution", "图层分辨率", "レイヤー解像度"], ["auto", ...tiers]),
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
  { ...count("num_images", 6), visible: (draft) => !draft.parameters.layer_decomposition },
  {
    ...format("output_format", ["png", "jpeg"]),
    visible: (draft) => !draft.parameters.layer_decomposition && draft.parameters.background !== "transparent",
  },
  toggle("watermark", ["Watermark", "水印", "透かし"]),
  adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
];

export const combination: ModelCombination = {
  id: "seedream-5.5:fal",
  family: "Seedream",
  model: "seedream-5.5",
  label: "Seedream 5.5",
  provider: "fal",
  protocol: "fal",
  maxReferences: 10,
  layerDecomposition: { maxLayers: 99 },
  inputPolicy: (draft) =>
    draft.parameters.layer_decomposition
      ? { minPixels: 262144, maxPixels: 36000000, maxRatio: 16, maxBytes: 30000000 }
      : {},
  fields,
  groups: [
    { id: "frame", fields: ["resolution"] },
    { id: "generation", fields: ["layer_decomposition", "layer_resolution", "max_layers", "background", "num_images"] },
    { id: "output", fields: ["output_format", "watermark"], collapsed: true },
    { id: "advanced", fields: ["enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Seedream/seedream-5.5/fal.md"],
  outputCount: (p) => (p.layer_decomposition ? 1 : Number(p.num_images ?? 1)),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.parameters.layer_decomposition && draft.references.length !== 1) errors.push(c("singleLayerSource"));
    return errors;
  },
  compile: (context) => {
    const { layer_decomposition, layer_resolution, max_layers, resolution, ...p } = values(fields, context.draft);
    if (layer_decomposition)
      return request("fal", "https://queue.fal.run/bytedance/seedream/v5.5/layerize", {
        ...p,
        image_url: context.images[0],
        image_size: !layer_resolution || layer_resolution === "auto" ? "auto" : `auto_${layer_resolution}`,
        max_images: Number(max_layers) + 1,
        output_format: "png",
        ...(context.prompt.trim() ? { prompt: context.prompt } : {}),
      });
    p.image_size = `auto_${resolution ?? "2K"}`;
    if (p.background === "transparent") p.output_format = "png";
    return fal(`bytedance/seedream/v5.5/${context.images.length ? "edit" : "text-to-image"}`, p, context);
  },
};
