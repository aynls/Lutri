import type { GenerationDraft } from "../../domain/types";
import { localize, label } from "../../i18n";
import { select, text } from "../fields";
import type { FieldDefinition, ParameterGroup } from "../types";
import { groups } from "./shared";

export const complexity = (key = "complexity") =>
  select(key, ["Complexity", "复杂度", "複雑度"], ["low", "medium", "high"]);

export const groups26: ParameterGroup[] = groups.map((group) => ({
  ...group,
  fields: [
    ...group.fields,
    ...(group.id === "generation"
      ? ["complexity", "reasoning_effort"]
      : group.id === "output"
        ? ["svg_model", "svg_thinking"]
        : []),
  ],
}));

export const falSvgModel: FieldDefinition = {
  ...select(
    "svg_model",
    ["SVG author", "SVG 转写模型", "SVG 作成モデル"],
    ["gpt-6-astra", "gpt-5.5", "gpt-5.4", "gpt-5.6-terra", "gpt-6-luna"],
  ),
  visible: (draft) => draft.parameters.output_format === "svg" && !draft.references.length,
};

function svgInputErrors(draft: GenerationDraft, singleImageKey?: string): string[] {
  const errors: string[] = [];
  if (draft.references.length || draft.mask)
    errors.push(localize(label("SVG requires text-only input", "SVG 仅支持文字输入", "SVG はテキスト入力のみ対応")));
  if (singleImageKey && Number(draft.parameters[singleImageKey] ?? 1) !== 1)
    errors.push(localize(label("SVG: one image per request", "SVG：单次生成 1 张", "SVG：リクエストごとに 1 枚")));
  return errors;
}

export function validateFalSvg(draft: GenerationDraft): string[] {
  return draft.parameters.output_format === "svg" ? svgInputErrors(draft, "num_images") : [];
}

const isOpenAISvg = (draft: GenerationDraft) => draft.parameters.output_format === "svg";
export const openAISvgFields: FieldDefinition[] = [
  {
    ...text("svg_model", ["SVG author", "SVG 转写模型", "SVG 作成モデル"]),
    visible: isOpenAISvg,
  },
  {
    ...select(
      "svg_thinking",
      ["SVG reasoning", "SVG 推理强度", "SVG 推論強度"],
      ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    ),
    visible: isOpenAISvg,
  },
];

export function validateOpenAISvg(draft: GenerationDraft): string[] {
  if (!isOpenAISvg(draft)) return [];
  const errors = svgInputErrors(draft, "n");
  const model = draft.parameters.svg_model;
  const hasModel = typeof model === "string" && model.trim().length > 0;
  if ((typeof model === "string" && model.length > 0 && !hasModel) || (draft.parameters.svg_thinking && !hasModel))
    errors.push(localize(label("Choose an SVG author", "请指定 SVG 转写模型", "SVG 作成モデルを指定してください")));
  if (draft.parameters.background === "transparent")
    errors.push(
      localize(
        label(
          "Transparent background requires PNG or WebP",
          "透明背景需使用 PNG 或 WebP",
          "透明背景には PNG または WebP が必要です",
        ),
      ),
    );
  return errors;
}

const isRunwareSvg = (draft: GenerationDraft) => draft.parameters.outputFormat === "SVG";
export const runwareSvgFields: FieldDefinition[] = [
  {
    ...select(
      "svg_model",
      ["SVG author", "SVG 转写模型", "SVG 作成モデル"],
      [
        "openai:gpt@5.4-mini",
        "openai:gpt@5.4",
        "openai:gpt@5.5",
        "openai:gpt@5.6-terra",
        "openai:gpt@6-luna",
        "openai:gpt@6-astra",
      ],
    ),
    visible: isRunwareSvg,
  },
  {
    ...select(
      "svg_thinking",
      ["SVG reasoning", "SVG 推理强度", "SVG 推論強度"],
      ["none", "low", "medium", "high", "xhigh", "max"],
    ),
    visible: isRunwareSvg,
  },
];

export function validateRunwareSvg(draft: GenerationDraft): string[] {
  if (!isRunwareSvg(draft)) return [];
  const errors = svgInputErrors(draft);
  const model = draft.parameters.svg_model || "openai:gpt@5.4-mini";
  const effort = draft.parameters.svg_thinking;
  if (
    (effort === "none" && model === "openai:gpt@6-astra") ||
    (effort === "max" && ["openai:gpt@5.4-mini", "openai:gpt@5.4", "openai:gpt@5.5"].includes(String(model)))
  )
    errors.push(
      localize(
        label("Unsupported SVG reasoning level", "SVG 模型不支持此推理强度", "SVG モデルが対応しない推論強度です"),
      ),
    );
  return errors;
}
