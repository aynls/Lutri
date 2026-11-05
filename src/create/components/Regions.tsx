import { useState } from "react";
import { BoundingBoxIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import type { GenerationDraft } from "../../domain/types";
import { t } from "../../i18n";
import { useApplication } from "../../services/store";
import { LayoutEditor } from "./LayoutEditor";
import { outputFrame, regionColors } from "./regionGeometry";

export function Regions({ draft, onChange }: { draft: GenerationDraft; onChange: (draft: GenerationDraft) => void }) {
  const [open, setOpen] = useState(false);
  const { gallery } = useApplication();
  const frame = outputFrame(draft, gallery);
  return (
    <section className="layout-section">
      <div className="section-heading">
        <span>{t("layout")}</span>
        <small>
          {draft.regions.length} {t("regions")}
        </small>
      </div>
      <button className="layout-launch" onClick={() => setOpen(true)}>
        <span className="layout-miniature" style={{ aspectRatio: `${frame.width}/${frame.height}` }}>
          {draft.regions.map((region, index) => {
            const box = region.target;
            return box ? (
              <span
                key={region.id}
                style={{
                  left: `${box[1] / 10}%`,
                  top: `${box[0] / 10}%`,
                  width: `${(box[3] - box[1]) / 10}%`,
                  height: `${(box[2] - box[0]) / 10}%`,
                  borderColor: regionColors[index % regionColors.length],
                  background: `${regionColors[index % regionColors.length]}22`,
                }}
              />
            ) : null;
          })}
          {!draft.regions.length && <BoundingBoxIcon size={24} weight="thin" />}
        </span>
        <span>{t("editLayout")}</span>
        <ArrowUpRightIcon />
      </button>
      {open && (
        <LayoutEditor
          draft={draft}
          onClose={() => setOpen(false)}
          onApply={(regions) => {
            onChange({ ...draft, regions });
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}
