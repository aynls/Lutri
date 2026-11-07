import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, json, number, seed, select, text } from "../../fields";
import { take } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { sizes } from "../sizes";
import { isVectorEdit, vectorColorErrors, vectorPromptErrors, vectorRatios, vectorStyleErrors } from "../vector";

const fields: FieldDefinition[] = [
  {
    ...select("size", ["Image size", "图片尺寸", "画像サイズ"], [...vectorRatios, ...sizes]),
    visible: (draft) => !isVectorEdit(draft),
  },
  {
    ...number("strength", ["Change strength", "变化强度", "変更の強さ"], 0, 1, 0.01),
    integer: false,
    default: 0.5,
    visible: isVectorEdit,
  },
  count("n", 6),
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  text("style_id", ["Style ID", "风格 ID", "スタイル ID"]),
  select("style_match", ["Style matching", "风格匹配", "スタイル適合"], ["precise", "flexible"]),
  { ...seed(Number.MAX_SAFE_INTEGER, "random_seed"), min: Number.MIN_SAFE_INTEGER },
  adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
];

export const recraftV41VectorRecraft: ModelCombination = {
  id: "recraft-v4.1-vector:recraft",
  model: "recraft-v4.1-vector",
  family: "Recraft",
  label: "Recraft V4.1 Vector",
  provider: "recraft",
  protocol: "images",
  creationControl: "style",
  maxReferences: 10,
  primaryReference: true,
  inputPolicy: (draft) =>
    isVectorEdit(draft)
      ? {
          maxBytes: 19_999_999,
          minEdge: 256,
          maxEdge: 4096,
          maxPixels: 16_000_000,
          mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
        }
      : { maxBytes: 19_999_999, totalBytes: 64_000_000, mediaTypes: ["image/png", "image/jpeg", "image/webp"] },
  fields,
  promptLimit: { min: 1, max: 10000 },
  groups: [
    { id: "frame", fields: ["size"] },
    { id: "style", fields: ["style_id", "style_match", "colors", "background_color"] },
    { id: "generation", fields: ["strength", "random_seed", "n"] },
    { id: "output", fields: ["response_format"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Recraft/Recraft-Vector.md"],
  outputCount: (p) => Number(p.n ?? 1),
  validate: (draft) => [
    ...validateFields(fields, draft),
    ...vectorPromptErrors(draft),
    ...vectorColorErrors(draft.parameters, "recraft"),
    ...(!isVectorEdit(draft) ? vectorStyleErrors(draft, { required: false, exclusive: true }) : []),
  ],
  compile: (context) => {
    const p = values(fields, context.draft);
    const controls = take(p, { colors: "colors", background_color: "background_color" });
    if (isVectorEdit(context.draft)) {
      delete p.style_id;
      delete p.style_match;
      return request("recraft", "https://external.api.recraft.ai/v1/images/imageToImage", {
        ...p,
        model: "recraftv4_1_vector",
        prompt: context.prompt,
        image_url: context.images[0],
        strength: p.strength ?? 0.5,
        ...(Object.keys(controls).length ? { controls } : {}),
      });
    }
    if (typeof p.style_id === "string") p.style_id = p.style_id.trim();
    return request("recraft", "https://external.api.recraft.ai/v1/images/generations", {
      ...p,
      model: "recraftv4_1_vector",
      prompt: context.prompt,
      ...(context.images.length ? { style_reference_urls: context.images } : {}),
      ...(Object.keys(controls).length ? { controls } : {}),
    });
  },
};
