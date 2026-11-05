import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { GalleryEntry } from "../domain/types";

export const native = invoke;
export const imageUrl = (path: string) => convertFileSrc(path);
export interface RecordChange {
  collection: string;
  id: string;
  value?: unknown;
}
export const readRecords = <T>(collection: string) => invoke<T[]>("records_read", { collection });
export const commit = (changes: RecordChange[]) => invoke<void>("records_commit", { changes });
export const importAsset = (name: string, source: { path?: string; dataUrl?: string; url?: string }) =>
  invoke<GalleryEntry>("asset_import", { name, ...source });
export const assetData = (id: string) => invoke<string>("asset_data", { id });
export const assetExists = (id: string) => invoke<boolean>("asset_exists", { id });
export const downloadAsset = (url: string, name: string, resultId: string) =>
  invoke<GalleryEntry>("asset_download", { url, name, resultId });
