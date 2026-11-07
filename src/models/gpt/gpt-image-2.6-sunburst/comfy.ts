import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, text } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, compression, groups, moderation, quality, sizeErrors } from "../shared";

const fields: FieldDefinition[] = [
  text("size", ["Image size", "图片尺寸", "画像サイズ"]),
  quality(),
  background(),
  count("n", 10),
  format(),
  {
    ...compression(),
    visible: (draft) => ["jpeg", "webp"].includes(String(draft.parameters.output_format)),
  },
  moderation(),
  adv(text("user", ["User identifier", "用户标识", "ユーザー識別子"])),
];

export const gptImage26SunburstComfy: ModelCombination = {
  id: "gpt-image-2.6-sunburst:comfy",
  family: "GPT Image",
  model: "gpt-image-2.6-sunburst",
  label: "GPT Image 2.6 Sunburst",
  provider: "comfy",
  protocol: "images",
  maxReferences: 16,
  mask: "alpha",
  inputPolicy: {
    maxBytes: 25 * 1024 * 1024,
    totalBytes: 64 * 1024 * 1024,
    maskBytes: 4 * 1024 * 1024 - 1,
    mediaTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  fields,
  primaryReference: true,
  groups,
  Form: ParameterFields,
  docs: ["doc/model/GPT/gpt-image-2.6/gpt-image-2.6-Comfy.md"],
  outputCount: (p) => Number(p.n ?? 1),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    errors.push(...dimensionErrors(draft.parameters, 655360, 8294400, 3));
    errors.push(...sizeErrors(draft));
    if (draft.parameters.background === "transparent" && draft.parameters.output_format === "jpeg")
      errors.push("transparent: PNG / WebP");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    return request("comfy", "https://api.comfy.org/v2/models/openai/gpt-image-2.6-sunburst", {
      ...p,
      prompt: context.prompt,
      ...(context.images.length ? { image: context.images } : {}),
      ...(context.mask ? { mask: context.mask } : {}),
    });
  },
};
