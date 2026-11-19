import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ImageIcon,
  XIcon,
  HeartIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import type { FeedSlot, GalleryEntry, GenerationDraft } from "../domain/types";
import { displayPrompt } from "../domain/references";
import { LayerDelivery } from "../components/LayerDelivery";
import { ModelIcon } from "../components/ModelIcon";
import { t } from "../i18n";
import { combinationById } from "../models";
import { AssetImage } from "../gallery/AssetImage";
import { BoardAction } from "../gallery/BoardAction";
import { outputFrame } from "./components/regionGeometry";
import { favorite } from "../gallery/actions";
import { execute } from "../services/generation";
import { changeFeed, removeFeed, useApplication } from "../services/store";
import { c } from "./messages";
import { useRequestMasonry } from "./useRequestMasonry";

export function Feed({
  onView,
  onReference,
  onRestore,
  onError,
}: {
  onView: (id: string, ids?: string[]) => void;
  onReference: (entry: GalleryEntry) => void;
  onRestore: (draft: GenerationDraft) => void;
  onError: (error: unknown) => void;
}) {
  const { feed, tasks, gallery, boards, ready } = useApplication();
  const container = useRef<HTMLDivElement>(null);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const assets = useMemo(() => new Map(gallery.map((entry) => [entry.asset.id, entry])), [gallery]);
  const groups = useMemo(() => {
    const byRequest = new Map<string, FeedSlot[]>();
    for (const slot of feed) {
      const group = byRequest.get(slot.taskId);
      if (group) group.push(slot);
      else byRequest.set(slot.taskId, [slot]);
    }
    return Array.from(byRequest).flatMap(([id, slots]) => {
      const task = taskMap.get(id);
      if (!task) return [];
      const frame = outputFrame(task.draft, gallery);
      const ordered = slots
        .sort((a, b) => a.resultIndex - b.resultIndex)
        .map((slot) => {
          const result = task.results[slot.resultIndex];
          const asset = result?.assetId ? assets.get(result.assetId) : undefined;
          // The draft predicts the waiting frame. Saved dimensions determine the final tile.
          const { width, height } = asset?.asset ?? frame;
          return { id: slot.id, result, asset, ratio: width > 0 && height > 0 ? width / height : 1 };
        });
      return [{ task, slots: ordered }];
    });
  }, [feed, taskMap, gallery, assets]);
  const masonry = useRequestMasonry(
    groups.map(({ task, slots }) => `${task.id}:${slots.map(({ id, ratio }) => `${id}@${ratio}`).join(",")}`).join("|"),
  );
  const viewerIds = groups.flatMap(({ slots }) =>
    slots.flatMap(({ result }) => (result?.assetId ? [result.assetId] : [])),
  );
  const observed = useRef<Set<string> | undefined>(undefined);
  const [newResults, setNewResults] = useState<string[]>([]);
  useEffect(() => {
    if (!ready) return;
    const saved = feed.flatMap((slot) => {
      const result = taskMap.get(slot.taskId)?.results[slot.resultIndex];
      return result?.status === "saved" ? [result.id] : [];
    });
    if (observed.current) {
      const added = saved.filter((id) => !observed.current!.has(id));
      if ((container.current?.scrollTop ?? 0) > 80 && added.length)
        setNewResults((current) => [...new Set([...current, ...added])]);
    }
    observed.current = new Set(saved);
  }, [feed, taskMap, ready]);
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
        <div className="request-feed" ref={masonry}>
          {groups.map(({ task, slots }) => {
            const id = task.id;
            const model = combinationById(task.draft.combinationId);
            const busy = ["queued", "submitting", "generating", "downloading"].includes(task.status);
            return (
              <article className="request-group" key={id}>
                <header className="request-heading">
                  <span className="request-model">
                    <ModelIcon family={model.family} size={16} />
                    <span title={model.label}>{model.label}</span>
                  </span>
                  <span className="request-status" title={t(task.status)}>
                    {t(task.status)}
                  </span>
                  <p className="result-prompt">{displayPrompt(task.draft)}</p>
                  <button title={t("restore")} onClick={() => onRestore(task.draft)}>
                    <ArrowCounterClockwiseIcon />
                  </button>
                  <button
                    title={c("removeGroup")}
                    onClick={() => attempt(() => changeFeed((feed) => feed.filter((slot) => slot.taskId !== id)))}
                  >
                    <XIcon />
                  </button>
                </header>
                <div className="request-images">
                  {slots.map(({ id: slotId, result, asset, ratio }) => (
                    <div key={slotId} className="result-cell" data-ratio={ratio}>
                      <button
                        className="card-remove"
                        title={t("remove")}
                        onClick={() => attempt(() => removeFeed([slotId]))}
                      >
                        <XIcon />
                      </button>
                      {asset ? (
                        <div className="result-image">
                          <button className="image-button" onClick={() => onView(asset.asset.id, viewerIds)}>
                            <AssetImage entry={asset} />
                          </button>
                          <div className="result-actions">
                            <button
                              className="result-reference"
                              title={t("useReference")}
                              aria-label={t("useReference")}
                              onClick={() => onReference(asset)}
                            >
                              <PlusIcon size={15} />
                            </button>
                            <button
                              title={t(asset.favorite ? "removeFavorite" : "favorites")}
                              aria-label={t(asset.favorite ? "removeFavorite" : "favorites")}
                              aria-pressed={asset.favorite}
                              onClick={() => attempt(() => favorite(asset))}
                            >
                              <HeartIcon size={15} weight={asset.favorite ? "fill" : "regular"} />
                            </button>
                            <BoardAction key={asset.asset.id} entry={asset} boards={boards} />
                          </div>
                        </div>
                      ) : (
                        <div className="result-placeholder">
                          {busy && result?.status !== "failed" ? <span className="spinner" /> : <ImageIcon size={28} />}
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
                    </div>
                  ))}
                </div>
                {slots.map(({ id: slotId, result }) =>
                  result?.layerDelivery?.status === "failed" ? (
                    <LayerDelivery key={slotId} task={task} result={result} onError={onError} />
                  ) : null,
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
