import type { Json, LayerSource, Parameters } from "../domain/types";
import { array, object, string } from "./transport";

export function resultUrl(value: Parameters, fallbackFormat?: string): string | undefined {
  const format = string(value.output_format) ?? fallbackFormat;
  const mime =
    string(value.content_type) ??
    string(value.media_type) ??
    string(value.mime_type) ??
    (format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png");
  const base64 = string(value.b64_json) ?? string(value.imageBase64Data);
  return (
    string(value.url) ??
    string(value.imageURL) ??
    string(value.imageDataURI) ??
    (base64 ? `data:${mime};base64,${base64}` : undefined)
  );
}

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
