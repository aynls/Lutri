import type { Json, LayerSource } from "../domain/types";
import { array, object, string } from "./transport";
import { resultUrl } from "./media";

export function layerSource(raw: Json, base = false): LayerSource {
  const value = object(raw);
  const image = value.image ? object(value.image) : value;
  const box = object(value.bounding_box ?? value.boundingBox);
  return {
    url: resultUrl(image) ?? "",
    zIndex: base ? 0 : Number(value.z_index ?? value.zIndex),
    bounds: box.absolute === undefined ? undefined : array(box.absolute).map(Number),
    normalizedBounds: box.normalized === undefined ? undefined : array(box.normalized).map(Number),
    name: string(value.name),
    description: string(value.description),
  };
}
