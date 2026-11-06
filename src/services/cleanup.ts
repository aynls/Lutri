import { native } from "./native";
import { getState } from "./store";

let cleaning: Promise<void> | undefined;
export function cleanGallery(): Promise<void> {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    await native("gallery_cleanup", { policies: getState().preferences.cleanup });
  })().finally(() => {
    cleaning = undefined;
  });
  return cleaning;
}
