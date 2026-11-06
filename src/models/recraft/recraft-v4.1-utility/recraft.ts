import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, json, seed, select, text } from "../../fields";
import { take } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  text("size", ["Image size", "图片尺寸", "画像サイズ"]),
  count("n", 6),
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  text("style_id", ["Style ID", "风格 ID", "スタイル ID"]),
  select("style_match", ["Style matching", "风格匹配", "スタイル適合"], ["precise", "flexible"]),
  seed(4294967295, "random_seed"),
  format("image_format", ["webp", "png"]),
  adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
];

export const recraftV41UtilityRecraft: ModelCombination = {
  id: "recraft-v4.1-utility:recraft",
  model: "recraft-v4.1-utility",
  family: "Recraft",
  label: "Recraft v4.1 utility",
  provider: "recraft",
  protocol: "images",
  maxReferences: 1,
  fields,
  primaryReference: true,
  promptLimit: { max: 10000 },
  groups: [
    { id: "frame", fields: ["size", "image_size"] },
    { id: "style", fields: ["style_id", "style_match", "colors", "background_color"] },
    { id: "generation", fields: ["random_seed", "n", "numberResults"] },
    { id: "output", fields: ["outputFormat", "image_format", "response_format"], collapsed: true },
    { id: "advanced", fields: ["enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Recraft/Recraft-V4.md"],
  outputCount: (p) => Number(p.n ?? p.numberResults ?? 1),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.prompt.length > 10000) errors.push("prompt ≤ 10000");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const controls = take(p, { colors: "colors", background_color: "background_color" });
    if (context.images.length) {
      const compiled = request("recraft", "https://external.api.recraft.ai/v1/images/imageToImage", null);
      delete compiled.body;
      compiled.multipart = [
        { name: "image", dataUrl: context.images[0] },
        { name: "model", text: "recraftv4_1_utility" },
        { name: "prompt", text: context.prompt },
        ...(Object.keys(controls).length ? [{ name: "controls", text: JSON.stringify(controls) }] : []),
        ...Object.entries(p).map(([name, value]) => ({
          name,
          text: typeof value === "string" ? value : JSON.stringify(value),
        })),
      ];
      return compiled;
    }
    return request("recraft", "https://external.api.recraft.ai/v1/images/generations", {
      ...p,
      model: "recraftv4_1_utility",
      prompt: context.prompt,
      ...(Object.keys(controls).length ? { controls } : {}),
    });
  },
};
