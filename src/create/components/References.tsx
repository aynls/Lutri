import { useRef, useState } from "react";
import { ArrowUpIcon, ArrowDownIcon, ArrowLineUpIcon, PlusIcon, XIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft } from "../../domain/types";
import { removeReference } from "../../domain/references";
import { t } from "../../i18n";
import { AssetImage } from "../../gallery/AssetImage";
import { c } from "../messages";

export type ReferenceSource = "library" | "files" | "url" | "clipboard";

export function References({
  draft,
  gallery,
  onChange,
  onAdd,
  onView,
  limit,
  primary,
  onNotice,
}: {
  draft: GenerationDraft;
  gallery: GalleryEntry[];
  onChange: (draft: GenerationDraft) => void;
  onAdd: (source: ReferenceSource) => void;
  onView: (id: string) => void;
  limit: number;
  primary?: boolean;
  onNotice: (message: string) => void;
}) {
  const move = (index: number, to: number) => {
    const references = [...draft.references];
    const [reference] = references.splice(index, 1);
    references.splice(to, 0, reference);
    const invalidMask = draft.mask && draft.mask.referenceId !== references[0]?.id;
    onChange({ ...draft, references, mask: invalidMask ? undefined : draft.mask });
    if (invalidMask) onNotice(c("maskRemoved"));
  };
  return (
    <section className="references-section">
      <div className="section-heading">
        <span>
          {t("references")}{" "}
          <small>
            {draft.references.length} / {limit}
          </small>
        </span>
        <details className="reference-source-menu action-menu">
          <summary aria-label={t("add")}>
            <PlusIcon />
          </summary>
          <div>
            {(["library", "files", "url", "clipboard"] as const).map((source) => (
              <button
                key={source}
                disabled={draft.references.length >= limit}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  onAdd(source);
                }}
              >
                {c(source)}
              </button>
            ))}
          </div>
        </details>
      </div>
      <div className="references">
        {draft.references.map((reference, index) => {
          const asset = gallery.find((entry) => entry.asset.id === reference.assetId);
          return (
            <div className={`reference-item${asset ? "" : " missing"}`} key={reference.id}>
              <button
                className="image-button reference-preview"
                disabled={!asset}
                title={reference.name}
                onClick={() => onView(reference.assetId)}
              >
                {asset ? <AssetImage entry={asset} thumbnail /> : <span className="missing-image">{t("missing")}</span>}
                {primary && index === 0 ? <span className="reference-badge">{t("editTarget")}</span> : null}
              </button>
              <div className="reference-information">
                <div className="reference-name">
                  <small>{index + 1}.</small>
                  <ReferenceAlias
                    name={reference.name}
                    onRename={(name) =>
                      onChange({
                        ...draft,
                        references: draft.references.map((entry) =>
                          entry.id === reference.id ? { ...entry, name } : entry,
                        ),
                      })
                    }
                  />
                </div>
                {asset ? (
                  <small className="reference-dims">
                    {asset.asset.width} × {asset.asset.height}
                  </small>
                ) : null}
                {reference.purpose !== "reference" && (
                  <button
                    className="error-text"
                    onClick={() =>
                      onChange({
                        ...draft,
                        references: draft.references.map((entry) =>
                          entry.id === reference.id ? { ...entry, purpose: "reference" } : entry,
                        ),
                      })
                    }
                  >
                    {reference.purpose} · {t("reset")}
                  </button>
                )}
                <div className="reference-actions">
                  <button
                    disabled={index === 0}
                    title={c("moveFirst")}
                    aria-label={c("moveFirst")}
                    onClick={() => move(index, 0)}
                  >
                    <ArrowLineUpIcon />
                  </button>
                  <button
                    disabled={index === 0}
                    title={c("moveUp")}
                    aria-label={c("moveUp")}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUpIcon />
                  </button>
                  <button
                    disabled={index === draft.references.length - 1}
                    title={c("moveDown")}
                    aria-label={c("moveDown")}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDownIcon />
                  </button>
                  <button title={t("remove")} onClick={() => onChange(removeReference(draft, reference.id))}>
                    <XIcon />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <button
          className="reference-add"
          title={t("add")}
          onClick={() => onAdd("library")}
          disabled={draft.references.length >= limit}
        >
          <PlusIcon size={18} />
          {!draft.references.length && <span>{t("chooseImages")}</span>}
        </button>
      </div>
    </section>
  );
}

function ReferenceAlias({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const cancelled = useRef(false);
  return editing ? (
    <input
      autoFocus
      aria-label={t("rename")}
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (!cancelled.current) onRename(value.trim() || t("referenceAlias"));
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelled.current = true;
          setEditing(false);
        }
      }}
    />
  ) : (
    <>
      <button
        className="reference-rename"
        type="button"
        aria-label={t("rename")}
        title={t("rename")}
        onClick={() => {
          setValue(name);
          cancelled.current = false;
          setEditing(true);
        }}
      >
        <PencilSimpleIcon />
      </button>
      <span className="reference-alias" title={name}>
        {name}
      </span>
    </>
  );
}
