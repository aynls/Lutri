import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, count, format, toggle } from "../../fields";
import { openRouter, take } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, compression, moderation, quality, sizeErrors } from "../shared";
import { complexity, groups26 } from "../shared26";

const fields: FieldDefinition[] = [
  aspect(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"]),
  quality(),
  complexity(),
  background(),
  count("n", 10),
  format(),
  { ...compression(), visible: (draft) => ["jpeg", "webp"].includes(String(draft.parameters.output_format)) },
  moderation(),
  adv(toggle("stream", ["Stream", "流式传输", "ストリーミング"])),
];

export const gptImage26FlareOpenRouter: ModelCombination = {
  id: "gpt-image-2.6-flare:openrouter",
  family: "GPT Image",
  model: "gpt-image-2.6-flare",
  label: "GPT Image 2.6 Flare",
  provider: "openrouter",
  protocol: "images",
  maxReferences: 16,
  fields,
  primaryReference: true,
  groups: groups26,
  Form: ParameterFields,
  docs: ["doc/model/GPT/gpt-image-2.6/gpt-image-2.6-OpenRouter.md"],
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
    const options = take(p, { moderation: "moderation", complexity: "complexity" });
    if (Object.keys(options).length) p.provider = { options: { openai: options } };
    return openRouter("openai/gpt-image-2.6-flare", p, context);
  },
};
