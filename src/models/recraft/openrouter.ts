import { ParameterFields } from "../../create/components/Fields";
import { c } from "../../create/messages";
import { aspect, count } from "../fields";
import { openRouter } from "../requests";
import { validateFields, values } from "../shared";
import type { ModelCombination } from "../types";

const standardRatios = ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"];
const styleRatios = [...standardRatios, "2:1", "1:2", "3:2", "2:3", "5:4", "4:5"];

export function recraftOpenRouter({ model, label }: Pick<ModelCombination, "model" | "label">): ModelCombination {
  const styles = model.startsWith("recraft-v4-styles");
  const vector = model.endsWith("-vector");
  const fields = [aspect(styles ? styleRatios : standardRatios), count("n", 6)];
  return {
    id: `${model}:openrouter`,
    family: "Recraft",
    model,
    label,
    provider: "openrouter",
    protocol: "images",
    maxReferences: styles ? 10 : 1,
    primaryReference: !styles,
    inputPolicy: styles ? { minEdge: 256, mediaTypes: ["image/png", "image/jpeg", "image/webp"] } : undefined,
    fields,
    groups: [
      { id: "frame", fields: ["aspect_ratio"] },
      { id: "generation", fields: ["n"] },
    ],
    Form: ParameterFields,
    docs: ["doc/model/Recraft/Recraft-OpenRouter.md"],
    outputCount: (p) => Number(p.n ?? 1),
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      if (styles && !draft.references.length) errors.push(c("styleReferenceRequired"));
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft);
      if (vector) p.output_format = "svg";
      return openRouter(`recraft/${model}`, p, context);
    },
  };
}
