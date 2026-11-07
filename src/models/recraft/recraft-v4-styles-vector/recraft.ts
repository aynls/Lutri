import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, json, seed, select, text } from "../../fields";
import { take } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { sizes } from "../sizes";
import { vectorColorErrors, vectorPromptErrors, vectorRatios, vectorStyleErrors } from "../vector";

const fields: FieldDefinition[] = [
  { ...select("size", ["Image size", "图片尺寸", "画像サイズ"], [...vectorRatios, ...sizes]) },
  count("n", 6),
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  text("style_id", ["Style ID", "风格 ID", "スタイル ID"]),
  select("style_match", ["Style matching", "风格匹配", "スタイル適合"], ["precise", "flexible"]),
  { ...seed(Number.MAX_SAFE_INTEGER, "random_seed"), min: Number.MIN_SAFE_INTEGER },
  adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
];

export const recraftV4StylesVectorRecraft: ModelCombination = {
  id: "recraft-v4-styles-vector:recraft",
  model: "recraft-v4-styles-vector",
  family: "Recraft",
  label: "Recraft V4 Styles Vector",
  provider: "recraft",
  protocol: "images",

  maxReferences: 10,
  primaryReference: false,
  inputPolicy: { maxBytes: 19_999_999, totalBytes: 64_000_000, mediaTypes: ["image/png", "image/jpeg", "image/webp"] },
  fields,
  promptLimit: { min: 1, max: 10000 },
  groups: [
    { id: "frame", fields: ["size"] },
    { id: "style", fields: ["style_id", "style_match", "colors", "background_color"] },
    { id: "generation", fields: ["random_seed", "n"] },
    { id: "output", fields: ["response_format"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Recraft/Recraft-Vector.md"],
  outputCount: (p) => Number(p.n ?? 1),
  validate: (draft) => [
    ...validateFields(fields, draft),
    ...vectorPromptErrors(draft),
    ...vectorColorErrors(draft.parameters, "recraft"),
    ...vectorStyleErrors(draft, { required: true, exclusive: true }),
  ],
  compile: (context) => {
    const p = values(fields, context.draft);
    const controls = take(p, { colors: "colors", background_color: "background_color" });
    if (typeof p.style_id === "string") p.style_id = p.style_id.trim();
    return request("recraft", "https://external.api.recraft.ai/v1/images/generations", {
      ...p,
      model: "recraftv4_styles_vector",
      prompt: context.prompt,
      ...(context.images.length ? { style_reference_urls: context.images } : {}),
      ...(Object.keys(controls).length ? { controls } : {}),
    });
  },
};
