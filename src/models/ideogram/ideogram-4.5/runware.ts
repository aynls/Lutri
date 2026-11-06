import { ParameterFields } from "../../../create/components/Fields";
import { count, seed, select, text } from "../../fields";
import { runware, take } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  {
    ...select("edit_mode", ["Edit mode", "编辑方式", "編集モード"], ["generate", "precise"]),
    visible: () => false,
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
    visible: (d) => d.parameters.edit_mode !== "precise" && !d.references.length,
  },
  seed(),
  count("numberResults", 20),
];

export const ideogram45Runware: ModelCombination = {
  id: "ideogram-4.5:runware",
  model: "ideogram-4.5",
  family: "Ideogram",
  label: "Ideogram 4.5",
  provider: "runware",
  protocol: "runware",
  maxReferences: 5,
  mask: "white",
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
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.prompt.length > 10000) errors.push("prompt ≤ 10000");
    if (draft.parameters.quality === "very_low" && !draft.references.length) errors.push("very_low: references ≥ 1");
    if (draft.mask && draft.references.length > 4) errors.push("mask: references ≤ 4");
    if (draft.parameters.context_window === "auto" && !draft.mask) errors.push("context_window auto: mask");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    delete p.edit_mode;
    if (p.size) {
      const [width, height] = String(p.size).split("x").map(Number);
      p.width = width;
      p.height = height;
      delete p.size;
    }
    const settings = take(p, {
      quality: "quality",
      magic_prompt: "magicPrompt",
      rendering_speed: "renderingSpeed",
      structured_prompt: "structuredPrompt",
    });
    return runware("ideogram:4.5@0", p, context, settings);
  },
};
