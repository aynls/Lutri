import { Channel } from "@tauri-apps/api/core";
import type { GalleryEntry } from "../domain/types";
import { getState, refreshGallery } from "../services/store";
import { native } from "../services/native";
import { t } from "../i18n";
import { resolveOutputs, type OutputOptions } from "../services/outputs";

export interface UpscaleOptions extends OutputOptions {
  assetId: string;
  modelId: string;
  scale: number;
  tileSize: number;
  jobId?: string;
  gpuIndex?: number | null;
}
export interface UpscaleProgress {
  phase?: string;
  completed?: number;
  total?: number;
}
export interface UpscaleResult {
  jobId: string;
  entry: GalleryEntry;
  exportedPath?: string;
  exportError?: string;
}

export async function runUpscale(options: UpscaleOptions, onProgress?: (value: UpscaleProgress) => void) {
  const preferences = getState().preferences;
  const output = resolveOutputs("upscale", options);
  await native("upscale_configure", { concurrency: preferences.upscale?.concurrency ?? 1 });
  const channel = new Channel<UpscaleProgress>();
  channel.onmessage = (value) => onProgress?.(value);
  const result = await native<UpscaleResult>("upscale_run", {
    ...options,
    jobId: options.jobId ?? crypto.randomUUID(),
    gpuIndex: options.gpuIndex === undefined ? (preferences.upscale?.gpuIndex ?? null) : options.gpuIndex,
    destination: output.directory || null,
    channel,
  }).catch((error: unknown) => {
    if (String(error) === "SVG_UPSCALE_UNSUPPORTED") throw new Error(t("svgUpscaleUnsupported"));
    throw error;
  });
  try {
    await refreshGallery([result.entry.asset.id]);
  } catch (error) {
    console.error(error);
  }
  return result;
}

export const cancelUpscale = (id: string) => native<boolean>("upscale_cancel", { id });
