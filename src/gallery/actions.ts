import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import type { GalleryEntry } from "../domain/types";
import { t } from "../i18n";
import { native } from "../services/native";
import { flushWrites, getState, refreshGallery, savePreferences, updateState } from "../services/store";
import { imageExtensions, importPaths } from "./imports";

export const copyAssetImage = (id: string) => native<void>("asset_copy", { id });

export async function chooseImages(staged = false): Promise<GalleryEntry[]> {
  const paths = await open({ multiple: true, filters: [{ name: "Images", extensions: imageExtensions }] });
  return paths ? importPaths(paths, staged) : [];
}

export async function favorite(entry: GalleryEntry) {
  await native("gallery_mutate", { ids: [entry.asset.id], action: "favorite", value: "toggle" });
  await refreshGallery([entry.asset.id]);
}

export async function deleteImage(entry: GalleryEntry): Promise<boolean> {
  const current = (await native<GalleryEntry[]>("gallery_entries", { ids: [entry.asset.id] }))[0];
  if (!current) throw new Error(t("missing"));
  const protectedImage = current.favorite || current.boardIds.length > 0;
  if (
    !(await confirm(t(protectedImage ? "confirmDeleteProtected" : "confirmDeleteImage"), {
      title: "Lutri",
      kind: "warning",
    }))
  )
    return false;
  await flushWrites();
  try {
    await native("asset_delete", { id: entry.asset.id, confirmedProtected: protectedImage });
  } catch (error) {
    if (String(error).includes("ASSET_IN_USE")) throw new Error(t("assetInUse"));
    if (String(error).includes("ASSET_PROTECTED_CHANGED")) throw new Error(t("assetProtectionChanged"));
    throw error;
  }
  updateState({ gallery: getState().gallery.filter((item) => item.asset.id !== entry.asset.id) });
  await refreshGallery().catch(console.error);
  return true;
}

export async function exportImages(entries: GalleryEntry[]): Promise<number> {
  if (!entries.length) return 0;
  if (entries.length === 1) {
    const entry = entries[0];
    const folder = getState().preferences.outputs?.directory;
    const destination = await save({
      defaultPath: folder ? `${folder}/${entry.path.split(/[\\/]/).pop()}` : entry.path.split(/[\\/]/).pop(),
    });
    if (!destination) return 0;
    await native("asset_export", { id: entry.asset.id, destination });
    const preferences = getState().preferences;
    await savePreferences({
      ...preferences,
      outputs: { ...preferences.outputs, directory: destination.replace(/[\\/][^\\/]+$/, "") },
    });
    return 1;
  }
  const directory = await open({ directory: true, defaultPath: getState().preferences.outputs?.directory });
  if (!directory || typeof directory !== "string") return 0;
  const result = await native<{ saved: number; errors: string[] }>("assets_export", {
    ids: entries.map((entry) => entry.asset.id),
    directory,
  });
  if (result.errors.length) throw new Error(`${result.saved}/${entries.length}\n${result.errors.join("\n")}`);
  return result.saved;
}
