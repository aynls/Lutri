import { Select } from "../../components/Select";
import type { GenerationDraft } from "../../domain/types";
import { c } from "../messages";
import { RememberedDetails } from "./RememberedDetails";

export function InputPreparation({
  draft,
  onChange,
}: {
  draft: GenerationDraft;
  onChange: (draft: GenerationDraft) => void;
}) {
  const maximum = draft.inputPreparation?.maxEdge;
  return (
    <RememberedDetails key={draft.combinationId} name={`${draft.combinationId}.inputs`} title={c("prepare")}>
      <label className="field input-preparation-setting" data-field="maxEdge" data-label={c("maxEdge")}>
        <span>{c("maxEdge")}</span>
        <Select
          value={maximum ?? ""}
          onValueChange={(nextValue) =>
            onChange({
              ...draft,
              inputPreparation: { version: 1, ...(nextValue ? { maxEdge: Number(nextValue) } : {}) },
            })
          }
        >
          <option value="">{c("original")}</option>
          {[512, 768, 1024, 1536, 2048, 4096, 8192].map((edge) => (
            <option key={edge}>{edge}</option>
          ))}
          {maximum && ![512, 768, 1024, 1536, 2048, 4096, 8192].includes(maximum) ? <option>{maximum}</option> : null}
        </Select>
      </label>
    </RememberedDetails>
  );
}
