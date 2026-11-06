import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, compression, groups, quality, sizeErrors } from "../shared";

const fields: FieldDefinition[] = [
  text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
  quality(),
  background(),
  count("num_images", 10),
  format(),
  compression(),
  adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
];

export const gptImage25FlareFal: ModelCombination = {
  id: "gpt-image-2.5-flare:fal",
  family: "GPT Image",
  model: "gpt-image-2.5-flare",
  label: "GPT Image 2.5 Flare",
  provider: "fal",
  protocol: "fal",
  creationControl: "prompt",
  maxReferences: 16,
  mask: "white",
  fields,
  primaryReference: true,
  groups,
  Form: ParameterFields,
  docs: ["doc/model/GPT/gpt-image-2.5/gpt-image-2.5-fal.md"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
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
    imageSize(p);
    return fal(`openai/gpt-image-2.5/flare/${context.images.length ? "edit" : "text-to-image"}`, p, context);
  },
};
