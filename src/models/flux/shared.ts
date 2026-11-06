import { adv, number, text, toggle } from "../fields";
import type { CompileContext } from "../types";

export const safety = (max: number) =>
  number("safety_tolerance", ["Safety tolerance", "审核容忍度", "安全許容度"], 0, max);

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
