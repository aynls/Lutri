import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft } from "../../domain/types";
import { removeReference } from "../../domain/references";
import { t } from "../../i18n";
import { AssetImage } from "../../gallery/AssetImage";

export function References({
  draft,
  gallery,
  onChange,
  onAdd,
  onView,
  limit,
}: {
  draft: GenerationDraft;
  gallery: GalleryEntry[];
  onChange: (draft: GenerationDraft) => void;
  onAdd: () => void;
  onView: (id: string) => void;
  limit: number;
}) {
  const move = (index: number, direction: number) => {
    const references = [...draft.references];
    [references[index], references[index + direction]] = [references[index + direction], references[index]];
    onChange({ ...draft, references });
  };
  return (
    <section>
      <div className="section-heading">
        <span>
          {t("references")}{" "}
          <small>
            {draft.references.length} / {limit}
          </small>
        </span>
        <button title={t("add")} onClick={onAdd} disabled={draft.references.length >= limit}>
          <PlusIcon />
        </button>
      </div>
      <div className="references">
        {draft.references.map((reference, index) => {
          const asset = gallery.find((entry) => entry.asset.id === reference.assetId);
          return (
            <div className="reference-item" key={reference.id}>
              <button
                className="image-button reference-preview"
                disabled={!asset}
                title={reference.name}
                onClick={() => onView(reference.assetId)}
              >
                {asset ? <AssetImage entry={asset} thumbnail /> : <span className="missing-image">{t("missing")}</span>}
              </button>
              <div>
                <div className="reference-name">
                  <small>{index + 1}.</small>
                  <input
                    aria-label={t("rename")}
                    value={reference.name}
                    title={reference.name}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        references: draft.references.map((entry) =>
                          entry.id === reference.id ? { ...entry, name: event.target.value } : entry,
                        ),
                      })
                    }
                  />
                </div>
                <div className="reference-actions">
                  <button disabled={index === 0} aria-label="←" onClick={() => move(index, -1)}>
                    <ArrowLeftIcon />
                  </button>
                  <button
                    disabled={index === draft.references.length - 1}
                    aria-label="→"
                    onClick={() => move(index, 1)}
                  >
                    <ArrowRightIcon />
                  </button>
                  <button title={t("remove")} onClick={() => onChange(removeReference(draft, reference.id))}>
                    <XIcon />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <button className="reference-add" title={t("add")} onClick={onAdd} disabled={draft.references.length >= limit}>
          <PlusIcon size={18} />
          {!draft.references.length && <span>{t("chooseImages")}</span>}
        </button>
      </div>
    </section>
  );
}
