import type { GenerationDraft } from "../../domain/types";
import { localize, label } from "../../i18n";
import { select } from "../fields";
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

export function validateFalSvg(draft: GenerationDraft): string[] {
  if (draft.parameters.output_format !== "svg") return [];
  const errors: string[] = [];
  if (draft.references.length || draft.mask)
    errors.push(localize(label("SVG requires text-only input", "SVG 仅支持文字输入", "SVG はテキスト入力のみ対応")));
  if (Number(draft.parameters.num_images ?? 1) !== 1)
    errors.push(localize(label("SVG: one image per request", "SVG：单次生成 1 张", "SVG：リクエストごとに 1 枚")));
  return errors;
}

const isSvg = (draft: GenerationDraft) => draft.parameters.outputFormat === "SVG";
export const svgFields: FieldDefinition[] = [
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
    visible: isSvg,
  },
  {
    ...select(
      "svg_thinking",
      ["SVG reasoning", "SVG 推理强度", "SVG 推論強度"],
      ["none", "low", "medium", "high", "xhigh", "max"],
    ),
    visible: isSvg,
  },
];

export function validateSvg(draft: GenerationDraft): string[] {
  if (!isSvg(draft)) return [];
  const errors: string[] = [];
  if (draft.references.length || draft.mask)
    errors.push(localize(label("SVG requires text-only input", "SVG 仅支持文字输入", "SVG はテキスト入力のみ対応")));
  if (Number(draft.parameters.numberResults ?? 1) !== 1)
    errors.push(localize(label("SVG: one image per request", "SVG：单次生成 1 张", "SVG：リクエストごとに 1 枚")));
  const model = draft.parameters.svg_model ?? "openai:gpt@5.4-mini";
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
