import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, count, toggle } from "../../fields";
import { openRouter, take } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, compression, groups, moderation, quality, sizeErrors } from "../shared";

const fields: FieldDefinition[] = [
  aspect(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"]),
  quality(),
  background(),
  count("n", 10),
  compression(),
  moderation(),
  adv(toggle("stream", ["Stream", "流式传输", "ストリーミング"])),
];

export const gptImage25SunburstOpenRouter: ModelCombination = {
  id: "gpt-image-2.5-sunburst:openrouter",
  family: "GPT Image",
  model: "gpt-image-2.5-sunburst",
  label: "GPT Image 2.5 Sunburst",
  provider: "openrouter",
  protocol: "images",
  maxReferences: 16,
  fields,
  primaryReference: true,
  groups,
  Form: ParameterFields,
  docs: ["doc/model/GPT/gpt-image-2.5/gpt-image-2.5-openrouter.md"],
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
    const options = take(p, { moderation: "moderation" });
    if (Object.keys(options).length) p.provider = { options: { openai: options } };
    return openRouter("openai/gpt-image-2.5-sunburst", p, context);
  },
};
