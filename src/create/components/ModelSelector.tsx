import { Select } from "../../components/Select";
import { useState } from "react";
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { combinations } from "../../models";
import type { ModelCombination } from "../../models/types";
import { providerNames } from "../../models/shared";
import { Dialog } from "../../components/Dialog";
import { ModelIcon } from "../../components/ModelIcon";
import { t } from "../../i18n";

const models = [...new Map(combinations.map((entry) => [entry.model, entry])).values()];
const families = [...new Set(models.map((entry) => entry.family))];
export function ModelSelector({
  value,
  onChange,
}: {
  value: ModelCombination;
  onChange: (next: ModelCombination) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const [family, setFamily] = useState("all");
  const results = models.filter(
    (entry) =>
      (family === "all" || family === entry.family) &&
      `${entry.label} ${entry.family}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="model-select">
      <label>
        {t("model")}
        <button className="model-trigger" onClick={() => setOpen(true)}>
          <ModelIcon family={value.family} size={28} />
          <span>
            <small>{value.family}</small>
            <strong>{value.label}</strong>
          </span>
          <CaretDownIcon />
        </button>
      </label>
      <label>
        {t("provider")}
        <Select
          value={value.id}
          onValueChange={(nextValue) => onChange(combinations.find((entry) => entry.id === nextValue)!)}
        >
          {combinations
            .filter((entry) => entry.model === value.model)
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {providerNames[entry.provider]}
              </option>
            ))}
        </Select>
      </label>
      {open && (
        <Dialog title={t("model")} className="model-dialog" onClose={() => setOpen(false)}>
          <div className="search-input">
            <MagnifyingGlassIcon />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchModels")}
              aria-label={t("searchModels")}
            />
          </div>
          <div className="model-browser">
            <nav>
              <button className={family === "all" ? "selected" : ""} onClick={() => setFamily("all")}>
                {t("all")}
              </button>
              {families.map((name) => (
                <button className={family === name ? "selected" : ""} key={name} onClick={() => setFamily(name)}>
                  <ModelIcon family={name} size={18} />
                  {name}
                </button>
              ))}
            </nav>
            <div className="model-options">
              {results.map((entry) => (
                <button
                  key={entry.model}
                  className={entry.model === value.model ? "selected" : ""}
                  onClick={() => {
                    onChange(
                      combinations.find((next) => next.model === entry.model && next.provider === value.provider) ??
                        entry,
                    );
                    setOpen(false);
                  }}
                >
                  <ModelIcon family={entry.family} size={24} />
                  <span>
                    <strong>{entry.label}</strong>
                    <small>
                      {combinations
                        .filter((next) => next.model === entry.model)
                        .map((next) => providerNames[next.provider])
                        .join(" · ")}
                    </small>
                  </span>
                  {entry.model === value.model && <CheckIcon />}
                </button>
              ))}
              {!results.length && <div className="empty-state">{t("noMatches")}</div>}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
