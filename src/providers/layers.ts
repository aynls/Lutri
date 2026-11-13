import type { Json, LayerSource } from "../domain/types";
import { array, object, string } from "./transport";
import { resultUrl } from "./media";

export function layerSource(raw: Json, base = false): LayerSource {
  const value = object(raw);
  const image = value.image ? object(value.image) : value;
  const layer = value.layer ? object(value.layer) : value;
  const box = object(layer.bounding_box ?? layer.boundingBox);
  const zIndex = layer.z_index ?? layer.zIndex;
  return {
    url: resultUrl(image) ?? "",
    zIndex: base ? 0 : typeof zIndex === "number" ? zIndex : -1,
    bounds:
      box.absolute === undefined
        ? undefined
        : array(box.absolute).map((value) => (typeof value === "number" ? value : -1)),
    normalizedBounds:
      box.normalized === undefined
        ? undefined
        : array(box.normalized).map((value) => (typeof value === "number" ? value : -1)),
    name: string(layer.name),
    description: string(layer.description),
  };
}

export function validateLayerSources(sources: LayerSource[], maxLayers: number): string | undefined {
  if (
    sources.length < 2 ||
    sources.length > maxLayers + 1 ||
    sources.filter((source) => source.zIndex === 0).length !== 1 ||
    new Set(sources.map((source) => source.zIndex)).size !== sources.length ||
    sources.some(
      (source) =>
        !source.url || !Number.isSafeInteger(source.zIndex) || source.zIndex < 0 || source.zIndex > 4294967295,
    )
  )
    return "invalid_layer_result";
  for (const source of sources.filter((layer) => layer.zIndex !== 0)) {
    const bounds = source.bounds ?? source.normalizedBounds;
    if (
      !bounds ||
      bounds.length !== 4 ||
      bounds.some((value) => !Number.isFinite(value) || value < 0) ||
      bounds[2] <= bounds[0] ||
      bounds[3] <= bounds[1] ||
      (!source.bounds && bounds.some((value) => value > 1000))
    )
      return "invalid_layer_bounds";
  }
}
