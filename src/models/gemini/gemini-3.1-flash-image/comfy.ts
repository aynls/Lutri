import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, format, resolution, select, toggle } from "../../fields";
import { inlineData } from "../../requests";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];
const sizes = ["0.5K", "1K", "2K", "4K"];
const web = toggle("enable_web_search", ["Web search", "联网搜索", "ウェブ検索"]);
const thinking = select("thinking_level", ["Thinking level", "思考强度", "思考レベル"], ["minimal", "high"]);
const fields: FieldDefinition[] = [
  aspect(ratios),
  resolution(sizes),
  format("mime_type", ["image/png", "image/jpeg"]),
  web,
  thinking,
  adv(toggle("uploadImagesToStorage", ["Hosted images", "托管图片", "画像ホスティング"])),
];

export const combination: ModelCombination = {
  id: "gemini-3.1-flash-image:comfy",
  family: "Nano Banana",
  model: "gemini-3.1-flash-image",
  label: "Nano Banana 2",
  provider: "comfy",
  protocol: "gemini",
  maxReferences: 14,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height"] },
    {
      id: "generation",
      fields: ["thinking_level", "enable_web_search", "enable_image_search", "seed", "num_images", "numberResults"],
    },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "mime_type", "sync_mode", "limit_generations", "return_history"],
      collapsed: true,
    },
    {
      id: "advanced",
      fields: [
        "safety_tolerance",
        "system_prompt",
        "temperature",
        "top_p",
        "max_output_tokens",
        "history",
        "context",
        "previous_interaction_id",
        "uploadImagesToStorage",
      ],
      collapsed: true,
    },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Gemini/Nano-Banana-API.md"],
  outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters)];
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    return request("comfy", "https://api.comfy.org/v2/models/vertexai/gemini-3.1-flash-image", {
      contents: [
        {
          role: "user",
          parts: [{ text: context.prompt }, ...context.images.map((image) => ({ inlineData: inlineData(image) }))],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          ...(p.aspect_ratio ? { aspectRatio: p.aspect_ratio } : {}),
          ...(p.resolution ? { imageSize: p.resolution } : {}),
          ...(p.mime_type ? { imageOutputOptions: { mimeType: p.mime_type } } : {}),
        },
        ...(p.thinking_level ? { thinkingConfig: { thinkingLevel: String(p.thinking_level).toUpperCase() } } : {}),
      },
      ...(p.enable_web_search ? { tools: [{ googleSearch: {} }] } : {}),
      ...(p.uploadImagesToStorage ? { uploadImagesToStorage: true } : {}),
    });
  },
};
