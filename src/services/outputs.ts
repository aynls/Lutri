import { t } from "../i18n";
import { getState } from "./store";

export interface OutputOptions {
  autoSave?: boolean;
  destination?: string | null;
  saveToGallery?: boolean;
}

/** Resolve once at submission so later preference changes cannot affect queued work. */
export function resolveOutputs(kind: "generation" | "upscale", options: OutputOptions = {}) {
  const output = getState().preferences.outputs;
  const autoSave =
    options.autoSave ??
    (options.destination !== undefined ? !!options.destination : (output?.[`${kind}Auto`] ?? false));
  const directory = autoSave ? (options.destination ?? output?.directory) : undefined;
  if (autoSave && !directory?.trim()) throw new Error(t("saveDirectoryRequired"));
  return {
    directory,
    saveToGallery: options.saveToGallery ?? output?.[`${kind}Gallery`] ?? true,
  };
}
