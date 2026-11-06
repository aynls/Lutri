import { ParameterFields } from "../../../create/components/Fields";
import { count, seed, select, text } from "../../fields";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  select("rendering_speed", ["Rendering speed", "渲染速度", "描画速度"], ["turbo", "default", "quality"]),
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

export const ideogram40Ideogram: ModelCombination = {
  id: "ideogram-4.0:ideogram",
  model: "ideogram-4.0",
  family: "Ideogram",
  label: "Ideogram 4.0",
  provider: "ideogram",
  protocol: "ideogram",
  maxReferences: 0,
  mask: undefined,
  fields,
  primaryReference: false,
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
    if (draft.mask && draft.parameters.edit_mode !== "precise") errors.push("mask: precise edit");
    if (draft.parameters.quality === "very_low" && !draft.references.length) errors.push("very_low: references ≥ 1");
    if (draft.mask && draft.references.length > 4) errors.push("mask: references ≤ 4");
    if (draft.parameters.context_window === "auto" && !draft.mask) errors.push("context_window auto: mask");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    if (p.size) {
      p.resolution = p.size;
      delete p.size;
    }
    const compiled = request("ideogram", "https://api.ideogram.ai/v2/image/generate/ideogram-4", {
      ...p,
      prompt: context.prompt,
      async: true,
    });
    if (context.images.length) {
      delete compiled.body;
      compiled.multipart = [
        { name: "prompt", text: context.prompt },
        { name: "async", text: "true" },
        ...Object.entries(p).map(([name, value]) => ({
          name,
          text: typeof value === "string" ? value : JSON.stringify(value),
        })),
        ...context.images.map((dataUrl) => ({
          name: "images",
          dataUrl,
        })),
        ...(context.mask ? [{ name: "mask", dataUrl: context.mask }] : []),
      ];
    }
    return compiled;
  },
};
