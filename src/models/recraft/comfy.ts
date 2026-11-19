import { ParameterFields } from "../../create/components/Fields";
import { label, localize } from "../../i18n";
import { adv, count, json, select, text } from "../fields";
import { take } from "../requests";
import { request, validateFields, values } from "../shared";
import type { ModelCombination } from "../types";
import { proSizes, sizes } from "./sizes";
import { vectorColorErrors, vectorPromptErrors, vectorRatios, vectorStyleErrors } from "./vector";

const routes: Partial<Record<string, string>> = {
  "recraft-v4.1": "recraftv4_1",
  "recraft-v4.1-pro": "recraftv4_1_pro",
  "recraft-v4.1-utility": "recraftv4_1_utility",
  "recraft-v4.1-utility-pro": "recraftv4_1_utility_pro",
  "recraft-v4.1-vector": "recraftv4_1_vector",
  "recraft-v4.1-pro-vector": "recraftv4_1_pro_vector",
  "recraft-v4-styles": "recraftv4_styles",
  "recraft-v4-styles-pro": "recraftv4_styles_pro",
  "recraft-v4-styles-vector": "recraftv4_styles_vector",
  "recraft-v4-styles-pro-vector": "recraftv4_styles_pro_vector",
};

const styleIdRequired = label("Style ID required", "需要风格 ID", "スタイル ID が必要です");

export function recraftComfy({ model, label }: Pick<ModelCombination, "model" | "label">): ModelCombination[] {
  const route = routes[model];
  if (!route) return [];
  const requiresStyle = model.startsWith("recraft-v4-styles");
  const dimensions = model.includes("-pro") ? proSizes : sizes;
  const fields = [
    select("size", ["Image size", "图片尺寸", "画像サイズ"], [...vectorRatios, ...dimensions]),
    text("style_id", ["Style ID", "风格 ID", "スタイル ID"]),
    adv(json("colors", ["Palette", "配色", "パレット"])),
    adv(json("background_color", ["Background color", "背景色", "背景色"])),
    count("n", 6),
    adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
  ];
  return [
    {
      id: `${model}:comfy`,
      model,
      family: "Recraft",
      label,
      provider: "comfy",
      protocol: "images",
      maxReferences: 0,
      fields,
      promptLimit: { min: 1, max: 10000 },
      groups: [
        { id: "frame", fields: ["size"] },
        { id: "style", fields: ["style_id", "colors", "background_color"] },
        { id: "generation", fields: ["n"] },
        { id: "output", fields: ["response_format"], collapsed: true },
      ],
      Form: ParameterFields,
      documentationPath: "doc/model/Recraft/Recraft-Comfy.md",
      outputCount: (p) => (typeof p.n === "number" ? p.n : 1),
      validate: (draft) => {
        const { style_id } = draft.parameters;
        const styleErrors =
          requiresStyle && (style_id == null || (typeof style_id === "string" && !style_id.trim()))
            ? [localize(styleIdRequired)]
            : vectorStyleErrors(draft, { required: false, exclusive: false });
        return [
          ...validateFields(fields, draft),
          ...vectorPromptErrors(draft),
          ...vectorColorErrors(draft.parameters, "comfy"),
          ...styleErrors,
        ];
      },
      compile: (context) => {
        const parameters = values(fields, context.draft);
        if (typeof parameters.style_id === "string") parameters.style_id = parameters.style_id.trim();
        const controls = take(parameters, { colors: "colors", background_color: "background_color" });
        return request("comfy", `https://api.comfy.org/v2/models/recraft/${route}`, {
          ...parameters,
          model: route,
          prompt: context.prompt,
          ...(Object.keys(controls).length > 0 ? { controls } : {}),
        });
      },
    },
  ];
}
