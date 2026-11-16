import { aspect, count } from "../../fields";
import { openRouter, take } from "../../requests";
import { values } from "../../shared";
import type { ModelCombination } from "../../types";
import { colorFields, flashV2, flashV2Errors } from "./shared";

const fields = [
  aspect(["auto", "1:1", "2:1", "1:2", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16"]),
  count("n", 6),
  ...colorFields,
];

export const recraftV41FlashV2OpenRouter: ModelCombination = {
  ...flashV2,
  id: `${flashV2.model}:openrouter`,
  provider: "openrouter",
  protocol: "images",
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio"] },
    { id: "generation", fields: ["n"] },
    { id: "style", fields: ["colors", "background_color"], collapsed: true },
  ],
  outputCount: (p) => (typeof p.n === "number" ? p.n : 1),
  validate: (draft) => flashV2Errors(fields, draft, "recraft"),
  compile: (context) => {
    const p = values(fields, context.draft);
    const controls = take(p, { colors: "colors", background_color: "background_color" });
    if (Object.keys(controls).length) p.provider = { options: { recraft: { controls } } };
    return openRouter(`recraft/${flashV2.model}`, p, context);
  },
};
