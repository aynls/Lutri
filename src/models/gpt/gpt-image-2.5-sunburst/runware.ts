import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, height, number, width } from "../../fields";
import { runware, take } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, groups, moderation, quality, sizeErrors } from "../shared";

const fields: FieldDefinition[] = [
  width(16, 3840, 16),
  height(16, 3840, 16),
  quality(),
  background(),
  moderation(),
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
  adv(number("outputQuality", ["Compression quality", "压缩质量", "圧縮品質"], 20, 99)),
];

export const gptImage25SunburstRunware: ModelCombination = {
  id: "gpt-image-2.5-sunburst:runware",
  family: "GPT Image",
  model: "gpt-image-2.5-sunburst",
  label: "GPT Image 2.5 Sunburst",
  provider: "runware",
  protocol: "runware",
  maxReferences: 16,
  mask: "white",
  promptLimit: { min: 2, max: 32000 },
  fields,
  primaryReference: true,
  groups,
  Form: ParameterFields,
  docs: ["doc/model/GPT/gpt-image-2.5/gpt-image-2.5-runware.md"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    errors.push(...dimensionErrors(draft.parameters, 655360, 8294400, 3));
    if (draft.prompt.length < 2 || draft.prompt.length > 32000) errors.push("prompt: 2–32000");
    errors.push(...sizeErrors(draft));
    if (
      draft.parameters.background === "transparent" &&
      (!draft.parameters.outputFormat ||
        draft.parameters.outputFormat === "JPG" ||
        draft.parameters.output_format === "jpeg")
    )
      errors.push("transparent: PNG / WebP");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    return runware(
      "openai:gpt-image@2.5-sunburst",
      p,
      context,
      take(p, { quality: "quality", background: "background", moderation: "moderation" }),
    );
  },
};
