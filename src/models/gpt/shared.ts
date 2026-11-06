import type { GenerationDraft } from "../../domain/types";
import { adv, number, select } from "../fields";
import type { ParameterGroup } from "../types";

export const quality = () =>
  select("quality", ["Quality", "质量", "品質"], ["auto", "low", "medium", "high", "xhigh", "max"]);
export const background = () => select("background", ["Background", "背景", "背景"], ["auto", "transparent", "opaque"]);
export const moderation = () => adv(select("moderation", ["Moderation", "审核", "モデレーション"], ["auto", "low"]));
export const compression = () => ({
  ...number("output_compression", ["Compression quality", "压缩质量", "圧縮品質"], 0, 100),
  advanced: true,
  visible: (draft: GenerationDraft) => draft.parameters.output_format !== "png",
});

export const groups: ParameterGroup[] = [
  { id: "frame", fields: ["aspect_ratio", "size", "image_size", "width", "height"] },
  { id: "generation", fields: ["quality", "background", "n", "num_images", "numberResults"] },
  {
    id: "output",
    fields: ["output_format", "outputFormat", "output_compression", "outputQuality", "stream", "sync_mode"],
    collapsed: true,
  },
  { id: "advanced", fields: ["moderation", "enable_safety_checker", "user"], collapsed: true },
];

export function sizeErrors(draft: GenerationDraft): string[] {
  const size = draft.parameters.image_size ?? draft.parameters.size;
  return typeof size === "string" &&
    /^\d+\s*[x×*]\s*\d+$/.test(size) &&
    size
      .split(/\s*[x×*]\s*/)
      .map(Number)
      .some((side) => side % 16 !== 0 || side > 3840)
    ? ["size: 16px / ≤3840px"]
    : [];
}
