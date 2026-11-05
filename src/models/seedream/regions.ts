import type { CompileContext } from "../types";
import type { Rectangle } from "../../domain/types";

/** Seedream uses x0,y0,x1,y1 in [0,999]; FLUX's stored rectangle is y0,x0,y1,x1 in [0,1000]. */
function bbox(rectangle: Rectangle): string {
  const [top, left, bottom, right] = rectangle.map((value) => Math.max(0, Math.min(999, Math.floor(value))));
  return `<bbox>${Math.min(left, 998)} ${Math.min(top, 998)} ${Math.max(Math.min(left, 998) + 1, right)} ${Math.max(Math.min(top, 998) + 1, bottom)}</bbox>`;
}

export function seedreamRegions(context: CompileContext): string {
  return [
    context.prompt,
    ...context.draft.regions.map((region) => {
      const index = context.draft.references.findIndex((reference) => reference.id === region.referenceId);
      const source = index >= 0 && region.source ? `Image ${index + 1} ${bbox(region.source)}` : undefined;
      const target = region.target ? `${context.images.length ? "Image 1 " : ""}${bbox(region.target)}` : undefined;
      if (source && !target) return `Remove the object at ${source}. ${region.description}`;
      if (source && target)
        return `${region.operation === "anchor" ? "Keep" : "Place"} the subject from ${source} at ${target}. ${region.description}`;
      return `${target ?? ""} ${region.description}`.trim();
    }),
  ]
    .filter(Boolean)
    .join("\n");
}
