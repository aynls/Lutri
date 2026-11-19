import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, format, resolution, select, toggle } from "../../fields";
import { inlineData } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];

const fields: FieldDefinition[] = [
  aspect(ratios),
  resolution(["1K"]),
  select("thinking_level", ["Thinking level", "思考强度", "思考レベル"], ["minimal", "high"]),
  format("mime_type", ["image/png", "image/jpeg"]),
  adv(toggle("uploadImagesToStorage", ["Hosted images", "托管图片", "画像ホスティング"])),
];

export const combination: ModelCombination = {
  id: "gemini-3.1-flash-lite-image:comfy",
  family: "Nano Banana",
  model: "gemini-3.1-flash-lite-image",
  label: "Nano Banana 2 Lite",
  provider: "comfy",
  protocol: "gemini",
  maxReferences: 14,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution"] },
    { id: "generation", fields: ["thinking_level"] },
    { id: "output", fields: ["mime_type"], collapsed: true },
    { id: "advanced", fields: ["uploadImagesToStorage"], collapsed: true },
  ],
  Form: ParameterFields,
  documentationPath: "doc/model/Gemini/Nano-Banana-2-Lite-Comfy.md",
  outputCount: () => 1,
  validate: (draft) => validateFields(fields, draft),
  compile: (context) => {
    const p = values(fields, context.draft);
    return request("comfy", "https://api.comfy.org/v2/models/vertexai/gemini-3.1-flash-lite-image", {
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
      ...(p.uploadImagesToStorage === true ? { uploadImagesToStorage: true } : {}),
    });
  },
};
