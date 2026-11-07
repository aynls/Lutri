import type { Asset } from "./types";

/** Normalize provider format names and MIME declarations without assuming PNG. */
export function imageMediaType(value?: string): string | undefined {
  const type = value?.split(";", 1)[0].trim().toLowerCase();
  switch (type) {
    case "svg":
    case "image/svg":
    case "image/svg+xml":
      return "image/svg+xml";
    case "jpg":
    case "jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "png":
    case "webp":
    case "gif":
    case "bmp":
    case "avif":
      return `image/${type}`;
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return type?.startsWith("image/") ? type : undefined;
  }
}

/** A source hint only; saved assets use the type detected from their bytes. */
export function imageSourceMediaType(source?: string): string | undefined {
  if (!source) return undefined;
  if (source.startsWith("data:")) return imageMediaType(source.slice(5).split(/[;,]/, 1)[0]);
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return imageMediaType(url.pathname.match(/\.([a-z0-9]+)$/i)?.[1]);
  } catch {
    return undefined;
  }
}

export const isSvgAsset = (asset: Asset) => imageMediaType(asset.mediaType) === "image/svg+xml";
