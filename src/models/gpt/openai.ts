import { ParameterFields } from "../../create/components/Fields";
import { count, format, select, text } from "../fields";
import { dimensionErrors, request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";
import { background, compression, groups, moderation, quality, sizeErrors } from "./shared";
import { complexity, groups26, openAISvgFields, validateOpenAISvg } from "./shared26";
import { take } from "../requests";
import { label as localizedLabel, localize } from "../../i18n";

export function openAICombination(model: string, label: string, version26: boolean): ModelCombination {
  const fields: FieldDefinition[] = [
    { ...text("size", ["Size", "尺寸", "サイズ"]), min: 16, max: 3840, step: 16 },
    version26 ? select("quality", ["Quality", "质量", "品質"], ["auto", "low", "medium", "high"]) : quality(),
    ...(version26 ? [complexity()] : []),
    background(),
    count("n", 10),
    version26 ? format("output_format", ["jpeg", "png", "webp", "svg"]) : format(),
    { ...compression(), visible: (draft) => ["jpeg", "webp"].includes(String(draft.parameters.output_format)) },
    ...(version26 ? openAISvgFields : []),
    moderation(),
  ];
  return {
    id: `${model}:openai`,
    family: "GPT Image",
    model,
    label,
    provider: "openai",
    protocol: "images",
    creationControl: "prompt",
    maxReferences: 16,
    primaryReference: true,
    mask: "alpha",
    fields,
    groups: version26 ? groups26 : groups,
    Form: ParameterFields,
    promptLimit: { max: 32000 },
    inputPolicy: {
      maxEncodedBytes: 20971480,
      maskBytes: 4 * 1024 * 1024,
      mediaTypes: ["image/png", "image/jpeg", "image/webp"],
    },
    docs: ["doc/model/GPT/gpt-image-OpenAI.md"],
    outputCount: (p) => Number(p.n ?? 1),
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      const size = draft.parameters.size;
      if (size !== undefined && size !== null && size !== "" && size !== "auto") {
        if (typeof size !== "string" || !/^\d+x\d+$/.test(size))
          errors.push(
            localize(
              localizedLabel("Size: auto or WIDTHxHEIGHT", "尺寸：auto 或 宽x高", "サイズ：auto または 幅x高さ"),
            ),
          );
        else {
          errors.push(...dimensionErrors(draft.parameters, 655360, 8294400, 3));
          errors.push(...sizeErrors(draft));
        }
      }
      if (draft.parameters.background === "transparent" && draft.parameters.output_format === "jpeg")
        errors.push("transparent: PNG / WebP");
      if (version26) errors.push(...validateOpenAISvg(draft));
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft);
      const svg = take(p, { svg_model: "model", svg_thinking: "effort" });
      if (typeof svg.model === "string" && svg.model.trim()) {
        p.svg = {
          model: svg.model.trim(),
          ...(svg.effort ? { reasoning: { effort: svg.effort } } : {}),
        };
      }
      return request("openai", `https://api.openai.com/v1/images/${context.images.length ? "edits" : "generations"}`, {
        ...p,
        model,
        prompt: context.prompt,
        ...(context.images.length ? { images: context.images.map((image_url) => ({ image_url })) } : {}),
        ...(context.mask && context.images.length ? { mask: { image_url: context.mask } } : {}),
      });
    },
  };
}
