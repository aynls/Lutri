import { c } from "../../../create/messages";
import { ParameterFields } from "../../../create/components/Fields";
import { count, seed, select, text } from "../../fields";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  {
    ...select("edit_mode", ["Edit mode", "编辑方式", "編集モード"], ["generate", "precise"]),
    optionLabels: {
      generate: { en: "Standard edit", zh: "常规编辑", ja: "通常編集" },
      precise: { en: "Precise edit", zh: "精确编辑", ja: "精密編集" },
    },
    visible: (d) => d.references.length > 0 || d.parameters.edit_mode === "precise",
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
];

export const ideogram45Ideogram: ModelCombination = {
  id: "ideogram-4.5:ideogram",
  model: "ideogram-4.5",
  family: "Ideogram",
  label: "Ideogram 4.5",
  provider: "ideogram",
  protocol: "ideogram",
  maxReferences: 5,
  mask: "black",
  fields,
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
    if (draft.parameters.edit_mode === "precise" && !draft.references.length) errors.push(c("chooseEditTarget"));
    if (draft.prompt.length > 10000) errors.push("prompt ≤ 10000");
    if (draft.mask && draft.parameters.edit_mode !== "precise") errors.push("mask: precise edit");
    if (draft.parameters.quality === "very_low" && !draft.references.length) errors.push("very_low: references ≥ 1");
    if (draft.mask && draft.references.length > 4) errors.push("mask: references ≤ 4");
    if (draft.parameters.context_window === "auto" && !draft.mask) errors.push("context_window auto: mask");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft),
      precise = p.edit_mode === "precise";
    if (precise && !context.images.length) throw new Error(c("chooseEditTarget"));
    delete p.edit_mode;
    if (p.size) {
      p.resolution = p.size;
      delete p.size;
    }
    const compiled = request(
      "ideogram",
      `https://api.ideogram.ai/v2/image/${precise ? "precise-edit" : "generate"}/ideogram-4-5`,
      { ...p, prompt: context.prompt, async: true },
    );
    if (context.images.length) {
      delete compiled.body;
      compiled.multipart = [
        { name: "prompt", text: context.prompt },
        { name: "async", text: "true" },
        ...Object.entries(p).map(([name, value]) => ({
          name,
          text: typeof value === "string" ? value : JSON.stringify(value),
        })),
        ...context.images.map((dataUrl, index) => ({
          name: precise ? (index === 0 ? "image" : "reference_images") : "images",
          dataUrl,
        })),
        ...(context.mask ? [{ name: "mask", dataUrl: context.mask }] : []),
      ];
    }
    return compiled;
  },
};
