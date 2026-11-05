import { native, readRecords } from "./native";
import { getState, updateState } from "./store";
import type { GalleryEntry } from "../domain/types";

let cleaning: Promise<void> | undefined;
export function cleanGallery(): Promise<void> {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    const gallery = await readRecords<GalleryEntry>("gallery");
    for (const source of ["generated", "imported"] as const) {
      const policy = getState().preferences.cleanup[source];
      if (!policy.enabled) continue;
      const eligible = gallery
        .filter((entry) => entry.source === source && !entry.favorite && !entry.boardIds.length)
        .sort((a, b) => a.addedAt - b.addedAt);
      for (const entry of eligible.slice(0, Math.max(0, eligible.length - policy.capacity)))
        await native("asset_delete", { id: entry.asset.id });
    }
    updateState({ gallery: await readRecords<GalleryEntry>("gallery") });
  })().finally(() => {
    cleaning = undefined;
  });
  return cleaning;
}
