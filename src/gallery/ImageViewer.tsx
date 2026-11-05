import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ArrowLeftIcon, ArrowRightIcon, HeartIcon, InfoIcon, XIcon } from "@phosphor-icons/react";
import { useApplication } from "../services/store";
import { imageUrl } from "../services/native";
import { t } from "../i18n";
import { ImageStage } from "../components/ImageStage";
import { CopyButton } from "../components/CopyButton";
import { RequestDetails } from "../history/RequestDetails";
import { exportImages, favorite } from "./actions";

export function ImageViewer({ assetId }: { assetId: string }) {
  const { gallery, tasks, ready } = useApplication();
  const [current, setCurrent] = useState(assetId),
    [info, setInfo] = useState(true),
    [error, setError] = useState("");
  const ordered = [...gallery].sort((a, b) => b.addedAt - a.addedAt);
  const index = ordered.findIndex((entry) => entry.asset.id === current),
    entry = ordered[index];
  const task = tasks.find((task) => task.results.some((result) => result.assetId === current));
  const onError = (value: unknown) => setError(String(value));
  const attempt = (action: () => Promise<unknown>) => void action().catch(onError);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button")) return;
      if (event.key === "Escape") void getCurrentWindow().close().catch(onError);
      if (event.key === "ArrowLeft" && index > 0) setCurrent(ordered[index - 1].asset.id);
      if (event.key === "ArrowRight" && index < ordered.length - 1) setCurrent(ordered[index + 1].asset.id);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, gallery]);
  return (
    <div className="image-viewer viewer-workspace">
      <header className="viewer-toolbar">
        <div className="button-row">
          <button disabled={index <= 0} title={t("back")} onClick={() => setCurrent(ordered[index - 1].asset.id)}>
            <ArrowLeftIcon />
          </button>
          <span>
            {index < 0 ? "—" : index + 1} / {ordered.length}
          </span>
          <button
            disabled={index < 0 || index >= ordered.length - 1}
            title={t("results")}
            onClick={() => setCurrent(ordered[index + 1].asset.id)}
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
          <div className="empty-state">{ready ? t("missing") : <span className="spinner" />}</div>
        )}
        {info && (
          <aside className="viewer-inspector">
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
            {task && <RequestDetails task={task} onView={setCurrent} onError={onError} />}
          </aside>
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
