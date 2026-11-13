import { ParameterFields } from "../../create/components/Fields";
import { aspect, count, resolution, seed } from "../fields";
import { openRouter } from "../requests";
import { validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

const fields: FieldDefinition[] = [
  resolution(["1K", "2K"]),
  aspect(["1:1", "1:2", "1:4", "2:1", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "9:16", "16:9"]),
  count("n", 6),
  seed(),
];

export function qwenImage21OpenRouter(tier: "pro" | "turbo"): ModelCombination {
  const model = `qwen-image-2.1-${tier}`;
  return {
    id: `${model}:openrouter`,
    family: "Qwen",
    model,
    label: `Qwen Image 2.1-${tier}`,
    provider: "openrouter",
    protocol: "images",
    maxReferences: 4,
    fields,
    groups: [
      { id: "frame", fields: ["resolution", "aspect_ratio"] },
      { id: "generation", fields: ["seed", "n"] },
    ],
    Form: ParameterFields,
    docs: ["doc/model/Qwen/qwen-image/Qwen-Image-OpenRouter.md"],
    outputCount: (p) => Number(p.n ?? 1),
    validate: (draft) => validateFields(fields, draft),
    compile: (context) => openRouter(`qwen/${model}`, values(fields, context.draft), context),
  };
}
