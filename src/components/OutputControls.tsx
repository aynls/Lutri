import { useState } from "react";
import { t } from "../i18n";
import { getState, savePreferences, useApplication } from "../services/store";
import { DirectoryPicker } from "./DirectoryPicker";

export function OutputControls({
  kind,
  disabled,
  onError,
}: {
  kind: "generationAuto" | "upscaleAuto";
  disabled?: boolean;
  onError: (error: unknown) => void;
}) {
  const { preferences } = useApplication();
  const [saving, setSaving] = useState(false);
  const output = preferences.outputs ?? {};
  const enabled = output[kind] ?? false;
  const galleryKey = kind === "generationAuto" ? "generationGallery" : "upscaleGallery";
  const missing = enabled && !output.directory?.trim();
  const change = async (next: typeof output) => {
    setSaving(true);
    try {
      const current = getState().preferences;
      await savePreferences({ ...current, outputs: { ...current.outputs, ...next } });
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="output-controls" data-field="autoSave">
      <div className="output-options">
        <label className="spec-option">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled || saving}
            onChange={(event) => void change({ [kind]: event.target.checked })}
          />
          {t("autoSave")}
        </label>
        <label className="spec-option">
          <input
            type="checkbox"
            checked={output[galleryKey] ?? true}
            disabled={disabled || saving}
            onChange={(event) => void change({ [galleryKey]: event.target.checked })}
          />
          {t("writeToGallery")}
        </label>
      </div>
      {enabled && (
        <>
          <DirectoryPicker
            value={output.directory ?? ""}
            disabled={disabled || saving}
            invalid={missing}
            onChange={(directory) => void change({ directory })}
            onError={onError}
          />
          {missing && <small className="error-text">{t("saveDirectoryRequired")}</small>}
        </>
      )}
    </div>
  );
}
