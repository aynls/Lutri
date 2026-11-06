import { ParameterFields } from "../../../create/components/Fields";
import { adv, json, select, text, toggle } from "../../fields";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  select("rendering_speed", ["Rendering speed", "渲染速度", "描画速度"], ["TURBO", "DEFAULT", "QUALITY"]),
  adv(json("structured_prompt", ["Structured prompt", "结构化提示词", "構造化プロンプト"])),
  {
    ...text("size", ["Image size", "图片尺寸", "画像サイズ"]),
    visible: (d) => !d.mask && d.parameters.edit_mode !== "precise",
  },
  adv(toggle("enable_copyright_detection", ["Copyright detection", "版权检测", "著作権チェック"])),
];

export const ideogram40Comfy: ModelCombination = {
  id: "ideogram-4.0:comfy",
  model: "ideogram-4.0",
  family: "Ideogram",
  label: "Ideogram 4.0",
  provider: "comfy",
  protocol: "images",
  maxReferences: 0,
  mask: undefined,
  fields,
  inputPolicy: (draft) => ({
    maxBytes:
      draft.parameters.context_window && draft.parameters.edit_mode === "precise" ? 50_000_000 : 25 * 1024 * 1024,
    totalBytes: (draft.parameters.context_window && draft.parameters.edit_mode === "precise" ? 128 : 64) * 1024 * 1024,
    mediaTypes: ["image/png", "image/webp", "image/jpeg"],
  }),
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
    if (draft.parameters.quality === "very_low" && !draft.references.length) errors.push("very_low: references ≥ 1");
    if (draft.mask && draft.references.length > 4) errors.push("mask: references ≤ 4");
    if (draft.parameters.context_window === "auto" && !draft.mask) errors.push("context_window auto: mask");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const structured = p.structured_prompt;
    delete p.structured_prompt;
    if (p.size) {
      p.resolution = p.size;
      delete p.size;
    }
    const compiled = request("comfy", "https://api.comfy.org/v2/models/ideogram/ideogram-v4", {
      ...p,
      ...(structured ? { json_prompt: structured } : { text_prompt: context.prompt }),
      ...(context.images.length ? { images: context.images } : {}),
      ...(context.mask ? { mask: context.mask } : {}),
    });
    compiled.authHeader = "X-API-Key";
    compiled.authPrefix = "";
    return compiled;
  },
};
