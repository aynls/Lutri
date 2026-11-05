import { useEffect, useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
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
  status: "pending" | "generating" | "completed" | "failed";
  path?: string;
  assetId?: string;
  error?: string;
  scale?: number;
  saving?: boolean;
}
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
    [tile, setTile] = useState(128),
    [batch, setBatch] = useState(false);
  const [destination, setDestination] = useState(""),
    [saveToGallery, setSaveToGallery] = useState(true);
  const [single, setSingle] = useState<Job>(),
    [jobs, setJobs] = useState<Job[]>([]),
    [view, setView] = useState<string>();
  const [picker, setPicker] = useState(false),
    [busy, setBusy] = useState(false),
    [pausing, setPausing] = useState(false);
  const running = useRef(false),
    pause = useRef(false),
    received = useRef<string>(undefined);
  const visible = batch ? jobs : single ? [single] : [];
  const add = (entries: GalleryEntry[]) => {
    if (!entries.length) return;
    if (batch || entries.length > 1 || running.current) {
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
    if (running.current) return;
    const queue = visible.filter((job) => job.status === "pending" || job.status === "failed");
    if (!queue.length) return;
    const fileId = resolveUpscaleModel(models, model, scale, noise);
    running.current = true;
    pause.current = false;
    setBusy(true);
    setPausing(false);
    try {
      for (const job of queue) {
        if (pause.current) break;
        update(job.id, { status: "generating", progress: 0, error: undefined, scale });
        const channel = new Channel<{ completed?: number; total?: number }>();
        channel.onmessage = (event) => {
          if (event.total) update(job.id, { progress: Math.round(((event.completed ?? 0) / event.total) * 100) });
        };
        try {
          const result = await native<{ path: string; gallery?: GalleryEntry }>("upscale_run", {
            assetId: job.input.asset.id,
            modelId: fileId,
            scale,
            tileSize: tile,
            destination: destination || null,
            saveToGallery,
            channel,
          });
          update(job.id, { status: "completed", progress: 100, path: result.path, assetId: result.gallery?.asset.id });
          await refreshGallery().catch(onError);
        } catch (error) {
          update(job.id, { status: "failed", error: String(error) });
        }
      }
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
      const entry = await native<GalleryEntry>("upscale_save", {
        path: job.path,
        name: `${job.input.asset.name} ×${job.scale}`,
      });
      update(job.id, { assetId: entry.asset.id });
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
        <strong title={job.input.asset.name}>{job.input.asset.name}</strong>
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
      {job.status === "completed" && (
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
                pause.current = true;
                setPausing(true);
              }}
            >
              <PauseIcon />
              {t("pauseQueue")}
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
                <PathPreview before={job.input.path} after={job.path} name={job.input.asset.name} />
              ) : (
                <button className="image-button" onClick={() => setView(job.id)}>
                  <img loading="lazy" src={imageUrl(job.path ?? job.input.thumbnailPath)} alt={job.input.asset.name} />
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
          title={viewed.input.asset.name}
          onClose={() => setView(undefined)}
          className="preview-dialog"
          footer={jobFooter(viewed)}
        >
          <PathPreview key={viewed.id} before={viewed.input.path} after={viewed.path} name={viewed.input.asset.name} />
        </Dialog>
      )}
    </div>
  );
}
