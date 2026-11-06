import { useEffect, useState } from "react";
import { commit, readRecords } from "../../services/native";
import { useApplication } from "../../services/store";
import type { FormProps } from "../../models/types";
import { c } from "../messages";
import { t } from "../../i18n";

interface SavedStyle {
  id: string;
  combinationId: string;
  name: string;
  styleId: string;
}
export function SavedStyles({ combination, draft, onChange }: FormProps) {
  const [styles, setStyles] = useState<SavedStyle[]>([]),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const { tasks } = useApplication();
  const load = () => readRecords<SavedStyle>("styles").then(setStyles);
  useEffect(() => {
    void load().catch((error) => setError(String(error)));
  }, []);
  const available = styles.filter((style) => style.combinationId === combination.id);
  const returned = [
    ...new Set(
      tasks
        .filter((task) => task.draft.combinationId === combination.id)
        .flatMap((task) => {
          const identifiers: string[] = typeof task.metadata?.style_id === "string" ? [task.metadata.style_id] : [];
          for (const result of task.results) {
            const outputs = result.metadata?.outputs;
            if (
              outputs &&
              typeof outputs === "object" &&
              !Array.isArray(outputs) &&
              typeof outputs.styleId === "string"
            )
              identifiers.push(outputs.styleId);
          }
          return identifiers;
        }),
    ),
  ];
  const selected = available.find((style) => style.styleId === draft.parameters.style_id);
  return (
    <div className="saved-styles">
      <label>
        {c("savedStyles")}
        <select
          value={selected?.id ?? ""}
          onChange={(event) => {
            const style = available.find((entry) => entry.id === event.target.value);
            if (style) onChange({ ...draft, parameters: { ...draft.parameters, style_id: style.styleId } });
          }}
        >
          <option value="">{available.length ? c("custom") : c("noStyles")}</option>
          {available.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name}
            </option>
          ))}
        </select>
      </label>
      {!!returned.length && (
        <select
          aria-label={c("style")}
          value=""
          onChange={(event) =>
            onChange({ ...draft, parameters: { ...draft.parameters, style_id: event.target.value } })
          }
        >
          <option value="">{t("results")}</option>
          {returned.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      )}
      <div className="field-inline">
        <input
          value={name}
          placeholder={c("styleName")}
          aria-label={c("styleName")}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="button"
          disabled={!name.trim() || !draft.parameters.style_id}
          onClick={() =>
            void (async () => {
              const style: SavedStyle = {
                id: crypto.randomUUID(),
                combinationId: combination.id,
                name: name.trim(),
                styleId: String(draft.parameters.style_id),
              };
              await commit([{ collection: "styles", id: style.id, value: style }]);
              setName("");
              await load();
            })().catch((error) => setError(String(error)))
          }
        >
          {c("saveStyle")}
        </button>
        {selected && (
          <button
            type="button"
            onClick={() =>
              void commit([{ collection: "styles", id: selected.id }])
                .then(load)
                .catch((error) => setError(String(error)))
            }
          >
            {t("delete")}
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
