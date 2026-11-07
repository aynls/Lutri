import { Select } from "../components/Select";
import { DirectoryPicker } from "../components/DirectoryPicker";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cancelUpscale, runUpscale } from "./queue";
import { settingsText } from "../settings/messages";
import { open } from "@tauri-apps/plugin-dialog";
import {
  PlusIcon,
  XIcon,
  PauseIcon,
  PlayIcon,
  ArrowUpRightIcon,
  ArrowCounterClockwiseIcon,
  ImagesIcon,
  StopIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry } from "../domain/types";
import { label, localize, t } from "../i18n";
import { chooseImages } from "../gallery/actions";
import { AssetPicker } from "../gallery/AssetPicker";
import { ImageViewer } from "../gallery/ImageViewer";
import { imageUrl, native } from "../services/native";
import { refreshGallery } from "../services/store";
import { PathPreview } from "../components/PathPreview";
import { ResizablePanel } from "../components/ResizablePanel";
import { UpscaleModelSelector } from "./ModelSelector";

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
  referencing?: boolean;
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
const savingJobs = new Map<string, Promise<GalleryEntry>>();
export function Upscale({
  onError,
  incoming,
  onReference,
}: {
  onError: (error: unknown) => void;
  incoming?: { entries: GalleryEntry[]; nonce: string };
  onReference: (entry: GalleryEntry) => Promise<void>;
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
  const active = useRef(0),
    received = useRef<string>(undefined);
  const resultsContainer = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  const visible = batch ? jobs : single ? [single] : [];
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setColumnCount(Math.max(1, Math.floor((entry.contentRect.width - 40 + 16) / 272))),
    );
    observer.observe(resultsContainer.current!);
    return () => observer.disconnect();
  }, []);
  const columns: Job[][] = Array.from({ length: columnCount }, () => []);
  const heights = Array<number>(columnCount).fill(0);
  for (const job of jobs) {
    const column = heights.indexOf(Math.min(...heights));
    columns[column].push(job);
    heights[column] += (256 * job.input.asset.height) / job.input.asset.width + 60 + (job.error ? 130 : 0);
  }
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
  const execute = async (job: Job) => {
    const fileId = resolveUpscaleModel(models, model, scale, noise);
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
  };
  const track = async (job: Job) => {
    active.current += 1;
    setBusy(true);
    try {
      await execute(job);
    } finally {
      active.current -= 1;
      if (!active.current) {
        setBusy(false);
        setPausing(false);
      }
    }
  };
  const run = async () => {
    if (workspace.busy) return;
    const queue = visible.filter((job) => job.status === "pending" || job.status === "failed");
    if (!queue.length) return;
    const submitted = queue.map((job) => ({ ...job, id: crypto.randomUUID() }));
    const replacements = new Map(queue.map((job, index) => [job.id, submitted[index]]));
    setView((current) => (current ? (replacements.get(current)?.id ?? current) : current));
    setJobs((current) => current.map((job) => replacements.get(job.id) ?? job));
    setSingle((current) => (current ? (replacements.get(current.id) ?? current) : current));
    await Promise.all(submitted.map(track));
  };
  const saveJob = (job: Job): Promise<GalleryEntry> => {
    const existing = savingJobs.get(job.id);
    if (existing) return existing;
    const saving = (async () => {
      const latest =
        workspace.jobs.find((entry) => entry.id === job.id) ??
        (workspace.single?.id === job.id ? workspace.single : job);
      if (latest.assetId) {
        const [entry] = await native<GalleryEntry[]>("gallery_entries", { ids: [latest.assetId] });
        if (entry) return entry;
      }
      if (!latest.path) throw new Error(t("missing"));
      update(job.id, { saving: true });
      try {
        const entry = await native<GalleryEntry & { exportError?: string }>("upscale_save", {
          path: latest.path,
          modelId: latest.modelId,
        });
        update(job.id, {
          assetId: entry.asset.id,
          error: undefined,
          exportError: entry.exportError ?? latest.exportError,
        });
        await refreshGallery();
        return entry;
      } finally {
        update(job.id, { saving: false });
      }
    })().finally(() => savingJobs.delete(job.id));
    savingJobs.set(job.id, saving);
    return saving;
  };
  const viewed = [...jobs, ...(single ? [single] : [])].find((job) => job.id === view);
  const pending = visible.filter((job) => job.status === "pending" || job.status === "failed").length;
  const doneCount = jobs.filter((job) => job.status === "completed").length;
  const remove = (id: string) => {
    setJobs((current) => current.filter((job) => job.id !== id));
    setSingle((current) => (current?.id === id ? undefined : current));
  };
  const retry = (job: Job) => {
    const next = makeJob(job.input);
    if (view === job.id) setView(next.id);
    setJobs((current) => current.map((entry) => (entry.id === job.id ? next : entry)));
    setSingle((current) => (current?.id === job.id ? next : current));
    void track(next).catch(onError);
  };
  const referenceJob = async (job: Job) => {
    const latest = workspace.jobs.find((entry) => entry.id === job.id) ?? workspace.single;
    if (latest?.referencing) return;
    update(job.id, { referencing: true });
    try {
      await onReference(await saveJob(job));
    } finally {
      update(job.id, { referencing: false });
    }
  };
  const jobFooter = (job: Job, inViewer = false) => (
    <footer className="upscale-job-footer">
      {job.status === "generating" && <progress max={100} value={job.progress} aria-label={t("processing")} />}
      <small className="upscale-job-spec" title={job.input.asset.id}>
        {job.input.asset.width} × {job.input.asset.height}
        {job.scale ? ` → ${job.input.asset.width * job.scale} × ${job.input.asset.height * job.scale}` : ""}
      </small>
      <span className="upscale-job-status">
        {t(job.status === "generating" ? "processing" : job.status)}
        {job.status === "generating" ? ` · ${job.progress}%` : ""}
      </span>
      <div className="upscale-job-actions">
        {job.path && !inViewer && (
          <button disabled={job.saving || job.referencing} onClick={() => void referenceJob(job).catch(onError)}>
            {t("useReference")}
          </button>
        )}
        {job.path && !job.assetId && (
          <button
            disabled={job.saving}
            title={t("saveToGallery")}
            aria-label={t("saveToGallery")}
            onClick={() => void saveJob(job).catch(onError)}
          >
            <ImagesIcon size={16} />
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
          <button className="job-cancel" title={t("cancel")} onClick={() => void cancelUpscale(job.id).catch(onError)}>
            <StopIcon size={14} />
            {t("cancel")}
          </button>
        )}
        {(job.status === "cancelled" || job.status === "failed") && (
          <button disabled={!model} title={t("runAgain")} aria-label={t("runAgain")} onClick={() => retry(job)}>
            <ArrowCounterClockwiseIcon size={16} />
          </button>
        )}
      </div>
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
          </button>
        </div>
        <UpscaleModelSelector
          models={models}
          value={model}
          disabled={busy}
          onChange={(id) => changeConfiguration(id, scale)}
        />
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
            <Select value={noise} disabled={busy} onValueChange={(nextValue) => setNoise(nextValue as Noise)}>
              {availableNoise.map((option) => (
                <option key={option.id} value={option.id}>
                  {localize(option.label)}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label>
          {localize(label("Tile size", "分块尺寸", "タイルサイズ"))}
          <Select value={tile} disabled={busy} onValueChange={(nextValue) => setTile(Number(nextValue))}>
            {[32, 64, 128, 256, 512].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </label>
        <label>
          {localize(label("Output folder", "输出位置", "出力先"))}
          <DirectoryPicker value={destination} disabled={busy} onChange={setDestination} onError={onError} />
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
          <div className="upscale-queue">
            <small>
              {t("pendingJobs")} · {pending}
            </small>
            {batch && doneCount > 0 && (
              <button
                className="queue-clear"
                disabled={busy || jobs.some((job) => job.saving || job.referencing)}
                onClick={() => setJobs((current) => current.filter((job) => job.status !== "completed"))}
              >
                {t("clearCompleted")} · {doneCount}
              </button>
            )}
          </div>
          {!batch && single && jobFooter(single)}
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
      <div className="upscale-results" ref={resultsContainer}>
        {batch && visible.length ? (
          <div className="upscale-grid">
            {columns.map((column, index) => (
              <div className="upscale-column" key={index}>
                {column.map((job) => (
                  <article key={job.id}>
                    <button
                      className="upscale-remove"
                      disabled={busy || job.saving || job.referencing}
                      title={t("remove")}
                      onClick={() => remove(job.id)}
                    >
                      <XIcon />
                    </button>
                    <button className="image-button" aria-label={t("details")} onClick={() => setView(job.id)}>
                      <img
                        loading="lazy"
                        src={imageUrl(job.path ?? job.input.thumbnailPath)}
                        alt={job.input.asset.id}
                        style={{ aspectRatio: `${job.input.asset.width} / ${job.input.asset.height}` }}
                      />
                    </button>
                    {jobFooter(job)}
                    {job.error && <p className="error-text">{job.error}</p>}
                  </article>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className={batch ? "upscale-grid" : "upscale-single"}>
            {single && !batch && (
              <article>
                <button
                  className="upscale-remove"
                  disabled={busy || single.saving || single.referencing}
                  title={t("remove")}
                  onClick={() => remove(single.id)}
                >
                  <XIcon />
                </button>
                <PathPreview before={single.input.path} after={single.path} />
                {single.error && <p className="error-text">{single.error}</p>}
              </article>
            )}
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
        )}
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
        <ImageViewer
          initialId={viewed.id}
          items={(batch ? jobs : single ? [single] : []).map((job) => ({
            id: job.id,
            assetId: job.path ? job.assetId : job.input.asset.id,
            preview: { before: job.input.path, after: job.path },
            resolveEntry: job.path ? () => saveJob(job) : undefined,
            details: (
              <section className="upscale-viewer-details">
                {jobFooter(job, true)}
                {job.error && <p className="error-text">{job.error}</p>}
              </section>
            ),
          }))}
          onClose={() => setView(undefined)}
          onNavigate={(id) => {
            if (visible.some((job) => job.id === id)) setView(id);
          }}
          onReference={async (entry) => {
            await onReference(entry);
            setView(undefined);
          }}
        />
      )}
    </div>
  );
}
