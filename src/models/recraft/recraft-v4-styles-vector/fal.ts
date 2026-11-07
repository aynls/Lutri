import { ParameterFields } from "../../../create/components/Fields";
import { adv, json, select, text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { falVectorSizeErrors, vectorColorErrors, vectorPromptErrors, vectorStyleErrors } from "../vector";

const fields: FieldDefinition[] = [
  { ...text("image_size", ["Image size", "图片尺寸", "画像サイズ"]), min: 1, max: 14142 },
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  text("style_id", ["Style ID", "风格 ID", "スタイル ID"]),
  select("style_match", ["Style matching", "风格匹配", "スタイル適合"], ["precise", "flexible"]),
  toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"]),
];

export const recraftV4StylesVectorFal: ModelCombination = {
  id: "recraft-v4-styles-vector:fal",
  model: "recraft-v4-styles-vector",
  family: "Recraft",
  label: "Recraft V4 Styles Vector",
  provider: "fal",
  protocol: "fal",
  maxReferences: 10,
  primaryReference: false,
  inputPolicy: { mediaTypes: ["image/png", "image/jpeg", "image/webp"] },
  fields,
  promptLimit: { min: 1, max: 10000 },
  groups: [
    { id: "frame", fields: ["image_size"] },
    { id: "style", fields: ["style_id", "style_match", "colors", "background_color"] },
    { id: "advanced", fields: ["enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Recraft/Recraft-Vector.md"],
  outputCount: () => 1,
  validate: (draft) => [
    ...validateFields(fields, draft),
    ...vectorPromptErrors(draft),
    ...falVectorSizeErrors(draft.parameters.image_size),
    ...vectorColorErrors(draft.parameters, "fal"),
    ...vectorStyleErrors(draft, { required: true, exclusive: false, uuid4: true }),
  ],
  compile: (context) => {
    const p = values(fields, context.draft);
    imageSize(p);
    if (typeof p.style_id === "string") p.style_id = p.style_id.trim();
    return fal("recraft/v4/style/text-to-vector", p, context);
  },
};
