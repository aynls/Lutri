import type { Json, LayerSource, Parameters } from "../domain/types";
import type { Protocol } from "../models/types";
import { array, object, string } from "./transport";
import { layerSource, resultUrl } from "./layers";

export interface RemoteImage {
  remoteId?: string;
  url?: string;
  mediaType?: string;
  error?: string;
  metadata?: Parameters;
  layerSources?: LayerSource[];
}

export function responseMetadata(raw: Json): Parameters {
  const body = object(raw);
  return Object.fromEntries(
    [
      "id",
      "request_id",
      "generation_id",
      "responseId",
      "style_id",
      "description",
      "grounding_metadata",
      "usage",
      "usageMetadata",
      "metrics",
      "seed",
      "conversations",
    ].flatMap((key) => (body[key] === undefined ? [] : [[key, body[key]]])),
  );
}

export function imageResults(protocol: Protocol, raw: Json): RemoteImage[] {
  const result = object(raw);
  if (result.error) throw new Error(JSON.stringify(result.error));
  const separated =
    protocol === "fal"
      ? array(result.layers)
      : protocol === "images" && array(result.data).some((item) => object(item).z_index !== undefined)
        ? array(result.data)
        : [];
  if (separated.length) {
    const sources = separated.map((item) => layerSource(item));
    const base = sources.find((source) => source.zIndex === 0);
    return [{ remoteId: "layers:0", url: base?.url, mediaType: "image/png", layerSources: sources }];
  }
  if (protocol === "bfl") {
    const sample = string(object(result.result).sample);
    return sample ? [{ url: sample }] : [];
  }
  if (protocol === "fal")
    return array(result.images).map((item) => ({
      url: string(object(item).url),
      mediaType: string(object(item).content_type),
    }));
  if (protocol === "qwen")
    return array(object(result.output).choices).flatMap((choice) =>
      array(object(object(choice).message).content).flatMap((part) => {
        const url = string(object(part).image);
        return url ? [{ url }] : [];
      }),
    );
  if (protocol === "gemini")
    return array(result.candidates).flatMap((candidate) =>
      array(object(object(candidate).content).parts).flatMap((part) => {
        const value = object(part),
          inline = object(value.inlineData);
        const data = string(inline.data),
          mime = string(inline.mimeType) ?? "image/png";
        const url = data ? `data:${mime};base64,${data}` : string(object(value.fileData).fileUri);
        return url ? [{ url, mediaType: mime }] : [];
      }),
    );
  if (protocol === "interactions")
    return array(result.steps)
      .filter((step) => object(step).type === "model_output")
      .flatMap((step) => array(object(step).content))
      .flatMap((part) => {
        const value = object(part);
        if (value.type !== "image") return [];
        const data = string(value.data),
          mime = string(value.mime_type) ?? "image/png";
        return [{ url: data ? `data:${mime};base64,${data}` : string(value.uri), mediaType: mime }];
      });
  const sample = string(object(result.result).sample);
  if (sample) return [{ url: sample }];
  return array(result.data).flatMap((item) => {
    const value = object(item);
    const outputFormat = string(value.output_format) ?? string(result.output_format);
    const formatMime = outputFormat === "jpeg" ? "image/jpeg" : outputFormat === "webp" ? "image/webp" : undefined;
    const mime = string(value.media_type) ?? string(value.mime_type) ?? formatMime ?? "image/png";
    const url = resultUrl(value, outputFormat);
    const hasLayers = protocol === "runware" && Array.isArray(object(value.outputs).layers);
    if (!url && !value.error && !hasLayers) return [];
    const layers = protocol === "runware" ? array(object(value.outputs).layers) : [];
    const metadata = Object.fromEntries(
      [
        "z_index",
        "bbox",
        "seed",
        "prompt",
        "resolution",
        ...(hasLayers ? [] : ["outputs"]),
        "is_image_safe",
        "revised_prompt",
        "usage",
        ...(protocol === "runware" ? ["cost"] : []),
      ].flatMap((key) => (value[key] === undefined ? [] : [[key, value[key]]])),
    );
    return [
      {
        remoteId: string(value.imageUUID),
        url,
        mediaType: mime,
        error: value.error ? JSON.stringify(value.error) : undefined,
        metadata,
        ...(hasLayers
          ? { layerSources: [layerSource(value, true), ...layers.map((layer) => layerSource(layer))] }
          : {}),
      },
    ];
  });
}
