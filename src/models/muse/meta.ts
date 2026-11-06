import { ParameterFields } from "../../create/components/Fields";
import { adv, count, format, select, text, toggle } from "../fields";
import { request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

const fields: FieldDefinition[] = [
  text("size", ["Image size", "图片尺寸", "画像サイズ"]),
  count("n", 10),
  format(),
  adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
  adv(toggle("stream", ["Stream", "流式传输", "ストリーミング"])),
];

export const museImageMeta: ModelCombination = {
  id: "muse-image:meta",
  model: "muse-image",
  family: "Muse",
  label: "Muse Image",
  provider: "meta",
  protocol: "images",
  maxReferences: 10,
  fields,
  groups: [
    { id: "frame", fields: ["size", "aspect_ratio", "resolution"] },
    {
      id: "generation",
      fields: ["webSearch", "imageSearch", "shell", "thinkingLevel", "n", "num_images", "numberResults"],
    },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "response_format", "stream", "sync_mode"],
      collapsed: true,
    },
    { id: "advanced", fields: ["moderation"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Muse/Muse-Image.md"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  validate: (draft) => validateFields(fields, draft),
  compile: (context) => {
    const p = values(fields, context.draft);
    return request("meta", `https://api.meta.ai/v1/images/${context.images.length ? "edits" : "generations"}`, {
      ...p,
      model: "muse-image-1.0",
      prompt: context.prompt,
      ...(context.images.length ? { images: context.images.map((image_url) => ({ image_url })) } : {}),
    });
  },
};
