import { ParameterFields } from "../../create/components/Fields";
import { adv, count, format, text, toggle } from "../fields";
import { fal } from "../requests";
import { validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

const fields: FieldDefinition[] = [
  text("aspect_ratio", ["Image size", "图片尺寸", "画像サイズ"]),
  count("num_images", 10),
  format(),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
];

export const museImageFal: ModelCombination = {
  id: "muse-image:fal",
  model: "muse-image",
  family: "Muse",
  label: "Muse Image",
  provider: "fal",
  protocol: "fal",
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
    return fal(`meta/muse-image/${context.images.length ? "edit" : "text-to-image"}`, p, context);
  },
};
