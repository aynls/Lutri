import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ArrowLeftIcon, ArrowRightIcon, HeartIcon, InfoIcon, XIcon } from "@phosphor-icons/react";
import { useApplication } from "../services/store";
import { native, imageUrl } from "../services/native";
import { t } from "../i18n";
import { ImageStage } from "../components/ImageStage";
import { CopyButton } from "../components/CopyButton";
import { ResizablePanel } from "../components/ResizablePanel";
import { RequestDetails } from "../history/RequestDetails";
import { copyAssetImage, exportImages, favorite } from "./actions";

import { getViewerContext } from "./viewContext";
import { lt } from "../i18n/library";
import type { GalleryEntry } from "../domain/types";

export function ImageViewer({ assetId }: { assetId: string }) {
  const { gallery, tasks, ready } = useApplication();
  const [current, setCurrent] = useState(assetId),
    [info, setInfo] = useState(true),
    [error, setError] = useState("");
  const [ids] = useState(() => getViewerContext(assetId));
  const [loaded, setLoaded] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const ordered = ids.map(
    (id) => loaded.find((entry) => entry.asset.id === id) ?? gallery.find((entry) => entry.asset.id === id),
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    void native<GalleryEntry[]>("gallery_entries", { ids: [current] })
      .then((entries) => {
        if (active) setLoaded(entries);
      })
      .catch(onError)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [current, gallery]);
  const index = ids.indexOf(current),
    entry =
      ordered[index] ??
      loaded.find((entry) => entry.asset.id === current) ??
      gallery.find((entry) => entry.asset.id === current);
  const task = tasks.find((task) => task.results.some((result) => result.assetId === current));
  const onError = (value: unknown) => setError(String(value));
  const attempt = (action: () => Promise<unknown>) => void action().catch(onError);
  const related = (id: string) => {
    if (ids.includes(id)) {
      setCurrent(id);
      return;
    }
    const viewer = new WebviewWindow(`image-${crypto.randomUUID()}`, {
      url: `index.html?asset=${encodeURIComponent(id)}`,
      title: "Lutri",
      width: 1200,
      height: 800,
    });
    void viewer.once("tauri://error", (event) => onError(event.payload));
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button")) return;
      if (event.key === "Escape") void getCurrentWindow().close().catch(onError);
      if (event.key === "ArrowLeft" && index > 0) setCurrent(ids[index - 1]);
      if (event.key === "ArrowRight" && index < ordered.length - 1) setCurrent(ids[index + 1]);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, gallery]);
  return (
    <div className="image-viewer viewer-workspace">
      <header className="viewer-toolbar">
        <div className="button-row">
          <button disabled={index <= 0} title={t("back")} onClick={() => setCurrent(ids[index - 1])}>
            <ArrowLeftIcon />
          </button>
          <span>
            {index < 0 ? "—" : index + 1} / {ordered.length}
          </span>
          <button
            disabled={index < 0 || index >= ordered.length - 1}
            title={t("results")}
            onClick={() => setCurrent(ids[index + 1])}
          >
            <ArrowRightIcon />
          </button>
        </div>
        <strong>{entry?.asset.name ?? "Lutri"}</strong>
        <span className="toolbar-spacer" />
        {entry && (
          <>
            <button title={t("favorites")} onClick={() => attempt(() => favorite(entry))}>
              <HeartIcon weight={entry.favorite ? "fill" : "regular"} />
            </button>
            <button onClick={() => attempt(() => copyAssetImage(entry.asset.id))}>{lt("copyImage")}</button>
            <button onClick={() => attempt(() => exportImages([entry]))}>{t("saveAs")}</button>
            <button title={t("reveal")} onClick={() => attempt(() => revealItemInDir(entry.path))}>
              {t("reveal")}
            </button>
          </>
        )}
        <button title={t("details")} aria-pressed={info} onClick={() => setInfo(!info)}>
          <InfoIcon />
        </button>
        <button title={t("close")} onClick={() => attempt(() => getCurrentWindow().close())}>
          <XIcon />
        </button>
      </header>
      <div className="viewer-body">
        {entry ? (
          <ImageStage key={current} before={{ dataUrl: imageUrl(entry.path), ...entry.asset }} />
        ) : (
          <div className="empty-state">{ready && !loading ? t("missing") : <span className="spinner" />}</div>
        )}
        {info && (
          <ResizablePanel
            className="viewer-inspector"
            storageKey="lutri.viewer.inspector"
            initialWidth={300}
            minWidth={240}
            maxWidth={480}
            side="right"
          >
            <div className="inspector-scroll">
              {entry && (
                <section>
                  <h2>{entry.asset.name}</h2>
                  <p>
                    {entry.asset.width} × {entry.asset.height} · {entry.asset.mediaType.split("/")[1].toUpperCase()}
                  </p>
                  <p>{new Date(entry.addedAt).toLocaleString()}</p>
                  <div className="asset-id">
                    <code>{current}</code>
                    <CopyButton value={current} onError={onError} />
                  </div>
                </section>
              )}
              {task && <RequestDetails task={task} onView={related} onError={onError} />}
            </div>
          </ResizablePanel>
        )}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label={t("close")}>
            <XIcon />
          </button>
        </div>
      )}
    </div>
  );
}
