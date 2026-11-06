import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ImageIcon,
  XIcon,
  HeartIcon,
  DownloadSimpleIcon,
  PlusIcon,
  ClockCounterClockwiseIcon,
  CopyIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import type { FeedSlot, GalleryEntry } from "../domain/types";
import { displayPrompt } from "../domain/references";
import { ModelIcon } from "../components/ModelIcon";
import { t } from "../i18n";
import { combinationById } from "../models";
import { AssetImage } from "../gallery/AssetImage";
import { copyAssetImage, exportImages, favorite } from "../gallery/actions";
import { execute } from "../services/generation";
import { removeFeed, useApplication } from "../services/store";
import { c } from "./messages";
import { taskStatusLabel } from "../i18n/tasks";
import { TaskUsage } from "../history/TaskUsage";
import { setViewerContext } from "../gallery/viewContext";

function Timer({ start }: { start: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  return (
    <small className="task-timer">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </small>
  );
}
export function Feed({
  onView,
  onReference,
  onEdit,
  onRelated,
  onError,
}: {
  onView: (id: string) => void;
  onReference: (entry: GalleryEntry) => void;
  onEdit: (entry: GalleryEntry) => void;
  onRelated: (id: string) => void;
  onError: (error: unknown) => void;
}) {
  const { feed, tasks, gallery, ready } = useApplication();
  const container = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
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
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setColumnCount(Math.max(1, Math.floor((entry.contentRect.width - 48 + 18) / 274))),
    );
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, []);
  const taskMap = useMemo(() => new Map(tasks.map((entry) => [entry.id, entry])), [tasks]);
  const assets = useMemo(() => new Map(gallery.map((entry) => [entry.asset.id, entry])), [gallery]);
  const columns = useMemo(() => {
    const groups: FeedSlot[][] = Array.from({ length: columnCount }, () => []),
      heights = Array<number>(columnCount).fill(0);
    for (const slot of feed) {
      const task = taskMap.get(slot.taskId),
        id = task?.results[slot.resultIndex]?.assetId,
        asset = id ? assets.get(id)?.asset : undefined;
      if (!task) continue;
      const column = heights.indexOf(Math.min(...heights));
      groups[column].push(slot);
      heights[column] += (asset ? (254 * asset.height) / asset.width : 220) + 100;
    }
    return groups;
  }, [feed, columnCount, taskMap, assets]);
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
        <div className="feed-columns">
          {columns.map((column, index) => (
            <div className="feed-column" key={index}>
              {column.map((slot) => {
                const task = taskMap.get(slot.taskId)!;
                const result = task.results[slot.resultIndex],
                  asset = result?.assetId ? assets.get(result.assetId) : undefined,
                  prompt = displayPrompt(task.draft);
                const busy = ["queued", "submitting", "generating", "downloading"].includes(task.status);
                const status = result?.assetId
                  ? "missing"
                  : result?.status === "failed"
                    ? result.url
                      ? "download-failed"
                      : "failed"
                    : result?.status === "downloading"
                      ? "downloading"
                      : task.status;
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
                      <button
                        className="image-button"
                        onClick={() => {
                          setViewerContext(
                            feed.flatMap((slot) => {
                              const id = taskMap.get(slot.taskId)?.results[slot.resultIndex]?.assetId;
                              return id ? [id] : [];
                            }),
                          );
                          onView(asset.asset.id);
                        }}
                      >
                        <AssetImage entry={asset} />
                      </button>
                    ) : (
                      <div className="result-placeholder">
                        {busy ? <span className="spinner" /> : <ImageIcon size={28} />}
                        <span>{status === "missing" ? t("missing") : taskStatusLabel(status)}</span>
                        {busy && status !== "downloading" && <Timer start={task.createdAt} />}
                        {status === "downloading" && <small className="task-timer">{t("downloading")}</small>}
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
                    {prompt.trim() ? (
                      <p className="result-prompt" title={prompt}>
                        {prompt}
                      </p>
                    ) : null}
                    <TaskUsage task={task} result={result} compact />
                    {asset && (
                      <div className="result-actions">
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
                        <button
                          title={t("related")}
                          aria-label={t("related")}
                          onClick={() => onRelated(asset.asset.id)}
                        >
                          <ClockCounterClockwiseIcon size={15} />
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
