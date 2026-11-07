import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, compression, quality, sizeErrors } from "../shared";
import { complexity, falSvgModel, groups26, validateFalSvg } from "../shared26";

const fields: FieldDefinition[] = [
  text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
  quality(),
  complexity("reasoning_effort"),
  background(),
  count("num_images", 10),
  format("output_format", ["jpeg", "png", "webp", "svg"]),
  {
    ...compression(),
    visible: (draft) => ["jpeg", "webp"].includes(String(draft.parameters.output_format)),
  },
  falSvgModel,
  adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
];

export const gptImage26SunburstFal: ModelCombination = {
  id: "gpt-image-2.6-sunburst:fal",
  family: "GPT Image",
  model: "gpt-image-2.6-sunburst",
  label: "GPT Image 2.6 Sunburst",
  provider: "fal",
  protocol: "fal",
  creationControl: "prompt",
  maxReferences: 16,
  mask: "white",
  promptLimit: { min: 1, max: 32000 },
  fields,
  primaryReference: true,
  groups: groups26,
  Form: ParameterFields,
  docs: ["doc/model/GPT/gpt-image-2.6/gpt-image-2.6-fal.md"],
  outputCount: (p) => Number(p.num_images ?? 1),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    errors.push(...dimensionErrors(draft.parameters, 655360, 8294400, 3));
    errors.push(...sizeErrors(draft));
    if (draft.parameters.background === "transparent" && draft.parameters.output_format === "jpeg")
      errors.push("transparent: PNG / WebP");
    errors.push(...validateFalSvg(draft));
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    imageSize(p);
    return fal(`openai/gpt-image-2.6/sunburst/${context.images.length ? "edit" : "text-to-image"}`, p, context);
  },
};
