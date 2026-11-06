import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cancelUpscale, runUpscale } from "./queue";
import { settingsText } from "../settings/messages";
import { open } from "@tauri-apps/plugin-dialog";
import { PlusIcon, XIcon, PauseIcon, PlayIcon, FolderOpenIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import type { GalleryEntry } from "../domain/types";
import { label, localize, t } from "../i18n";
import { chooseImages } from "../gallery/actions";
import { AssetPicker } from "../gallery/AssetPicker";
import { imageUrl, native } from "../services/native";
import { refreshGallery } from "../services/store";
import { PathPreview } from "../components/PathPreview";
import { Dialog } from "../components/Dialog";
import { ResizablePanel } from "../components/ResizablePanel";

import { loadUpscaleModels, resolveUpscaleModel, noiseOptions, type Noise, type UpscaleModel } from "./catalog";
interface Job {
  id: string;
  input: GalleryEntry;
  progress: number;
  status: "pending" | "queued" | "generating" | "completed" | "failed" | "cancelled";
  path?: string;
  assetId?: string;
  error?: string;
  exportError?: string;
  destination?: string;
  scale?: number;
  modelId?: string;
  saving?: boolean;
}
let workspace: { single?: Job; jobs: Job[]; batch: boolean; busy: boolean } = { jobs: [], batch: false, busy: false };
const listeners = new Set<() => void>();
const publish = (next: Partial<typeof workspace>) => {
  workspace = { ...workspace, ...next };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => workspace;
const makeJob = (input: GalleryEntry): Job => ({ id: crypto.randomUUID(), input, progress: 0, status: "pending" });
export function Upscale({
  onError,
  incoming,
}: {
  onError: (error: unknown) => void;
  incoming?: { entries: GalleryEntry[]; nonce: string };
}) {
  const [models, setModels] = useState<UpscaleModel[]>([]),
    [model, setModel] = useState("");
  const [noise, setNoise] = useState<Noise>("no-denoise");
  const [scale, setScale] = useState(4),
    [tile, setTile] = useState(128);
  const [destination, setDestination] = useState(""),
    [saveToGallery, setSaveToGallery] = useState(true);
  const { single, jobs, batch, busy } = useSyncExternalStore(subscribe, snapshot);
  const setSingle = (next: Job | undefined | ((value: Job | undefined) => Job | undefined)) =>
    publish({ single: typeof next === "function" ? next(workspace.single) : next });
  const setJobs = (next: Job[] | ((value: Job[]) => Job[])) =>
    publish({ jobs: typeof next === "function" ? next(workspace.jobs) : next });
  const setBatch = (value: boolean) => publish({ batch: value });
  const setBusy = (value: boolean) => publish({ busy: value });
  const [view, setView] = useState<string>();
  const [picker, setPicker] = useState(false),
    [pausing, setPausing] = useState(false);
  const running = useRef(busy),
    received = useRef<string>(undefined);
  const visible = batch ? jobs : single ? [single] : [];
  const add = (entries: GalleryEntry[]) => {
    if (!entries.length) return;
    if (batch || entries.length > 1 || workspace.busy) {
      setJobs((current) => [...current, ...entries.map(makeJob)]);
      setBatch(true);
    } else setSingle(makeJob(entries[0]));
  };
  useEffect(() => {
    if (incoming && incoming.nonce !== received.current) {
      received.current = incoming.nonce;
      add(incoming.entries);
    }
  }, [incoming]);
  useEffect(() => {
    void loadUpscaleModels()
      .then((entries) => {
        setModels(entries);
        setModel(entries[0]?.id ?? "");
        if (entries[0]) setScale(entries[0].scales.includes(4) ? 4 : entries[0].scales[0]);
      })
      .catch(onError);
  }, [onError]);
  const activeModel = models.find((entry) => entry.id === model);
  const availableNoise = noiseOptions.filter((option) =>
    activeModel?.configurations.some((entry) => entry.scale === scale && entry.noise === option.id),
  );
  const changeConfiguration = (id: string, nextScale: number) => {
    const next = models.find((entry) => entry.id === id)!;
    const supportedScale = next.scales.includes(nextScale) ? nextScale : next.scales[0];
    const choices = next.configurations.filter((entry) => entry.scale === supportedScale);
    setModel(id);
    setScale(supportedScale);
    if (!choices.some((entry) => entry.noise === noise)) setNoise(choices[0]?.noise ?? "no-denoise");
  };
  const update = (id: string, changes: Partial<Job>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...changes } : job)));
    setSingle((current) => (current?.id === id ? { ...current, ...changes } : current));
  };
  const run = async () => {
    if (workspace.busy) return;
    const queue = visible.filter((job) => job.status === "pending" || job.status === "failed");
    if (!queue.length) return;
    const fileId = resolveUpscaleModel(models, model, scale, noise);
    running.current = true;
    setBusy(true);
    setPausing(false);
    const submitted = queue.map((job) => ({ ...job, id: crypto.randomUUID() }));
    const replacements = new Map(queue.map((job, index) => [job.id, submitted[index]]));
    setJobs((current) => current.map((job) => replacements.get(job.id) ?? job));
    setSingle((current) => (current ? (replacements.get(current.id) ?? current) : current));
    try {
      await Promise.all(
        submitted.map(async (job) => {
          update(job.id, { status: "queued", progress: 0, error: undefined, scale });
          try {
            const result = await runUpscale(
              {
                jobId: job.id,
                assetId: job.input.asset.id,
                modelId: fileId,
                scale,
                tileSize: tile,
                destination: destination || null,
                saveToGallery,
              },
              (event) => {
                if (event.phase === "running") update(job.id, { status: "generating" });
                if (event.total) update(job.id, { progress: Math.round(((event.completed ?? 0) / event.total) * 100) });
              },
            );
            update(job.id, {
              status: "completed",
              progress: 100,
              path: result.path,
              assetId: result.gallery?.asset.id,
              exportError: result.exportError,
              error: result.galleryError,
              destination,
              modelId: fileId,
            });
          } catch (error) {
            const cancelled = String(error) === "cancelled";
            update(job.id, {
              status: cancelled ? "cancelled" : "failed",
              error: cancelled ? undefined : String(error),
            });
          }
        }),
      );
    } finally {
      running.current = false;
      setBusy(false);
      setPausing(false);
    }
  };
  const saveJob = async (job: Job) => {
    if (!job.path || job.saving) return;
    update(job.id, { saving: true });
    try {
      const entry = await native<GalleryEntry & { exportError?: string }>("upscale_save", {
        path: job.path,
        modelId: job.modelId,
      });
      update(job.id, { assetId: entry.asset.id, error: undefined, exportError: entry.exportError });
      await refreshGallery();
    } finally {
      update(job.id, { saving: false });
    }
  };
  const viewed = [...jobs, ...(single ? [single] : [])].find((job) => job.id === view);
  const pending = visible.filter((job) => job.status === "pending" || job.status === "failed").length;
  const remove = (id: string) => {
    setJobs((current) => current.filter((job) => job.id !== id));
    setSingle((current) => (current?.id === id ? undefined : current));
  };
  const jobFooter = (job: Job) => (
    <footer className="upscale-job-footer">
      <div>
        <strong title={job.input.asset.id}>{job.input.asset.id}</strong>
        <small>
          {job.input.asset.width} × {job.input.asset.height}
          {job.scale ? ` → ${job.input.asset.width * job.scale} × ${job.input.asset.height * job.scale}` : ""}
        </small>
      </div>
      <span className={`status-badge status-${job.status}`}>
        {job.status === "generating" ? `${t("processing")} ${job.progress}%` : t(job.status)}
      </span>
      {job.path && !job.assetId && (
        <button disabled={job.saving} onClick={() => void saveJob(job).catch(onError)}>
          {t("saveToGallery")}
        </button>
      )}
      {job.assetId && <span className="muted">{t("saved")}</span>}
      {job.exportError && job.path && (
        <button
          title={job.exportError}
          onClick={() =>
            void (async () => {
              let directory = job.destination;
              if (!directory) {
                const selected = await open({ directory: true });
                if (typeof selected !== "string") return;
                directory = selected;
              }
              await native("upscale_export", { path: job.path, directory, jobId: job.id });
              update(job.id, { exportError: undefined });
            })().catch(onError)
          }
        >
          {t("saveAs")} · {t("retry")}
        </button>
      )}
      {["queued", "generating"].includes(job.status) && (
        <button onClick={() => void cancelUpscale(job.id).catch(onError)}>{t("cancel")}</button>
      )}
      {["completed", "cancelled"].includes(job.status) && (
        <button
          disabled={busy}
          onClick={() => update(job.id, { status: "pending", path: undefined, assetId: undefined, progress: 0 })}
        >
          {t("runAgain")}
        </button>
      )}
    </footer>
  );
  return (
    <div className="upscale-workspace">
      <ResizablePanel className="upscale-panel" storageKey="lutri.upscale.panel" initialWidth={300}>
        <div className="segmented-control">
          <button aria-pressed={!batch} onClick={() => setBatch(false)}>
            {t("single")}
          </button>
          <button aria-pressed={batch} onClick={() => setBatch(true)}>
            {t("batch")}
            {jobs.length ? ` · ${jobs.length}` : ""}
          </button>
        </div>
        <label>
          {t("model")}
          <select value={model} disabled={busy} onChange={(event) => changeConfiguration(event.target.value, scale)}>
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {localize(label("Scale", "倍率", "倍率"))}
          <div className="segmented-control">
            {(activeModel?.scales ?? []).map((value) => (
              <button
                key={value}
                disabled={busy}
                aria-pressed={scale === value}
                onClick={() => changeConfiguration(model, value)}
              >
                {value}×
              </button>
            ))}
          </div>
        </label>
        {availableNoise.length > 0 && (
          <label>
            {localize(label("Denoise", "降噪", "ノイズ除去"))}
            <select value={noise} disabled={busy} onChange={(event) => setNoise(event.target.value as Noise)}>
              {availableNoise.map((option) => (
                <option key={option.id} value={option.id}>
                  {localize(option.label)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {localize(label("Tile size", "分块尺寸", "タイルサイズ"))}
          <select value={tile} disabled={busy} onChange={(event) => setTile(Number(event.target.value))}>
            {[32, 64, 128, 256, 512].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          {localize(label("Output folder", "输出位置", "出力先"))}
          <div className="button-row">
            <button
              className="folder-button"
              disabled={busy}
              onClick={() =>
                void open({ directory: true })
                  .then((path) => {
                    if (typeof path === "string") setDestination(path);
                  })
                  .catch(onError)
              }
            >
              <FolderOpenIcon />
              {destination || t("saveAs")}
            </button>
            {destination && (
              <button disabled={busy} title={t("clearDestination")} onClick={() => setDestination("")}>
                <XIcon />
              </button>
            )}
          </div>
        </label>
        <label className="spec-option">
          <input
            type="checkbox"
            checked={saveToGallery}
            disabled={busy}
            onChange={(event) => setSaveToGallery(event.target.checked)}
          />
          {t("saveToGallery")}
        </label>
        <div className="button-row">
          <button onClick={() => void chooseImages().then(add).catch(onError)}>
            <PlusIcon />
            {t("import")}
          </button>
          <button onClick={() => setPicker(true)}>{t("gallery")}</button>
        </div>
        <div className="upscale-submit">
          <small>
            {t("pendingJobs")} · {pending}
          </small>
          {busy ? (
            <button
              disabled={pausing}
              onClick={() => {
                setPausing(true);
                void Promise.all(visible.filter((job) => job.status === "queued").map((job) => cancelUpscale(job.id)))
                  .catch(onError)
                  .finally(() => setPausing(false));
              }}
            >
              <PauseIcon />
              {settingsText("stopQueued")}
            </button>
          ) : (
            <button className="primary-button" disabled={!model || !pending} onClick={() => void run().catch(onError)}>
              <PlayIcon weight="fill" />
              {t("upscale")}
            </button>
          )}
        </div>
      </ResizablePanel>
      <div className="upscale-results">
        <div className="content-toolbar">
          <span>{batch ? t("batch") : t("single")}</span>
          <span className="toolbar-spacer" />
          {batch && (
            <button
              disabled={busy || !jobs.some((job) => job.status === "completed")}
              onClick={() => setJobs((current) => current.filter((job) => job.status !== "completed"))}
            >
              {t("clearCompleted")}
            </button>
          )}
          <button onClick={() => setPicker(true)}>
            <PlusIcon />
            {t("chooseImages")}
          </button>
        </div>
        <div className={batch ? "upscale-grid" : "upscale-single"}>
          {visible.map((job) => (
            <article key={job.id}>
              <button className="upscale-remove" disabled={busy} title={t("remove")} onClick={() => remove(job.id)}>
                <XIcon />
              </button>
              {!batch ? (
                <PathPreview before={job.input.path} after={job.path} />
              ) : (
                <button className="image-button" onClick={() => setView(job.id)}>
                  <img loading="lazy" src={imageUrl(job.path ?? job.input.thumbnailPath)} alt={job.input.asset.id} />
                </button>
              )}
              {job.status === "generating" && <progress max={100} value={job.progress} aria-label={t("processing")} />}
              {jobFooter(job)}
              {job.error && <p className="error-text">{job.error}</p>}
            </article>
          ))}
          {!visible.length && (
            <div className="empty-state">
              <ArrowUpRightIcon size={40} weight="thin" />
              <p>{t("dropImages")}</p>
              <div className="button-row">
                <button onClick={() => void chooseImages().then(add).catch(onError)}>{t("import")}</button>
                <button onClick={() => setPicker(true)}>{t("gallery")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {picker && (
        <AssetPicker
          onSelect={(entries) => {
            add(entries);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
          onError={onError}
        />
      )}
      {viewed && (
        <Dialog
          title={t("upscale")}
          onClose={() => setView(undefined)}
          className="preview-dialog"
          footer={jobFooter(viewed)}
        >
          <PathPreview key={viewed.id} before={viewed.input.path} after={viewed.path} />
        </Dialog>
      )}
    </div>
  );
}
