import { useEffect, useRef, useState, type ReactNode } from "react";
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
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useApplication } from "../services/store";
import { native, imageUrl } from "../services/native";
import { t } from "../i18n";
import { ImageStage } from "../components/ImageStage";
import { PathPreview, type PathPreviewProps } from "../components/PathPreview";
import { CopyButton } from "../components/CopyButton";
import { ResizablePanel } from "../components/ResizablePanel";
import { RequestDetails } from "../history/RequestDetails";
import { copyAssetImage, exportImages, favorite } from "./actions";

import { lt } from "../i18n/library";
import type { GalleryEntry } from "../domain/types";
import { isSvgAsset } from "../domain/media";

export interface ImageViewerItem {
  id: string;
  assetId?: string;
  preview?: Omit<PathPreviewProps, "toolbarTarget">;
  resolveEntry?: () => Promise<GalleryEntry>;
  onExport?: () => Promise<unknown>;
  details?: ReactNode;
}

export function ImageViewer({
  initialId,
  items,
  onClose,
  onReference,
  onUpscale,
  onDelete,
  onNavigate,
}: {
  initialId: string;
  items: ImageViewerItem[];
  onClose: () => void;
  onReference: (entry: GalleryEntry) => Promise<void>;
  onUpscale?: (entry: GalleryEntry) => void;
  onDelete?: (entry: GalleryEntry) => Promise<void>;
  onNavigate?: (id: string) => void;
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
  const [selected, setSelected] = useState(initialId),
    [info, setInfo] = useState(true),
    [error, setError] = useState("");
  const [relatedItems, setRelatedItems] = useState<ImageViewerItem[]>([]);
  const sources = [...new Map([...items, ...relatedItems].map((item) => [item.id, item])).values()];
  const ids = sources.map((item) => item.id);
  const current = ids.includes(selected) ? selected : initialId;
  const setCurrent = (id: string) => {
    setSelected(id);
    setError("");
    onNavigate?.(id);
  };
  const source = sources.find((item) => item.id === current);
  const assetId = source?.assetId;
  const [loaded, setLoaded] = useState<GalleryEntry[]>([]);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const actionLock = useRef(false);
  useEffect(() => {
    if (!assetId) {
      setLoaded([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void native<GalleryEntry[]>("gallery_entries", { ids: [assetId] })
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
  }, [assetId, gallery]);
  const index = ids.indexOf(current),
    entry = loaded.find((entry) => entry.asset.id === assetId) ?? gallery.find((entry) => entry.asset.id === assetId);
  const path = entry?.path ?? source?.preview?.after ?? source?.preview?.before;
  const task = tasks.find((task) => task.results.some((result) => result.assetId === assetId));
  const onError = (value: unknown) => setError(String(value));
  const attempt = (action: () => Promise<unknown>) => void action().catch(onError);
  const withAction = (action: () => unknown | Promise<unknown>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setActing(true);
    setError("");
    attempt(async () => {
      try {
        await action();
      } finally {
        actionLock.current = false;
        setActing(false);
      }
    });
  };
  const withEntry = (action: (entry: GalleryEntry) => unknown | Promise<unknown>) =>
    withAction(async () => {
      const resolved = source?.resolveEntry ? await source.resolveEntry() : entry;
      if (!resolved) throw new Error(t("missing"));
      await action(resolved);
    });
  const related = (id: string) => {
    if (!ids.includes(id)) setRelatedItems((previous) => [...previous, { id, assetId: id }]);
    setCurrent(id);
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="image-viewer viewer-workspace viewer-dialog"
      aria-label={source?.preview?.after ? t("compare") : t("details")}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.defaultPrevented) return;
        if (actionLock.current) return;
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
            disabled={acting || index <= 0}
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
            disabled={acting || index < 0 || index >= ids.length - 1}
            title={lt("nextImage")}
            aria-label={lt("nextImage")}
            onClick={() => setCurrent(ids[index + 1])}
          >
            <ArrowRightIcon />
          </button>
        </div>
        <div className="viewer-zoom-controls" ref={setToolbarTarget} />
        <span className="toolbar-spacer" />
        {(entry || source?.resolveEntry) && (
          <>
            <button className="viewer-reference-button" disabled={acting} onClick={() => withEntry(onReference)}>
              {t("useReference")}
            </button>
            {onUpscale && (
              <button
                disabled={acting || (entry && isSvgAsset(entry.asset))}
                title={entry && isSvgAsset(entry.asset) ? t("svgUpscaleUnsupported") : t("upscale")}
                aria-label={t("upscale")}
                onClick={() =>
                  withEntry((resolved) => {
                    if (isSvgAsset(resolved.asset)) throw new Error(t("svgUpscaleUnsupported"));
                    return onUpscale(resolved);
                  })
                }
              >
                <ArrowUpRightIcon />
              </button>
            )}
            {entry && (
              <>
                <button
                  disabled={acting || entry.unlisted}
                  title={entry?.favorite ? t("removeFavorite") : t("favorites")}
                  aria-label={entry?.favorite ? t("removeFavorite") : t("favorites")}
                  aria-pressed={entry?.favorite ?? false}
                  onClick={() => withEntry(favorite)}
                >
                  <HeartIcon weight={entry?.favorite ? "fill" : "regular"} />
                </button>
                <button
                  title={lt("copyImage")}
                  aria-label={lt("copyImage")}
                  disabled={acting}
                  onClick={() => withEntry((resolved) => copyAssetImage(resolved.asset.id))}
                >
                  <CopyIcon />
                </button>
              </>
            )}
            {(entry || source?.onExport) && (
              <button
                disabled={acting}
                title={t("saveAs")}
                aria-label={t("saveAs")}
                onClick={() =>
                  source?.onExport ? withAction(source.onExport) : withEntry((resolved) => exportImages([resolved]))
                }
              >
                <DownloadSimpleIcon />
              </button>
            )}
            {entry && onDelete && !entry.unlisted && !entry.staged && (
              <button
                className="danger-button"
                disabled={acting}
                title={t("delete")}
                aria-label={t("delete")}
                onClick={() => withEntry(onDelete)}
              >
                <TrashIcon />
              </button>
            )}
            {path && (
              <button
                title={t("reveal")}
                aria-label={t("reveal")}
                disabled={acting}
                onClick={() => attempt(() => revealItemInDir(path))}
              >
                <FolderOpenIcon />
              </button>
            )}
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
        {source?.preview ? (
          <PathPreview key={current} {...source.preview} toolbarTarget={toolbarTarget} />
        ) : entry ? (
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
              {source?.details}
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
                        <code>{entry.asset.id}</code>
                        <CopyButton value={entry.asset.id} onError={onError} />
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
