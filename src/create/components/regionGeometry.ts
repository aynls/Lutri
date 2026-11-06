import type { GalleryEntry, GenerationDraft, Rectangle, Region } from "../../domain/types";
import type { Rect } from "../../components/canvas/geometry";

export const regionColors = ["#c78a57", "#669baa", "#a38ac2", "#7ba17c", "#c47883", "#b3a258"];
export const toPixels = (box: Rectangle, width: number, height: number): Rect => ({
  x: (box[1] * width) / 1000,
  y: (box[0] * height) / 1000,
  w: ((box[3] - box[1]) * width) / 1000,
  h: ((box[2] - box[0]) * height) / 1000,
});
export const toNormalized = (rect: Rect, width: number, height: number): Rectangle => {
  const top = Math.max(0, Math.min(999, Math.round((rect.y / height) * 1000)));
  const left = Math.max(0, Math.min(999, Math.round((rect.x / width) * 1000)));
  return [
    top,
    left,
    Math.max(top + 1, Math.min(1000, Math.round(((rect.y + rect.h) / height) * 1000))),
    Math.max(left + 1, Math.min(1000, Math.round(((rect.x + rect.w) / width) * 1000))),
  ];
};
export function outputFrame(draft: GenerationDraft, gallery: GalleryEntry[]) {
  const p = draft.parameters;
  if (Number(p.width) > 0 && Number(p.height) > 0) return { width: Number(p.width), height: Number(p.height) };
  const objectSize = p.image_size;
  if (
    objectSize &&
    typeof objectSize === "object" &&
    !Array.isArray(objectSize) &&
    Number(objectSize.width) > 0 &&
    Number(objectSize.height) > 0
  )
    return { width: Number(objectSize.width), height: Number(objectSize.height) };
  const size = String(p.size ?? p.image_size ?? "").match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (size && +size[1] && +size[2]) return { width: +size[1], height: +size[2] };
  const ratio = String(p.aspect_ratio ?? "").match(/^(\d+):(\d+)$/);
  const edge =
    ({ "768sq": 768, "1k": 1024, "1.5k": 1536, "2k": 2048, "4k": 4096 } as Record<string, number>)[
      String(p.resolution).toLowerCase()
    ] ?? 1024;
  if (ratio)
    return {
      width: Math.round(edge * Math.sqrt(+ratio[1] / +ratio[2])),
      height: Math.round(edge / Math.sqrt(+ratio[1] / +ratio[2])),
    };
  const source =
    draft.creationMode === "edit" ? draft.references.find((ref) => ref.id === draft.editTargetId) : draft.references[0];
  const reference = gallery.find((entry) => entry.asset.id === source?.assetId);
  return reference ? { width: reference.asset.width, height: reference.asset.height } : { width: edge, height: edge };
}
export function operation(region: Region): NonNullable<Region["operation"]> {
  return region.operation ?? (!region.referenceId ? "place" : !region.target ? "remove" : "move");
}
