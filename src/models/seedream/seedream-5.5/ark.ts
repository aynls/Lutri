import { ParameterFields } from "../../../create/components/Fields";
import { c } from "../../../create/messages";
import { format, number, select, text, toggle } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const tiers = ["1K", "1.5K", "2K"];
const fields: FieldDefinition[] = [
  {
    ...text("size", ["Image size", "图片尺寸", "画像サイズ"]),
    visible: (draft) => !draft.parameters.layer_decomposition,
  },
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
  {
    ...format("output_format", ["png", "jpeg"]),
    visible: (draft) => !draft.parameters.layer_decomposition && draft.parameters.background !== "transparent",
  },
  select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"]),
  toggle("watermark", ["Watermark", "水印", "透かし"]),
];

export function seedream55ArkApi(provider: "ark" | "byteplus", model: string, endpoint: string): ModelCombination {
  return {
    id: `seedream-5.5:${provider}`,
    family: "Seedream",
    model: "seedream-5.5",
    label: "Seedream 5.5",
    provider,
    protocol: "images",
    maxReferences: 10,
    layerDecomposition: { maxLayers: 99 },
    inputPolicy: (draft) => ({
      minEdge: draft.parameters.layer_decomposition ? undefined : 15,
      minPixels: draft.parameters.layer_decomposition ? 262144 : 196,
      maxPixels: 36000000,
      maxRatio: 16,
      maxBytes: 30000000,
      mediaTypes: draft.parameters.layer_decomposition
        ? ["image/png", "image/jpeg"]
        : ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif", "image/heic", "image/heif"],
    }),
    fields,
    groups: [
      { id: "frame", fields: ["size"] },
      { id: "generation", fields: ["layer_decomposition", "layer_resolution", "max_layers", "background"] },
      { id: "output", fields: ["output_format", "watermark", "response_format"], collapsed: true },
    ],
    Form: ParameterFields,
    docs: ["doc/model/Seedream/seedream-5.5/Ark.md"],
    outputCount: () => 1,
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      if (draft.parameters.layer_decomposition) {
        if (draft.references.length !== 1) errors.push(c("singleLayerSource"));
        return errors;
      }
      const size = draft.parameters.size;
      if (typeof size === "string" && size && !tiers.includes(size)) {
        if (/^\d+\s*[x×*]\s*\d+$/.test(size)) errors.push(...dimensionErrors({ size }, 921600, 4624220, 16));
        else errors.push("size: 1K / 1.5K / 2K / W × H");
      }
      return errors;
    },
    compile: (context) => {
      const { layer_resolution, max_layers, ...p } = values(fields, context.draft);
      if (p.layer_decomposition) {
        p.size = layer_resolution ?? "auto";
        p.output_format = "png";
        p.layer_decomposition_options = { max_images: Number(max_layers) + 1 };
      } else {
        delete p.layer_decomposition;
        p.size = typeof p.size === "string" ? p.size.replace(/\s*[x×*]\s*/g, "x") : "2K";
        if (p.background === "transparent") p.output_format = "png";
      }
      const base = (context.configuration.endpoint || endpoint).replace(/\/$/, "");
      return request(provider, `${base}/api/v3/images/generations`, {
        ...p,
        model,
        ...(context.prompt.trim() ? { prompt: context.prompt } : {}),
        ...(context.images.length ? { image: context.images } : {}),
      });
    },
  };
}

export const combination = seedream55ArkApi("ark", "doubao-seedream-5-5-261028", "https://ark.cn-beijing.volces.com");
