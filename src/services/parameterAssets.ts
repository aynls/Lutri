import type { Json } from "../domain/types";
import { assetData, importAsset } from "./native";

/** Native conversation JSON retains its structure; binary images become gallery references. */
export async function storeParameterAssets(value: Json, key = "", known = new Map<string, string>()): Promise<Json> {
  if (typeof value === "string" && known.has(value)) return { $asset: known.get(value)!, encoding: "data-url" };
  if (
    typeof value === "string" &&
    /^https?:\/\//.test(value) &&
    ["image", "images", "image_url", "image_urls", "fileUri"].includes(key)
  ) {
    const entry = await importAsset({ url: value });
    return { $asset: entry.asset.id, encoding: "data-url" };
  }
  if (typeof value === "string" && value.startsWith("data:image/")) {
    const entry = await importAsset({ dataUrl: value });
    return { $asset: entry.asset.id, encoding: "data-url" };
  }
  if (Array.isArray(value)) return Promise.all(value.map((item) => storeParameterAssets(item, key, known)));
  if (!value || typeof value !== "object") return value;
  const mime = value.mimeType ?? value.mime_type;
  if (typeof mime === "string" && mime.startsWith("image/") && typeof value.data === "string") {
    const dataUrl = `data:${mime};base64,${value.data}`;
    const assetId = known.get(dataUrl) ?? (await importAsset({ dataUrl })).asset.id;
    return { ...value, data: { $asset: assetId, encoding: "base64" } };
  }
  return Object.fromEntries(
    await Promise.all(
      Object.entries(value).map(async ([name, item]) => [
        name,
        await storeParameterAssets(
          item,
          name === "url" && (key === "image_url" || value.type === "image") ? "image_url" : name,
          known,
        ),
      ]),
    ),
  );
}

export async function resolveParameterAssets(value: Json): Promise<Json> {
  if (Array.isArray(value)) return Promise.all(value.map(resolveParameterAssets));
  if (!value || typeof value !== "object") return value;
  if (typeof value.$asset === "string") {
    const data = await assetData(value.$asset);
    return value.encoding === "base64" ? data.slice(data.indexOf(",") + 1) : data;
  }
  return Object.fromEntries(
    await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await resolveParameterAssets(item)])),
  );
}

export function parameterAssetIds(value: Json): string[] {
  if (Array.isArray(value)) return value.flatMap(parameterAssetIds);
  if (!value || typeof value !== "object") return [];
  return typeof value.$asset === "string" ? [value.$asset] : Object.values(value).flatMap(parameterAssetIds);
}
