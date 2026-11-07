import type { GenerationDraft, Json, Parameters } from "../../domain/types";
import { c } from "../../create/messages";
import { label, localize } from "../../i18n";
import type { ProviderId } from "../types";

export const vectorRatios = [
  "1:1",
  "2:1",
  "1:2",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "5:4",
  "4:5",
  "6:10",
  "14:10",
  "10:14",
  "16:9",
  "9:16",
];
const falSizes = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"];

export const isVectorEdit = (draft: GenerationDraft) =>
  draft.creationMode !== "generate" && (draft.creationMode === "edit" || draft.references.length > 0);

export function vectorPromptErrors(draft: GenerationDraft): string[] {
  return !draft.prompt.trim() || draft.prompt.length > 10000 ? [`${c("promptLimit")}: 1–10000`] : [];
}

export function vectorStyleErrors(
  draft: GenerationDraft,
  options: { required: boolean; exclusive: boolean; uuid4?: boolean },
): string[] {
  const errors: string[] = [];
  const styleId = draft.parameters.style_id;
  const hasStyle = typeof styleId === "string" && !!styleId.trim();
  if (options.required && !hasStyle && !draft.references.length) errors.push(c("styleInputConflict"));
  if (options.exclusive && hasStyle && draft.references.length) errors.push(c("styleInputConflict"));
  const uuid = options.uuid4
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    styleId !== undefined &&
    styleId !== null &&
    styleId !== "" &&
    (typeof styleId !== "string" || !uuid.test(styleId.trim()))
  )
    errors.push(`${localize(label("Style ID", "风格 ID", "スタイル ID"))}: ${options.uuid4 ? "UUID v4" : "UUID"}`);
  return errors;
}

export function falVectorSizeErrors(value: Json | undefined): string[] {
  if (value === undefined || value === null || value === "" || (typeof value === "string" && falSizes.includes(value)))
    return [];
  if (typeof value === "string" && /^\d+\s*[x×*]\s*\d+$/.test(value)) {
    const sides = value.split(/\s*[x×*]\s*/).map(Number);
    if (sides.every((side) => Number.isInteger(side) && side >= 1 && side <= 14142)) return [];
  }
  return [`image_size: ${falSizes.join(", ")} / 1 ≤ W, H ≤ 14142`];
}

const record = (value: Json | undefined): value is Parameters =>
  !!value && typeof value === "object" && !Array.isArray(value);
const channel = (value: Json | undefined) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;

/** Color encodings and weight support are provider contracts, not interchangeable RGB objects. */
export function vectorColorErrors(
  p: Parameters,
  provider: Extract<ProviderId, "recraft" | "runware" | "fal">,
): string[] {
  const errors: string[] = [];
  const valid = (value: Json): boolean => {
    if (!record(value)) return false;
    if (provider === "fal")
      return (
        Object.keys(value).every((key) => ["r", "g", "b"].includes(key)) &&
        ["r", "g", "b"].every((key) => value[key] === undefined || channel(value[key]))
      );
    return (
      Array.isArray(value.rgb) &&
      value.rgb.length === 3 &&
      value.rgb.every(channel) &&
      Object.keys(value).every((key) => key === "rgb" || (provider === "recraft" && key === "weight")) &&
      (value.weight === undefined ||
        value.weight === null ||
        (typeof value.weight === "number" && Number.isFinite(value.weight) && value.weight >= 0 && value.weight <= 1))
    );
  };
  const colors = p.colors;
  if (colors !== undefined && colors !== null) {
    if (!Array.isArray(colors) || !colors.every(valid))
      errors.push(`${localize(label("Palette", "配色", "パレット"))}: RGB 0–255`);
    else if (provider === "recraft") {
      if (colors.length > 10) errors.push(`${localize(label("Palette", "配色", "パレット"))}: ≤ 10`);
      const weights = colors
        .map((color) => (color as Parameters).weight)
        .filter((weight) => weight !== undefined && weight !== null);
      if (
        (weights.length > 0 && weights.length !== colors.length) ||
        weights.reduce<number>((sum, weight) => sum + Number(weight), 0) > 1 + Number.EPSILON
      )
        errors.push(
          localize(
            label(
              "Set every color weight; total ≤ 1",
              "请设置全部颜色权重，合计 ≤ 1",
              "全色の重みを指定してください。合計 ≤ 1",
            ),
          ),
        );
    }
  }
  if (p.background_color !== undefined && p.background_color !== null && !valid(p.background_color))
    errors.push(`${localize(label("Background color", "背景色", "背景色"))}: RGB 0–255`);
  return errors;
}
