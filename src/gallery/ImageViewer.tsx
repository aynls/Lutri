import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  HeartIcon,
  InfoIcon,
  XIcon,
} from "@phosphor-icons/react";
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
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
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
          <button
            disabled={index <= 0}
            title={lt("previousImage")}
            aria-label={lt("previousImage")}
            onClick={() => setCurrent(ids[index - 1])}
          >
            <ArrowLeftIcon />
          </button>
          <span>
            {index < 0 ? "—" : index + 1} / {ordered.length}
          </span>
          <button
            disabled={index < 0 || index >= ordered.length - 1}
            title={lt("nextImage")}
            aria-label={lt("nextImage")}
            onClick={() => setCurrent(ids[index + 1])}
          >
            <ArrowRightIcon />
          </button>
        </div>
        <div className="viewer-zoom-controls" ref={setToolbarTarget} />
        <span className="toolbar-spacer" />
        {entry && (
          <>
            <button
              className="viewer-reference-button"
              onClick={() =>
                attempt(async () => {
                  const main = await WebviewWindow.getByLabel("main");
                  if (!main) throw new Error("Main window unavailable");
                  await emitTo("main", "viewer-use-reference", entry);
                  await main.unminimize();
                  await main.setFocus();
                })
              }
            >
              {t("useReference")}
            </button>
            <button
              title={t("upscale")}
              aria-label={t("upscale")}
              onClick={() =>
                attempt(async () => {
                  const main = await WebviewWindow.getByLabel("main");
                  if (!main) throw new Error("Main window unavailable");
                  await emitTo("main", "viewer-use-upscale", entry);
                  await main.unminimize();
                  await main.setFocus();
                })
              }
            >
              <ArrowUpRightIcon />
            </button>
            <button
              title={entry.favorite ? t("removeFavorite") : t("favorites")}
              aria-label={entry.favorite ? t("removeFavorite") : t("favorites")}
              aria-pressed={entry.favorite}
              onClick={() => attempt(() => favorite(entry))}
            >
              <HeartIcon weight={entry.favorite ? "fill" : "regular"} />
            </button>
            <button
              title={lt("copyImage")}
              aria-label={lt("copyImage")}
              onClick={() => attempt(() => copyAssetImage(entry.asset.id))}
            >
              <CopyIcon />
            </button>
            <button title={t("saveAs")} aria-label={t("saveAs")} onClick={() => attempt(() => exportImages([entry]))}>
              <DownloadSimpleIcon />
            </button>
            <button
              title={t("reveal")}
              aria-label={t("reveal")}
              onClick={() => attempt(() => revealItemInDir(entry.path))}
            >
              <FolderOpenIcon />
            </button>
          </>
        )}
        <button title={t("details")} aria-label={t("details")} aria-pressed={info} onClick={() => setInfo(!info)}>
          <InfoIcon />
        </button>
        <button title={t("close")} aria-label={t("close")} onClick={() => attempt(() => getCurrentWindow().close())}>
          <XIcon />
        </button>
      </header>
      <div className="viewer-body">
        {entry ? (
          <ImageStage
            key={current}
            before={{ dataUrl: imageUrl(entry.path), ...entry.asset }}
            toolbarTarget={toolbarTarget}
          />
        ) : (
          <div className="empty-state">{ready && !loading ? t("missing") : <span className="spinner" />}</div>
        )}
        {info && (
          <ResizablePanel
            className="viewer-details-bar"
            storageKey="lutri.viewer.inspector"
            initialWidth={320}
            minWidth={240}
            maxWidth={480}
            side="right"
          >
            <div className="viewer-details-scroll">
              {entry && (
                <section className="viewer-asset-details">
                  <dl className="viewer-asset-metadata">
                    <div>
                      <dt>{lt("dimensions")}</dt>
                      <dd>
                        {entry.asset.width} × {entry.asset.height} px
                      </dd>
                    </div>
                    <div>
                      <dt>{lt("format")}</dt>
                      <dd>{entry.asset.mediaType.split("/")[1].toUpperCase()}</dd>
                    </div>
                    <div>
                      <dt>{lt("addedAt")}</dt>
                      <dd>{new Date(entry.addedAt).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>{lt("assetId")}</dt>
                      <dd className="asset-id">
                        <code>{current}</code>
                        <CopyButton value={current} onError={onError} />
                      </dd>
                    </div>
                  </dl>
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
