import type { Parameters } from "../domain/types";
import { imageMediaType, imageSourceMediaType } from "../domain/media";
import { string } from "./transport";

function sourceUrl(value: Parameters): string | undefined {
  return string(value.url) ?? string(value.imageURL) ?? string(value.imageDataURI);
}

export function resultMediaType(value: Parameters, fallbackFormat?: string): string | undefined {
  return (
    imageMediaType(string(value.content_type)) ??
    imageMediaType(string(value.media_type)) ??
    imageMediaType(string(value.mime_type)) ??
    imageMediaType(string(value.output_format)) ??
    imageMediaType(string(value.outputFormat)) ??
    imageMediaType(fallbackFormat) ??
    imageSourceMediaType(sourceUrl(value))
  );
}

export function resultUrl(value: Parameters, fallbackFormat?: string): string | undefined {
  const source = sourceUrl(value);
  if (source) return source;
  const base64 = string(value.b64_json) ?? string(value.imageBase64Data);
  if (!base64) return undefined;
  // The asset writer detects the actual format; unknown bytes must not be labelled PNG.
  const mime = resultMediaType(value, fallbackFormat) ?? "application/octet-stream";
  return `data:${mime};base64,${base64}`;
}
