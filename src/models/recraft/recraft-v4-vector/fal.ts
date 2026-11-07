import { ParameterFields } from "../../../create/components/Fields";
import { adv, json, text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { falVectorSizeErrors, vectorColorErrors, vectorPromptErrors } from "../vector";

const fields: FieldDefinition[] = [
  { ...text("image_size", ["Image size", "图片尺寸", "画像サイズ"]), min: 1, max: 14142 },
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"]),
];

export const recraftV4VectorFal: ModelCombination = {
  id: "recraft-v4-vector:fal",
  model: "recraft-v4-vector",
  family: "Recraft",
  label: "Recraft V4 Vector",
  provider: "fal",
  protocol: "fal",
  maxReferences: 0,
  primaryReference: false,

  fields,
  promptLimit: { min: 1, max: 10000 },
  groups: [
    { id: "frame", fields: ["image_size"] },
    { id: "style", fields: ["colors", "background_color"] },
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
  ],
  compile: (context) => {
    const p = values(fields, context.draft);
    imageSize(p);

    return fal("fal-ai/recraft/v4/text-to-vector", p, context);
  },
};
