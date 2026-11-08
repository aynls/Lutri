import { label } from "../../i18n";
import { adv, select, text, toggle } from "../fields";
import type { CompileContext, FieldDefinition } from "../types";

export const safety = (max: number): FieldDefinition => ({
  ...select(
    "safety_tolerance",
    ["Safety tolerance", "审核容忍度", "安全許容度"],
    Array.from({ length: max + 1 }, (_, value) => String(value)),
  ),
  integer: true,
  min: 0,
  max,
  optionLabels: {
    0: label("0 (Strictest)", "0（最严格）", "0（最も厳格）"),
    2: label("2 (Default)", "2（默认）", "2（既定）"),
    [max]: label(`${max} (Most permissive)`, `${max}（最宽松）`, `${max}（最も寛容）`),
  },
});

export const grounding = () => toggle("grounding", ["Web search", "联网搜索", "ウェブ検索"]);

export const version = () => adv(text("version", ["Version", "版本", "バージョン"]));

export const user = () => adv(text("user", ["User identifier", "用户标识", "ユーザー識別子"], 256));

export function promptWithRegions(context: CompileContext): string {
  if (!context.draft.regions.length) return context.prompt;
  const regions = context.draft.regions.map((region) =>
    context.images.length
      ? {
          id: region.id,
          desc: region.description,
          from: region.referenceId
            ? `ref_image_${context.draft.references.findIndex((reference) => reference.id === region.referenceId)}`
            : null,
          src_bbox: region.source ?? null,
          tgt_bbox: region.target ?? null,
        }
      : { id: region.id, desc: region.description, bbox: region.target },
  );
  return `${context.prompt}\n${JSON.stringify(regions)}`;
}

export const nativeResolutions = ["768sq", "1k", "1.5k", "2k", "4k"];
