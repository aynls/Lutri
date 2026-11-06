import { useId } from "react";
import type { FormProps } from "../../models/types";
import { creationMode } from "../../models/creation";
import { t } from "../../i18n";
import { c } from "../messages";

export function CreationControl({ combination, draft, onChange }: FormProps) {
  const id = useId();
  if (!combination.creationControl) return null;
  const mode = creationMode(draft);
  return (
    <section className="creation-mode-fields">
      <div className="field" data-field="creationMode">
        <label htmlFor={id}>{c("creationMode")}</label>
        <select
          id={id}
          value={mode}
          title={combination.creationControl === "prompt" ? c("promptControlled") : undefined}
          onChange={(event) => {
            const next = event.target.value as typeof mode;
            onChange({
              ...draft,
              creationMode: next,
              editTargetId:
                next === "edit"
                  ? (draft.editTargetId ?? draft.mask?.referenceId ?? draft.references[0]?.id)
                  : draft.editTargetId,
            });
          }}
        >
          <option value="generate">
            {c(combination.creationControl === "style" ? "styleGenerateMode" : "generateMode")}
          </option>
          <option value="edit">{c("editMode")}</option>
          <option value="auto">{t("automatic")}</option>
        </select>
      </div>
      {mode === "edit" && draft.references.length > 0 && (
        <div className="field" data-field="editTargetId">
          <label htmlFor={`${id}-source`}>{t("editTarget")}</label>
          <select
            id={`${id}-source`}
            value={draft.editTargetId ?? draft.references[0]?.id}
            onChange={(event) => onChange({ ...draft, editTargetId: event.target.value })}
          >
            {draft.editTargetId && !draft.references.some((ref) => ref.id === draft.editTargetId) && (
              <option value={draft.editTargetId}>{t("missing")}</option>
            )}
            {draft.references.map((ref, index) => (
              <option key={ref.id} value={ref.id}>
                {index + 1}. {ref.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
