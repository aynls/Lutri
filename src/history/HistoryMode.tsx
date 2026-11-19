import { XIcon } from "@phosphor-icons/react";
import type { CreationMode } from "../domain/types";
import { t } from "../i18n";
import { taskText } from "../i18n/tasks";
import { b } from "../batch/messages";
import type { RelatedHistoryScope } from "./related";

export function HistoryMode({
  tab,
  onTab,
  related,
  onExitRelated,
  onBack,
}: {
  tab: CreationMode;
  onTab: (tab: CreationMode) => void;
  related?: RelatedHistoryScope;
  onExitRelated: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="segmented-control history-mode" role="group" aria-label={t("history")}>
        {(["regular", "batch"] as const).map((item) => (
          <button key={item} aria-pressed={tab === item} onClick={() => onTab(item)}>
            {b(item)}
          </button>
        ))}
      </div>
      {related && (
        <div className="related-scope">
          <span>
            {taskText("relatedImage")}
            <code title={related.assetId}>{related.assetId}</code>
          </span>
          <button title={taskText("exitRelated")} aria-label={taskText("exitRelated")} onClick={onExitRelated}>
            <XIcon size={16} />
          </button>
          <button onClick={onBack}>{taskText("backToSource")}</button>
        </div>
      )}
    </>
  );
}
