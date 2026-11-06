import type { GalleryEntry } from "../domain/types";
import { importAsset } from "../services/native";
import { refreshGallery } from "../services/store";

export const imageExtensions = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "svg"];
export const isImagePath = (path: string) => imageExtensions.includes(path.split(".").pop()?.toLowerCase() ?? "");
export async function importPaths(paths: string[], staged = false): Promise<GalleryEntry[]> {
  const entries: GalleryEntry[] = [];
  try {
    for (const path of paths.filter(isImagePath)) entries.push(await importAsset({ path }, staged));
    return entries;
  } finally {
    await refreshGallery();
  }
}

export async function importFiles(files: File[], staged = false): Promise<GalleryEntry[]> {
  const entries = await Promise.all(
    files
      .filter((file) => file.type.startsWith("image/"))
      .map(async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        return importAsset({ dataUrl }, staged);
      }),
  );
  await refreshGallery();
  return entries;
}
