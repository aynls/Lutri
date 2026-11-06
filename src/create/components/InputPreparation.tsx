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
    <RememberedDetails name={`${draft.combinationId}.inputs`} title={c("prepare")}>
      <label className="input-preparation-setting">
        <span>{c("maxEdge")}</span>
        <select
          value={maximum ?? ""}
          onChange={(event) =>
            onChange({
              ...draft,
              inputPreparation: { version: 1, ...(event.target.value ? { maxEdge: Number(event.target.value) } : {}) },
            })
          }
        >
          <option value="">{c("original")}</option>
          {[512, 768, 1024, 1536, 2048, 4096, 8192].map((edge) => (
            <option key={edge}>{edge}</option>
          ))}
          {maximum && ![512, 768, 1024, 1536, 2048, 4096, 8192].includes(maximum) ? <option>{maximum}</option> : null}
        </select>
      </label>
    </RememberedDetails>
  );
}
