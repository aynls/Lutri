import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, height, number, width } from "../../fields";
import { runware, take } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, moderation, quality, sizeErrors } from "../shared";
import { complexity, groups26, runwareSvgFields, validateRunwareSvg } from "../shared26";

const fields: FieldDefinition[] = [
  width(16, 3840, 16),
  height(16, 3840, 16),
  quality(),
  complexity(),
  background(),
  moderation(),
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP", "SVG"]),
  {
    ...adv(number("outputQuality", ["Compression quality", "压缩质量", "圧縮品質"], 20, 99)),
    visible: (draft) => draft.parameters.outputFormat !== "SVG",
  },
  ...runwareSvgFields,
];

export const gptImage26FlareRunware: ModelCombination = {
  id: "gpt-image-2.6-flare:runware",
  family: "GPT Image",
  model: "gpt-image-2.6-flare",
  label: "GPT Image 2.6 Flare",
  provider: "runware",
  protocol: "runware",
  maxReferences: 16,
  mask: "white",
  promptLimit: { min: 2, max: 32000 },
  fields,
  primaryReference: true,
  groups: groups26,
  Form: ParameterFields,
  docs: ["doc/model/GPT/gpt-image-2.6/gpt-image-2.6-Runware.md"],
  outputCount: (p) => Number(p.numberResults ?? 1),
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    errors.push(...dimensionErrors(draft.parameters, 655360, 8294400, 3));
    if (draft.prompt.length < 2 || draft.prompt.length > 32000) errors.push("prompt: 2–32000");
    errors.push(...sizeErrors(draft));
    if (
      draft.parameters.background === "transparent" &&
      (!draft.parameters.outputFormat ||
        !["PNG", "WEBP"].includes(String(draft.parameters.outputFormat)) ||
        draft.parameters.output_format === "jpeg")
    )
      errors.push("transparent: PNG / WebP");
    errors.push(...validateRunwareSvg(draft));
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const settings = take(p, {
      quality: "quality",
      background: "background",
      moderation: "moderation",
      complexity: "thinkingLevel",
    });
    const svg = take(p, { svg_model: "model", svg_thinking: "thinkingLevel" });
    if (Object.keys(svg).length) settings.svg = svg;
    return runware("openai:gpt-image@2.6-flare", p, context, settings);
  },
};
