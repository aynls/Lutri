import { ParameterFields } from "../../../create/components/Fields";
import { adv, json, text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"]),
];

export const recraftV41UtilityProFal: ModelCombination = {
  id: "recraft-v4.1-utility-pro:fal",
  model: "recraft-v4.1-utility-pro",
  family: "Recraft",
  label: "Recraft v4.1 utility pro",
  provider: "fal",
  protocol: "fal",
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
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.prompt.length > 10000) errors.push("prompt ≤ 10000");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    imageSize(p);
    return fal("fal-ai/recraft/v4.1/utility/pro/text-to-image", p, context);
  },
};
