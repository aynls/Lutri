import { ParameterFields } from "../../create/components/Fields";
import { adv, aspect, commonRatios, count, resolution, select } from "../fields";
import { dimensionErrors, request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

const quality = select("quality", ["Quality", "质量", "品質"], ["auto", "low", "medium"]);
const fields: FieldDefinition[] = [
  aspect([...commonRatios, "21:9", "5:2"]),
  resolution(["1k", "2k"]),
  quality,
  count("n", 10),
  adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
];
export const combination: ModelCombination = {
  id: "grok-imagine-image-2.0:xai",
  model: "grok-imagine-image-2.0",
  family: "Grok",
  label: "Grok Imagine Image 2.0",
  provider: "xai",
  protocol: "images",
  maxReferences: 5,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height"] },
    { id: "generation", fields: ["quality", "n", "num_images", "numberResults"] },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "outputQuality", "response_format", "sync_mode"],
      collapsed: true,
    },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Grok/Grok-Imagine-Image-2.0-API.md"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters)];
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    return request("xai", `https://api.x.ai/v1/images/${context.images.length ? "edits" : "generations"}`, {
      ...p,
      model: "grok-imagine-image-2.0",
      prompt: context.prompt,
      ...(context.images.length ? { images: context.images.map((url) => ({ url, type: "image_url" })) } : {}),
    });
  },
};
