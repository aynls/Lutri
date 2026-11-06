import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

import { lt } from "../i18n/library";
import type { GalleryEntry } from "../domain/types";

export function ImageViewer({
  assetId,
  assetIds,
  onClose,
  onReference,
  onUpscale,
}: {
  assetId: string;
  assetIds: string[];
  onClose: () => void;
  onReference: (entry: GalleryEntry) => Promise<void>;
  onUpscale: (entry: GalleryEntry) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    element.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
    };
  }, []);
  const { gallery, tasks, ready } = useApplication();
  const [current, setCurrent] = useState(assetId),
    [info, setInfo] = useState(true),
    [error, setError] = useState("");
  const [ids, setIds] = useState(() => Array.from(new Set(assetIds.includes(assetId) ? assetIds : [assetId])));
  const [loaded, setLoaded] = useState<GalleryEntry[]>([]);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void native<GalleryEntry[]>("gallery_entries", { ids: [current] })
      .then((entries) => {
        if (active) setLoaded(entries);
      })
      .catch((value) => {
        if (active) onError(value);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [current, gallery]);
  const index = ids.indexOf(current),
    entry = loaded.find((entry) => entry.asset.id === current) ?? gallery.find((entry) => entry.asset.id === current);
  const task = tasks.find((task) => task.results.some((result) => result.assetId === current));
  const onError = (value: unknown) => setError(String(value));
  const attempt = (action: () => Promise<unknown>) => void action().catch(onError);
  const related = (id: string) => {
    if (!ids.includes(id)) setIds((previous) => [...previous, id]);
    setCurrent(id);
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="image-viewer viewer-workspace viewer-dialog"
      aria-label={t("details")}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.defaultPrevented) return;
        if (
          event.target instanceof HTMLElement &&
          event.target.closest(
            'input, textarea, select, [role=combobox], [role=listbox], [contenteditable="true"], [role="slider"]',
          )
        )
          return;
        if (event.key === "ArrowLeft" && index > 0) {
          event.preventDefault();
          setCurrent(ids[index - 1]);
        }
        if (event.key === "ArrowRight" && index < ids.length - 1) {
          event.preventDefault();
          setCurrent(ids[index + 1]);
        }
      }}
    >
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
            {index < 0 ? "—" : index + 1} / {ids.length}
          </span>
          <button
            disabled={index < 0 || index >= ids.length - 1}
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
            <button className="viewer-reference-button" onClick={() => attempt(() => onReference(entry))}>
              {t("useReference")}
            </button>
            <button title={t("upscale")} aria-label={t("upscale")} onClick={() => onUpscale(entry)}>
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
        <button title={t("close")} aria-label={t("close")} onClick={onClose}>
          <XIcon />
        </button>
      </header>
      <div className="viewer-body">
        {entry ? (
          <ImageStage
            key={current}
            before={{ dataUrl: imageUrl(entry.path), ...entry.asset }}
            toolbarTarget={toolbarTarget}
            showLoading
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
            maxWidth={600}
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
    </dialog>,
    document.body,
  );
}
