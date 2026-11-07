import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { GalleryEntry } from "../domain/types";

const mutations = new Set([
  "asset_import",
  "asset_paste",
  "asset_download",
  "layer_result_save",
  "asset_delete",
  "asset_provenance",
  "assets_publish",
  "staging_purge",
  "gallery_mutate",
  "library_migrate",
  "library_maintain",
  "upscale_run",
  "upscale_save",
]);
export async function native<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const result = await invoke<T>(command, args);
  if (mutations.has(command)) void emit("assets-changed", { source: getCurrentWindow().label }).catch(() => {});
  return result;
}
export const imageUrl = (path: string) => convertFileSrc(path);
export interface RecordChange {
  collection: string;
  id: string;
  value?: unknown;
}
export const readRecords = <T>(collection: string) => invoke<T[]>("records_read", { collection });
export async function commit(changes: RecordChange[]) {
  await invoke<void>("records_commit", { changes });
  if (changes.some((change) => change.collection === "gallery"))
    void emit("assets-changed", { source: getCurrentWindow().label }).catch(() => {});
}
export const importAsset = (source: { path?: string; dataUrl?: string; url?: string }, staged = false) =>
  native<GalleryEntry>("asset_import", { ...source, staged });
export const assetData = (id: string) => invoke<string>("asset_data", { id });
export const assetExists = (id: string) => invoke<boolean>("asset_exists", { id });
export const downloadAsset = (url: string, resultId: string, saveToGallery: boolean) =>
  native<GalleryEntry>("asset_download", { url, resultId, saveToGallery });
