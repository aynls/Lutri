import { adv, count, format, seed, select } from "../../fields";
import { take } from "../../requests";
import { request, values } from "../../shared";
import type { ModelCombination } from "../../types";
import { sizes } from "../sizes";
import { vectorRatios } from "../vector";
import { colorFields, flashV2, flashV2Errors } from "./shared";

const responseFormat = {
  ...adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["multipart", "url", "b64_json"])),
  default: "multipart",
  allowDefault: false,
};

const fields = [
  select("size", ["Image size", "图片尺寸", "画像サイズ"], [...vectorRatios, ...sizes]),
  count("n", 6),
  { ...seed(Number.MAX_SAFE_INTEGER, "random_seed"), min: Number.MIN_SAFE_INTEGER },
  ...colorFields,
  format("image_format", ["webp", "png"]),
  responseFormat,
];

export const recraftV41FlashV2Recraft: ModelCombination = {
  ...flashV2,
  id: `${flashV2.model}:recraft`,
  provider: "recraft",
  protocol: "images",
  fields,
  groups: [
    { id: "frame", fields: ["size"] },
    { id: "generation", fields: ["n", "random_seed"] },
    { id: "style", fields: ["colors", "background_color"], collapsed: true },
    { id: "output", fields: ["image_format", "response_format"], collapsed: true },
  ],
  outputCount: (p) => (typeof p.n === "number" ? p.n : 1),
  validate: (draft) => flashV2Errors(fields, draft, "recraft"),
  compile: (context) => {
    const p = values(fields, context.draft);
    const controls = take(p, { colors: "colors", background_color: "background_color" });
    return request("recraft", "https://external.api.recraft.ai/v1/images/generations", {
      ...p,
      model: "recraftv4_1_flash_v2",
      prompt: context.prompt,
      response_format: p.response_format ?? responseFormat.default,
      ...(Object.keys(controls).length ? { controls } : {}),
    });
  },
};
