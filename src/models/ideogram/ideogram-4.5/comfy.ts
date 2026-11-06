import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, seed, select, text, toggle } from "../../fields";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  {
    ...select("edit_mode", ["Edit mode", "编辑方式", "編集モード"], ["generate", "precise"]),
    visible: (d) => d.references.length > 0,
  },
  select("quality", ["Quality", "质量", "品質"], ["very_low", "low", "medium", "high"]),
  {
    ...text("context_window", ["Context window", "上下文区域", "コンテキスト領域"]),
    advanced: true,
    visible: (d) => d.parameters.edit_mode === "precise",
  },
  {
    ...text("size", ["Image size", "图片尺寸", "画像サイズ"]),
    visible: (d) => !d.mask && d.parameters.edit_mode !== "precise",
  },
  {
    ...select("magic_prompt", ["Magic prompt", "提示词增强", "プロンプト強化"], ["auto", "on", "off"]),
    visible: (d) => d.parameters.edit_mode !== "precise",
  },
  seed(),
  count("num_images", 8),
  adv(toggle("enable_copyright_detection", ["Copyright detection", "版权检测", "著作権チェック"])),
];

export const ideogram45Comfy: ModelCombination = {
  id: "ideogram-4.5:comfy",
  model: "ideogram-4.5",
  family: "Ideogram",
  label: "Ideogram 4.5",
  provider: "comfy",
  protocol: "images",
  maxReferences: 5,
  mask: "black",
  fields,
  inputPolicy: (draft) => ({
    maxBytes:
      draft.parameters.context_window && draft.parameters.edit_mode === "precise" ? 50_000_000 : 25 * 1024 * 1024,
    totalBytes: (draft.parameters.context_window && draft.parameters.edit_mode === "precise" ? 128 : 64) * 1024 * 1024,
    mediaTypes: ["image/png", "image/webp", "image/jpeg"],
  }),
  primaryReference: true,
  promptLimit: { max: 10000 },
  groups: [
    { id: "frame", fields: ["size"] },
    {
      id: "generation",
      fields: ["edit_mode", "quality", "rendering_speed", "magic_prompt", "seed", "num_images", "numberResults"],
    },
    {
      id: "advanced",
      fields: ["context_window", "structured_prompt", "enable_copyright_detection"],
      collapsed: true,
    },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Ideogram/Ideogram-4.md"],
  outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.prompt.length > 10000) errors.push("prompt ≤ 10000");
    if (draft.parameters.quality === "very_low" && !draft.references.length) errors.push("very_low: references ≥ 1");
    if (draft.mask && draft.references.length > 4) errors.push("mask: references ≤ 4");
    if (draft.parameters.context_window === "auto" && !draft.mask) errors.push("context_window auto: mask");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft),
      precise = p.edit_mode === "precise" && context.images.length > 0;
    delete p.edit_mode;
    const compiled = request("comfy", "https://api.comfy.org/v2/models/ideogram/ideogram-4-5", {
      ...p,
      prompt: context.prompt,
      ...(context.images.length
        ? precise
          ? { image: context.images[0], reference_images: context.images.slice(1) }
          : { images: context.images }
        : {}),
      ...(context.mask ? { mask: context.mask } : {}),
    });
    compiled.authHeader = "X-API-Key";
    compiled.authPrefix = "";
    return compiled;
  },
};
