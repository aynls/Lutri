import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, json, select, text } from "../../fields";
import { sizes } from "../sizes";
import { runware, take } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  select("size", ["Image size", "图片尺寸", "画像サイズ"], sizes),
  count("numberResults", 20),
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  text("style_id", ["Style ID", "风格 ID", "スタイル ID"]),
  select("style_match", ["Style matching", "风格匹配", "スタイル適合"], ["precise", "flexible"]),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
];

export const recraftV4StylesRunware: ModelCombination = {
  id: "recraft-v4-styles:runware",
  model: "recraft-v4-styles",
  family: "Recraft",
  label: "Recraft v4 styles",
  provider: "runware",
  protocol: "runware",
  maxReferences: 10,
  fields,
  inputPolicy: { minEdge: 256, maxBytes: 10_000_000, totalBytes: 64_000_000 },
  primaryReference: false,
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
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.prompt.length > 10000) errors.push("prompt ≤ 10000");
    if (!draft.references.length && !draft.parameters.style_id) errors.push("style_id / references");
    if (draft.references.length && draft.parameters.style_id) errors.push("style_id / references");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    if (p.size) {
      const [width, height] = String(p.size).split("x").map(Number);
      p.width = width;
      p.height = height;
      delete p.size;
    }
    const settings = take(p, { style_match: "styleMatch", colors: "colors", background_color: "backgroundColor" }),
      inputs = take(p, { style_id: "styleId" });
    return runware("recraft:v4@styles", p, context, settings, inputs);
  },
};
