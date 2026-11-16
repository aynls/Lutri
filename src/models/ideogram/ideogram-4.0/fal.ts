import { ParameterFields } from "../../../create/components/Fields";
import { c } from "../../../create/messages";
import { count, format, number, seed, select } from "../../fields";
import { imageSize } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { falImageSizeAllowed, falSafety, falSize, falSync } from "../falFields";

const fields: FieldDefinition[] = [
  falSize,
  select("rendering_speed", ["Rendering speed", "渲染速度", "描画速度"], ["TURBO", "BALANCED", "QUALITY"]),
  select(
    "expansion_model",
    ["Prompt expansion model", "提示词扩写模型", "プロンプト拡張モデル"],
    ["None", "Medium", "Large"],
  ),
  {
    ...number("strength", ["Change strength", "变化强度", "変更の強さ"], 0, 1, 0.01),
    integer: false,
    visible: (draft) => draft.references.length > 0,
  },
  seed(),
  count("num_images", 4),
  format("output_format", ["jpeg", "png"]),
  select("acceleration", ["Acceleration", "加速", "高速化"], ["none", "low", "regular", "high"]),
  falSafety,
  falSync,
];

export const ideogram40Fal: ModelCombination = {
  id: "ideogram-4.0:fal",
  model: "ideogram-4.0",
  family: "Ideogram",
  label: "Ideogram 4.0",
  provider: "fal",
  protocol: "fal",
  maxReferences: 1,
  primaryReference: true,
  fields,
  groups: [
    { id: "frame", fields: ["image_size"] },
    { id: "generation", fields: ["rendering_speed", "expansion_model", "strength", "seed", "num_images"] },
    { id: "output", fields: ["output_format", "sync_mode"], collapsed: true },
    { id: "advanced", fields: ["acceleration", "enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Ideogram/Ideogram-4.md"],
  outputCount: (p) => (typeof p.num_images === "number" ? p.num_images : 1),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (!draft.prompt.trim()) errors.push(`${c("promptLimit")}: ≥ 1`);
    const editing = draft.references.length > 0;
    const valid = falImageSizeAllowed(draft.parameters.image_size, editing, (width, height) =>
      [width, height].every((side) =>
        editing ? side >= 1 && side <= 14142 : side >= 512 && side <= 3840 && side % 16 === 0,
      ),
    );
    if (!valid) errors.push(`image_size: ${c("invalidDimensions")}`);
    return errors;
  },
  compile: (context) => {
    const parameters = values(fields, context.draft);
    imageSize(parameters);
    const [source] = context.images;
    return request("fal", `https://queue.fal.run/ideogram/v4${source ? "/image-to-image" : ""}`, {
      ...parameters,
      prompt: context.prompt,
      ...(source ? { image_url: source } : {}),
    });
  },
};
