import { Select } from "../../components/Select";
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
        <Select
          id={id}
          value={mode}
          title={combination.creationControl === "prompt" ? c("promptControlled") : undefined}
          onValueChange={(nextValue) => {
            const next = nextValue as typeof mode;
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
        </Select>
      </div>
      {mode === "edit" && draft.references.length > 0 && (
        <div className="field" data-field="editTargetId">
          <label htmlFor={`${id}-source`}>{t("editTarget")}</label>
          <Select
            id={`${id}-source`}
            value={draft.editTargetId ?? draft.references[0]?.id}
            onValueChange={(nextValue) => onChange({ ...draft, editTargetId: nextValue })}
          >
            {draft.editTargetId && !draft.references.some((ref) => ref.id === draft.editTargetId) && (
              <option value={draft.editTargetId}>{t("missing")}</option>
            )}
            {draft.references.map((ref, index) => (
              <option key={ref.id} value={ref.id}>
                {index + 1}. {ref.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </section>
  );
}
