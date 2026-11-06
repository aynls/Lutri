import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, json, select } from "../../fields";
import { proSizes } from "../sizes";
import { runware, take } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  select("size", ["Image size", "图片尺寸", "画像サイズ"], proSizes),
  count("numberResults", 20),
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
];

export const recraftV41UtilityProRunware: ModelCombination = {
  id: "recraft-v4.1-utility-pro:runware",
  model: "recraft-v4.1-utility-pro",
  family: "Recraft",
  label: "Recraft v4.1 utility pro",
  provider: "runware",
  protocol: "runware",
  maxReferences: 0,
  fields,
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
    if (!draft.parameters.size) errors.push("size");
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
    return runware("recraft:v4.1-utility-pro@0", p, context, settings, inputs);
  },
};
