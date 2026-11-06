import { ParameterFields } from "../../create/components/Fields";
import { count, format, select } from "../fields";
import { request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";
import { background, compression, groups, moderation, quality } from "./shared";
import { complexity, groups26 } from "./shared26";

export function openAICombination(model: string, label: string, version26: boolean): ModelCombination {
  const fields: FieldDefinition[] = [
    select("size", ["Size", "尺寸", "サイズ"], ["auto", "1024x1024", "1536x1024", "1024x1536"]),
    version26 ? select("quality", ["Quality", "质量", "品質"], ["auto", "low", "medium", "high"]) : quality(),
    ...(version26 ? [complexity()] : []),
    background(),
    count("n", 10),
    format(),
    { ...compression(), visible: (draft) => ["jpeg", "webp"].includes(String(draft.parameters.output_format)) },
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
      if (draft.parameters.background === "transparent" && draft.parameters.output_format === "jpeg")
        errors.push("transparent: PNG / WebP");
      return errors;
    },
    compile: (context) =>
      request("openai", `https://api.openai.com/v1/images/${context.images.length ? "edits" : "generations"}`, {
        ...values(fields, context.draft),
        model,
        prompt: context.prompt,
        ...(context.images.length ? { images: context.images.map((image_url) => ({ image_url })) } : {}),
        ...(context.mask && context.images.length ? { mask: { image_url: context.mask } } : {}),
      }),
  };
}
