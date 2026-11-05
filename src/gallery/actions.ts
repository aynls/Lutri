import { open, save } from "@tauri-apps/plugin-dialog";
import type { GalleryEntry } from "../domain/types";
import { commit, native } from "../services/native";
import { refreshGallery } from "../services/store";
import { imageExtensions, importPaths } from "./imports";

export async function chooseImages(): Promise<GalleryEntry[]> {
  const paths = await open({ multiple: true, filters: [{ name: "Images", extensions: imageExtensions }] });
  return paths ? importPaths(paths) : [];
}

export async function favorite(entry: GalleryEntry) {
  await commit([{ collection: "gallery", id: entry.asset.id, value: { ...entry, favorite: !entry.favorite } }]);
  await refreshGallery();
}

export async function exportImages(entries: GalleryEntry[]): Promise<number> {
  if (!entries.length) return 0;
  if (entries.length === 1) {
    const entry = entries[0];
    const destination = await save({ defaultPath: entry.path.split(/[\\/]/).pop() });
    if (!destination) return 0;
    await native("asset_export", { id: entry.asset.id, destination });
    return 1;
  }
  const directory = await open({ directory: true });
  if (!directory || typeof directory !== "string") return 0;
  const result = await native<{ saved: number; errors: string[] }>("assets_export", {
    ids: entries.map((entry) => entry.asset.id),
    directory,
  });
  if (result.errors.length) throw new Error(`${result.saved}/${entries.length}\n${result.errors.join("\n")}`);
  return result.saved;
}
