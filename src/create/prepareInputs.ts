import type { GenerationDraft } from "../domain/types";
import type { ModelCombination } from "../models/types";
import { assetData } from "../services/native";
import { prepareMask } from "../services/masks";
import { c } from "./messages";

async function bitmap(data: string) {
  const response = await fetch(data);
  return createImageBitmap(await response.blob(), { imageOrientation: "from-image" });
}

function encode(image: ImageBitmap, width: number, height: number, smooth = true, mime = "image/png") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(c("invalidDimensions"));
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(mime, 0.95);
}

const bytes = (data: string) => {
  const payload = data.slice(data.indexOf(",") + 1);
  return Math.floor((payload.length * 3) / 4) - (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0);
};
const policyFor = (draft: GenerationDraft, combination: ModelCombination) =>
  typeof combination.inputPolicy === "function" ? combination.inputPolicy(draft) : (combination.inputPolicy ?? {});

export function preparedDimensions(
  width: number,
  height: number,
  draft: GenerationDraft,
  combination: ModelCombination,
) {
  const policy = policyFor(draft, combination);
  const maximum = Math.min(draft.inputPreparation?.maxEdge ?? Infinity, policy.maxEdge ?? Infinity);
  const factor = Math.min(
    1,
    maximum / Math.max(width, height),
    Math.sqrt((policy.maxPixels ?? Infinity) / (width * height)),
  );
  const result = { width: Math.max(1, Math.floor(width * factor)), height: Math.max(1, Math.floor(height * factor)) };
  if (
    Math.min(result.width, result.height) < (policy.minEdge ?? 1) ||
    result.width * result.height < (policy.minPixels ?? 1) ||
    Math.max(result.width / result.height, result.height / result.width) > (policy.maxRatio ?? Infinity)
  )
    throw new Error(`${c("inputLimit")}: ${result.width} × ${result.height}`);
  return result;
}

function assertOpaque(image: ImageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(c("invalidDimensions"));
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  for (let index = 3; index < pixels.length; index += 4)
    if (pixels[index] !== 255) throw new Error(c("alphaUnsupported"));
}

/** Prepare sending copies. Regions use normalized coordinates, so uniform resizing preserves them. */
export async function prepareGenerationInputs(draft: GenerationDraft, combination: ModelCombination) {
  const maximum = draft.inputPreparation?.maxEdge;
  if (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 256 || maximum > 8192))
    throw new Error(`${c("maxEdge")}: 256–8192`);
  if (draft.inputPreparation && draft.inputPreparation.version !== 1) throw new Error(c("prepare"));
  const originals = await Promise.all(draft.references.map((ref) => assetData(ref.assetId)));
  const policy = policyFor(draft, combination);
  const dimensions: { width: number; height: number }[] = [];
  const images: string[] = [];
  for (const original of originals) {
    const image = await bitmap(original);
    try {
      const { width, height } = preparedDimensions(image.width, image.height, draft, combination);
      dimensions.push({ width, height });
      const mime = original.slice(5, original.indexOf(";"));
      if (policy.opaque) assertOpaque(image);
      const needsEncoding =
        width !== image.width ||
        height !== image.height ||
        (policy.mediaTypes && !policy.mediaTypes.includes(mime)) ||
        policy.opaque;
      const encoded = needsEncoding
        ? encode(image, width, height, true, policy.opaque ? "image/jpeg" : "image/png")
        : original;
      if (policy.maxEncodedBytes && encoded.slice(encoded.indexOf(",") + 1).length > policy.maxEncodedBytes)
        throw new Error(c("inputLimit"));
      if (policy.maxBytes && bytes(encoded) > policy.maxBytes)
        throw new Error(`${c("inputLimit")}: ${(bytes(encoded) / 1_000_000).toFixed(1)} MB`);
      images.push(encoded);
    } finally {
      image.close();
    }
  }
  let mask: string | undefined;
  if (draft.mask && combination.mask) {
    if (draft.references[0]?.id !== draft.mask.referenceId) throw new Error(c("maskRemoved"));
    const original = await assetData(draft.mask.assetId);
    const image = await bitmap(original);
    const source = await bitmap(originals[0]);
    try {
      if (image.width !== source.width || image.height !== source.height) throw new Error(c("invalidDimensions"));
      const { width, height } = dimensions[0];
      mask = await prepareMask(encode(image, width, height, false), combination.mask);
      if (policy.maskBytes && bytes(mask) > policy.maskBytes)
        throw new Error(`${c("inputLimit")}: ${c("prepare")} mask`);
    } finally {
      image.close();
      source.close();
    }
  }
  if (
    policy.totalBytes &&
    images.reduce((total, data) => total + bytes(data), mask ? bytes(mask) : 0) > policy.totalBytes
  )
    throw new Error(c("inputLimit"));
  return { draft, images, mask };
}
