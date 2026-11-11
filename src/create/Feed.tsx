import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ImageIcon,
  XIcon,
  HeartIcon,
  DownloadSimpleIcon,
  PlusIcon,
  ClockCounterClockwiseIcon,
  CopyIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft } from "../domain/types";
import { displayPrompt } from "../domain/references";
import { ModelIcon } from "../components/ModelIcon";
import { t } from "../i18n";
import { combinationById } from "../models";
import { AssetImage } from "../gallery/AssetImage";
import { CopyButton } from "../components/CopyButton";
import { LayerDelivery } from "../components/LayerDelivery";
import { copyAssetImage, exportImages, favorite } from "../gallery/actions";
import { execute } from "../services/generation";
import { removeFeed, useApplication } from "../services/store";
import { c } from "./messages";

export function Feed({
  onView,
  onReference,
  onEdit,
  onRestore,
  onRelated,
  onError,
}: {
  onView: (id: string, ids?: string[]) => void;
  onReference: (entry: GalleryEntry) => void;
  onEdit: (entry: GalleryEntry) => void;
  onRestore: (draft: GenerationDraft) => void;
  onRelated: (id: string) => void;
  onError: (error: unknown) => void;
}) {
  const { feed, tasks, gallery, ready } = useApplication();
  const container = useRef<HTMLDivElement>(null);
  const masonry = useRef<HTMLDivElement>(null);
  const observed = useRef<Set<string> | undefined>(undefined);
  const [newResults, setNewResults] = useState<string[]>([]);
  useEffect(() => {
    if (!ready) return;
    const saved = feed.flatMap((slot) => {
      const result = tasks.find((task) => task.id === slot.taskId)?.results[slot.resultIndex];
      return result?.status === "saved" ? [result.id] : [];
    });
    if (observed.current) {
      const added = saved.filter((id) => !observed.current!.has(id));
      if ((container.current?.scrollTop ?? 0) > 80 && added.length)
        setNewResults((current) => [...new Set([...current, ...added])]);
    }
    observed.current = new Set(saved);
  }, [feed, tasks, ready]);
  const taskMap = useMemo(() => new Map(tasks.map((entry) => [entry.id, entry])), [tasks]);
  const assets = useMemo(() => new Map(gallery.map((entry) => [entry.asset.id, entry])), [gallery]);
  useLayoutEffect(() => {
    const grid = masonry.current;
    const scroller = container.current;
    if (!grid || !scroller) return;
    const cards = Array.from(grid.children) as HTMLElement[];
    const arrange = () => {
      const width = grid.clientWidth;
      if (!width) return;
      const gap = 18;
      const cardWidth = cards[0]?.offsetWidth ?? 256;
      const columnCount = Math.max(1, Math.floor((width + gap) / (cardWidth + gap)));
      const offset = (width - columnCount * cardWidth - (columnCount - 1) * gap) / 2;
      const heights = Array<number>(columnCount).fill(0);
      const cardHeights = cards.map((card) => card.offsetHeight);
      // Rebalance positions under one parent so React keeps cards and loaded images mounted.
      cards.forEach((card, index) => {
        const column = heights.indexOf(Math.min(...heights));
        card.style.left = `${offset + column * (cardWidth + gap)}px`;
        card.style.top = `${heights[column]}px`;
        heights[column] += cardHeights[index] + gap;
      });
      grid.style.height = `${Math.max(0, Math.max(...heights) - gap)}px`;
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(scroller);
    cards.forEach((card) => observer.observe(card, { box: "border-box" }));
    return () => observer.disconnect();
  }, [feed, taskMap, assets]);
  const attempt = (action: () => Promise<unknown>) => void action().catch(onError);
  return (
    <div
      className="feed"
      ref={container}
      onScroll={(event) => {
        if (event.currentTarget.scrollTop <= 80) setNewResults([]);
      }}
    >
      {!!newResults.length && (
        <button
          className="new-results-pill"
          onClick={() => {
            container.current?.scrollTo({
              top: 0,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
            });
            setNewResults([]);
          }}
        >
          {newResults.length} {c("newResults")} ↑
        </button>
      )}
      {!feed.length ? (
        <div className="empty-state">
          <ImageIcon size={36} weight="thin" />
          <p>{t("empty")}</p>
        </div>
      ) : (
        <div className="feed-masonry" ref={masonry}>
          {feed.map((slot) => {
            const task = taskMap.get(slot.taskId);
            if (!task) return null;
            const result = task.results[slot.resultIndex],
              asset = result?.assetId ? assets.get(result.assetId) : undefined,
              prompt = displayPrompt(task.draft);
            const busy = ["queued", "submitting", "generating", "downloading"].includes(task.status);
            const downloading =
              !result?.assetId &&
              result?.status !== "failed" &&
              (result?.status === "downloading" || task.status === "downloading");
            return (
              <article className={`result-card ${busy ? "is-busy" : ""}`} key={slot.id}>
                <button
                  className="card-remove"
                  title={t("remove")}
                  onClick={() => attempt(() => removeFeed([slot.id]))}
                >
                  <XIcon />
                </button>
                {asset ? (
                  <div className="result-image">
                    <button
                      className="image-button"
                      style={{ aspectRatio: `${asset.asset.width} / ${asset.asset.height}` }}
                      onClick={() => {
                        onView(
                          asset.asset.id,
                          feed.flatMap((slot) => {
                            const id = taskMap.get(slot.taskId)?.results[slot.resultIndex]?.assetId;
                            return id ? [id] : [];
                          }),
                        );
                      }}
                    >
                      <AssetImage entry={asset} />
                    </button>
                    <div className="result-actions">
                      <button title={t("restore")} aria-label={t("restore")} onClick={() => onRestore(task.draft)}>
                        <ArrowCounterClockwiseIcon size={15} />
                      </button>
                      <button title={c("edit")} aria-label={c("edit")} onClick={() => onEdit(asset)}>
                        <PencilSimpleIcon size={15} />
                      </button>
                      <button
                        title={c("copyImage")}
                        aria-label={c("copyImage")}
                        onClick={() => attempt(() => copyAssetImage(asset.asset.id))}
                      >
                        <CopyIcon size={15} />
                      </button>
                      <button
                        title={t("useReference")}
                        aria-label={t("useReference")}
                        onClick={() => onReference(asset)}
                      >
                        <PlusIcon size={15} />
                      </button>
                      <button
                        title={t("favorites")}
                        aria-label={t("favorites")}
                        onClick={() => attempt(() => favorite(asset))}
                      >
                        <HeartIcon size={15} weight={asset.favorite ? "fill" : "regular"} />
                      </button>
                      <button
                        title={t("saveAs")}
                        aria-label={t("saveAs")}
                        onClick={() => attempt(() => exportImages([asset]))}
                      >
                        <DownloadSimpleIcon size={15} />
                      </button>
                      <button title={t("related")} aria-label={t("related")} onClick={() => onRelated(asset.asset.id)}>
                        <ClockCounterClockwiseIcon size={15} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="result-placeholder">
                    {busy ? <span className="spinner" /> : <ImageIcon size={28} />}
                    {busy && downloading && <small className="task-timer">{t("downloading")}</small>}
                    {!busy && task.status !== "completed" && task.status !== "cancelled" && (
                      <button
                        className="result-retry"
                        title={t("retry")}
                        onClick={() => attempt(() => execute(task.id))}
                      >
                        <ArrowClockwiseIcon />
                        {t("retry")}
                      </button>
                    )}
                    {(result?.error || task.error) && <p className="card-error">{result?.error ?? task.error}</p>}
                  </div>
                )}
                <footer>
                  <ModelIcon family={combinationById(task.draft.combinationId).family} size={15} />
                  <span>{combinationById(task.draft.combinationId).label}</span>
                  <span>
                    {asset
                      ? `${asset.asset.width} × ${asset.asset.height}`
                      : String(slot.resultIndex + 1).padStart(2, "0")}
                  </span>
                </footer>
                {result?.layerDelivery && <LayerDelivery task={task} result={result} onError={onError} />}
                {prompt.trim() ? (
                  <div className="result-prompt-wrap">
                    <p className="result-prompt" tabIndex={0} aria-label={t("prompt")}>
                      {prompt}
                    </p>
                    <CopyButton
                      className="result-prompt-copy"
                      value={prompt}
                      title={t("copyPrompt")}
                      onError={onError}
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
