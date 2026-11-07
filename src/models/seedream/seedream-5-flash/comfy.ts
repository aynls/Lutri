import { ParameterFields } from "../../../create/components/Fields";
import { seedreamRegions } from "../regions";
import { adv, format, select, text, toggle } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const layer = toggle("layer_decomposition", ["Separate layers", "图层拆分", "レイヤー分離"], {
  default: false,
  allowDefault: false,
});
const watermark = toggle("watermark", ["Watermark", "水印", "透かし"]);
const size = text("size", ["Image size", "图片尺寸", "画像サイズ"]);
const enhance = select("enhance_prompt_mode", ["Prompt optimization", "提示词优化", "プロンプト最適化"], ["standard"]);
const fields: FieldDefinition[] = [
  size,
  format("output_format", ["jpeg", "png"]),
  adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
  watermark,
  layer,
  enhance,
];
export const combination: ModelCombination = {
  id: "seedream-5-flash:comfy",
  family: "Seedream",
  model: "seedream-5-flash",
  label: "Seedream 5 Flash",
  provider: "comfy",
  protocol: "images",
  maxReferences: 10,
  regions: "seedream",
  fields,
  inputPolicy: undefined,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height", "size", "image_size"] },
    {
      id: "generation",
      fields: [
        "seed",
        "layer_decomposition",
        "background",
        "n",
        "num_images",
        "numberResults",
        "sequential_image_generation",
        "max_images",
        "enhance_prompt_mode",
        "web_search",
      ],
    },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "watermark", "response_format", "stream", "sync_mode"],
      collapsed: true,
    },
    { id: "advanced", fields: ["enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Seedream/seedream-5/"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters, 921600, 4624220, 16)];
    if (draft.parameters.layer_decomposition && draft.references.length !== 1)
      errors.push("layer_decomposition: references = 1");
    if (
      draft.parameters.sequential_image_generation === "auto" &&
      Number(draft.parameters.max_images ?? 15) + draft.references.length > 15
    )
      errors.push("references + max_images ≤ 15");
    return errors;
  },
  compile: (context) => {
    if (context.draft.regions.length) context = { ...context, prompt: seedreamRegions(context) };
    const p = values(fields, context.draft);
    if (p.max_images !== undefined) {
      p.sequential_image_generation_options = { max_images: p.max_images };
      delete p.max_images;
    }
    if (p.enhance_prompt_mode !== undefined) {
      p.optimize_prompt_options = { mode: p.enhance_prompt_mode };
      delete p.enhance_prompt_mode;
    }
    if (p.web_search) {
      p.tools = [{ type: "web_search" }];
    }
    delete p.web_search;
    const suffix = "5-0-flash-260915";
    const url = `https://api.comfy.org/v2/models/byteplus/seedream-${suffix}`;
    const compiled = request("comfy", url, {
      ...p,
      prompt: context.prompt,
      ...(context.images.length ? { image: context.images } : {}),
    });
    compiled.authHeader = "X-API-Key";
    compiled.authPrefix = "";
    return compiled;
  },
};
