import { aspect, commonRatios, toggle } from "../../fields";
import { openRouter, take } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, maiImage27Defaults } from "./shared";

const fields: FieldDefinition[] = [
  aspect(commonRatios),
  background,
  toggle("web_grounding", ["Web search", "联网搜索", "ウェブ検索"]),
];

export function maiImage27OpenRouter(model: string, label: string): ModelCombination {
  return {
    ...maiImage27Defaults,
    id: `${model}:openrouter`,
    model,
    label,
    provider: "openrouter",
    protocol: "images",
    fields,
    groups: [
      { id: "frame", fields: ["aspect_ratio"] },
      { id: "generation", fields: ["background", "web_grounding"] },
    ],
    validate: (draft) => validateFields(fields, draft),
    compile: (context) => {
      const parameters = values(fields, context.draft);
      const azure = take(parameters, { web_grounding: "web_grounding" });
      if (azure.web_grounding !== undefined) parameters.provider = { options: { azure } };
      return openRouter(`microsoft/${model}`, { ...parameters, n: 1 }, context);
    },
  };
}
