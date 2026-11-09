import { Select } from "../components/Select";
import { OutputControls } from "../components/OutputControls";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cancelUpscale, runUpscale } from "./queue";
import { settingsText } from "../settings/messages";
import { save } from "@tauri-apps/plugin-dialog";
import {
  PlusIcon,
  XIcon,
  PauseIcon,
  PlayIcon,
  ArrowUpRightIcon,
  ArrowCounterClockwiseIcon,
  StopIcon,
  ArrowsHorizontalIcon,
  DownloadSimpleIcon,
  CheckIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft } from "../domain/types";
import { isSvgAsset } from "../domain/media";
import { localize, t } from "../i18n";
import { chooseImages, deleteImage } from "../gallery/actions";
import { AssetPicker } from "../gallery/AssetPicker";
import { ImageViewer } from "../gallery/ImageViewer";
import { assetExists, imageUrl, native } from "../services/native";
import { retainAssets, useApplication } from "../services/store";
import { PathPreview } from "../components/PathPreview";
import { ResizablePanel } from "../components/ResizablePanel";
import { UpscaleModelSelector } from "./ModelSelector";

import { loadUpscaleModels, resolveUpscaleModel, noiseOptions, type Noise, type UpscaleModel } from "./catalog";
interface Configuration {
  modelId: string;
  modelName: string;
  scale: number;
  noise?: Noise;
  tileSize: number;
  destination: string;
}
interface Job {
  id: string;
  input: GalleryEntry;
  progress: number;
  status: "pending" | "queued" | "generating" | "completed" | "failed" | "cancelled";
  path?: string;
  thumbnailPath?: string;
  assetId?: string;
  error?: string;
  exportError?: string;
  exportedPath?: string;
  exportTarget?: string;
  configuration?: Configuration;
  exporting?: boolean;
  referencing?: boolean;
  deleting?: boolean;
}
let workspace: { input?: GalleryEntry; single?: Job; results: Job[]; jobs: Job[]; batch: boolean; busy: boolean } = {
  results: [],
  jobs: [],
  batch: false,
  busy: false,
};
const workspaceJobs = () => [
  ...new Map(
    [...workspace.jobs, ...workspace.results, ...(workspace.single ? [workspace.single] : [])].map((job) => [
      job.id,
      job,
    ]),
  ).values(),
];
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
  onReference,
  onEdit,
  onRestore,
}: {
  onError: (error: unknown) => void;
  incoming?: { entries: GalleryEntry[]; nonce: string };
  onReference: (entry: GalleryEntry) => Promise<void>;
  onEdit: (entry: GalleryEntry) => boolean;
  onRestore: (draft: GenerationDraft) => Promise<boolean>;
}) {
  const [models, setModels] = useState<UpscaleModel[]>([]),
    [model, setModel] = useState("");
  const [noise, setNoise] = useState<Noise>("no-denoise");
  const [scale, setScale] = useState(4),
    [tile, setTile] = useState(128);
  const { preferences } = useApplication();
  const autoSave = preferences.outputs?.upscaleAuto ?? false;
  const destination = autoSave ? (preferences.outputs?.directory ?? "") : "";
  const missingDestination = autoSave && !destination.trim();
  const { input, single, results, jobs, batch, busy } = useSyncExternalStore(subscribe, snapshot);
  useEffect(
    () =>
      retainAssets([
        ...(input ? [input.asset.id] : []),
        ...[...jobs, ...results, ...(single ? [single] : [])].flatMap((job) => [
          job.input.asset.id,
          ...(job.assetId ? [job.assetId] : []),
        ]),
      ]),
    [input, jobs, results, single],
  );
  const setJobs = (next: Job[] | ((value: Job[]) => Job[])) =>
    publish({ jobs: typeof next === "function" ? next(workspace.jobs) : next });
  const setBatch = (value: boolean) => publish({ batch: value });
  const setBusy = (value: boolean) => publish({ busy: value });
  const [view, setView] = useState<string>();
  const viewerCurrent = useRef<string>(undefined);
  const openView = (id: string) => {
    viewerCurrent.current = id;
    setView(id);
  };
  const [picker, setPicker] = useState(false),
    [pausing, setPausing] = useState(false);
  const active = useRef(0),
    received = useRef<string>(undefined);
  const resultsContainer = useRef<HTMLDivElement>(null);
  const resultList = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  const latestResultId = results[results.length - 1]?.id;
  useEffect(() => {
    if (!batch && !view && resultList.current) resultList.current.scrollLeft = resultList.current.scrollWidth;
  }, [latestResultId]);
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
    if (!entries.length) return false;
    if (workspaceJobs().some((job) => job.deleting && entries.some((entry) => entry.asset.id === job.assetId))) {
      onError(new Error(t("assetInUse")));
      return false;
    }
    if (entries.some((entry) => isSvgAsset(entry.asset))) {
      onError(new Error(t("svgUpscaleUnsupported")));
      return false;
    }
    if (workspace.batch || entries.length > 1 || workspace.busy) {
      const running =
        workspace.single &&
        ["queued", "generating"].includes(workspace.single.status) &&
        !workspace.jobs.some((job) => job.id === workspace.single!.id)
          ? [workspace.single]
          : [];
      setJobs((current) => [...current, ...running, ...entries.map(makeJob)]);
      setBatch(true);
    } else publish({ input: entries[0], single: undefined });
    return true;
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
    const replace = (job: Job) => (job.id === id ? { ...job, ...changes } : job);
    const nextSingle = workspace.single ? replace(workspace.single) : undefined;
    const nextResults = workspace.results.map(replace);
    if (nextSingle?.id === id && changes.status === "completed" && !nextResults.some((job) => job.id === id))
      nextResults.push(nextSingle);
    publish({ jobs: workspace.jobs.map(replace), results: nextResults, single: nextSingle });
  };
  const configuration = (): Configuration => {
    if (missingDestination) throw new Error(t("saveDirectoryRequired"));
    return {
      modelId: resolveUpscaleModel(models, model, scale, noise),
      modelName: activeModel!.name,
      scale,
      noise: availableNoise.length ? noise : undefined,
      tileSize: tile,
      destination,
    };
  };
  const execute = async (job: Job) => {
    const options = job.configuration!;
    try {
      const result = await runUpscale(
        {
          jobId: job.id,
          assetId: job.input.asset.id,
          modelId: options.modelId,
          scale: options.scale,
          tileSize: options.tileSize,
          destination: options.destination || null,
        },
        (event) => {
          if (event.phase === "running") update(job.id, { status: "generating" });
          if (event.total) update(job.id, { progress: Math.round(((event.completed ?? 0) / event.total) * 100) });
        },
      );
      update(job.id, {
        status: "completed",
        progress: 100,
        path: result.entry.path,
        thumbnailPath: result.entry.thumbnailPath,
        assetId: result.entry.asset.id,
        exportError: result.exportError,
        exportedPath: result.exportedPath,
        exportTarget: options.destination ? `${options.destination}/${job.id}.png` : undefined,
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
    if (workspace.busy || (!workspace.batch && workspace.single?.deleting)) return;
    if (!workspace.batch) {
      if (!workspace.input) return;
      const job: Job = { ...makeJob(workspace.input), status: "queued", configuration: configuration() };
      publish({ single: job });
      await track(job);
      return;
    }
    const queue = workspace.jobs.filter((job) => job.status === "pending" || job.status === "failed");
    if (!queue.length) return;
    const options = configuration();
    const submitted: Job[] = queue.map((job) => ({
      ...makeJob(job.input),
      status: "queued",
      configuration: options,
    }));
    const replacements = new Map(queue.map((job, index) => [job.id, submitted[index]]));
    if (view && replacements.has(view)) {
      const next = replacements.get(view)!.id;
      if (viewerCurrent.current === view) viewerCurrent.current = next;
      setView(next);
    }
    setJobs((current) => current.map((job) => replacements.get(job.id) ?? job));
    await Promise.all(submitted.map(track));
  };
  const resolveJobEntry = async (job: Job): Promise<GalleryEntry> => {
    if (!job.assetId) throw new Error(t("missing"));
    const [entry] = await native<GalleryEntry[]>("gallery_entries", { ids: [job.assetId] });
    if (!entry || !(await assetExists(job.assetId))) throw new Error(t("missing"));
    return entry;
  };
  const pending = jobs.filter((job) => job.status === "pending" || job.status === "failed").length;
  const doneCount = jobs.filter((job) => job.status === "completed").length;
  const remove = async (ids: string[]) => {
    const selected = workspaceJobs().filter((job) => ids.includes(job.id));
    if (
      selected.some(
        (job) => ["queued", "generating"].includes(job.status) || job.exporting || job.referencing || job.deleting,
      )
    )
      return;
    publish({
      jobs: workspace.jobs.filter((job) => !ids.includes(job.id)),
      results: workspace.results.filter((job) => !ids.includes(job.id)),
      single: workspace.single && ids.includes(workspace.single.id) ? undefined : workspace.single,
    });
    if (view && ids.includes(view)) setView(undefined);
  };
  const retry = async (job: Job) => {
    if (workspace.busy || missingDestination || workspaceJobs().find((entry) => entry.id === job.id)?.deleting) return;
    const next: Job = { ...makeJob(job.input), status: "queued", configuration: configuration() };
    if (view === job.id) openView(next.id);
    setJobs((current) => current.map((entry) => (entry.id === job.id ? next : entry)));
    await track(next);
  };
  const exportJob = async (job: Job, retryExport = false) => {
    const latest = workspaceJobs().find((entry) => entry.id === job.id);
    if (!latest?.assetId || latest.exporting || latest.referencing || latest.deleting) return;
    update(job.id, { exporting: true });
    try {
      const target =
        retryExport && job.exportTarget
          ? job.exportTarget
          : await save({
              defaultPath: preferences.outputs?.directory
                ? `${preferences.outputs.directory}/${job.id}.png`
                : `${job.id}.png`,
              filters: [{ name: "PNG", extensions: ["png"] }],
            });
      if (!target) return;
      update(job.id, { exportTarget: target });
      const exportedPath = await native<string>("upscale_export", {
        assetId: job.assetId,
        destination: target,
      });
      update(job.id, { exportedPath, exportError: undefined });
    } catch (error) {
      update(job.id, { exportError: String(error) });
      throw error;
    } finally {
      update(job.id, { exporting: false });
    }
  };
  const referenceJob = async (job: Job) => {
    const latest = workspaceJobs().find((entry) => entry.id === job.id);
    if (!latest || latest.referencing || latest.exporting || latest.deleting) return false;
    update(job.id, { referencing: true });
    try {
      await onReference(await resolveJobEntry(job));
      return true;
    } finally {
      update(job.id, { referencing: false });
    }
  };
  const deleteResult = async (job: Job) => {
    const latest = workspaceJobs().find((entry) => entry.id === job.id);
    if (!latest?.assetId || latest.status !== "completed" || latest.deleting || latest.exporting || latest.referencing)
      return;
    const assetId = latest.assetId;
    const isInput = () =>
      workspace.input?.asset.id === assetId ||
      [...workspace.jobs, ...workspace.results, ...(workspace.single ? [workspace.single] : [])].some(
        (entry) => entry.input.asset.id === assetId,
      );
    if (isInput()) throw new Error(t("assetInUse"));
    update(job.id, { deleting: true });
    try {
      const activeJobs = await native<{ jobId: string; assetId: string }[]>("upscale_jobs");
      if (
        activeJobs.some((entry) => entry.jobId === job.id || entry.jobId === assetId || entry.assetId === assetId) ||
        isInput()
      )
        throw new Error(t("assetInUse"));
      const [entry] = await native<GalleryEntry[]>("gallery_entries", { ids: [assetId] });
      if (!entry) throw new Error(t("missing"));
      if (isInput()) throw new Error(t("assetInUse"));
      if (!(await deleteImage(entry))) return;
      publish({
        jobs: workspace.jobs.map((entry) => (entry.id === job.id ? makeJob(entry.input) : entry)),
        results: workspace.results.filter((entry) => entry.id !== job.id),
        single: workspace.single?.id === job.id ? undefined : workspace.single,
      });
      setView((current) => (current === job.id && viewerCurrent.current === job.id ? undefined : current));
    } finally {
      update(job.id, { deleting: false });
    }
  };
  const jobDescription = (job: Job) =>
    [
      job.configuration?.modelName,
      job.configuration ? `${job.configuration.scale}×` : undefined,
      job.configuration?.noise
        ? `${t("upscaleDenoise")} · ${localize(noiseOptions.find((option) => option.id === job.configuration!.noise)!.label)}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  const statusText = (job: Job) =>
    t(job.status === "generating" ? "processing" : job.status === "failed" ? "upscaleFailed" : job.status);
  const jobFooter = (job: Job, inViewer = false, compact = false) => (
    <footer className="upscale-job-footer">
      {job.status === "generating" && <progress max={100} value={job.progress} aria-label={t("processing")} />}
      {!compact && (
        <>
          <small className="upscale-job-spec" title={job.input.asset.id}>
            {job.input.asset.width} × {job.input.asset.height}
            {job.configuration
              ? ` → ${job.input.asset.width * job.configuration.scale} × ${job.input.asset.height * job.configuration.scale}`
              : ""}
          </small>
          <span className="upscale-job-status">
            {statusText(job)}
            {job.status === "generating" ? ` · ${job.progress}%` : ""}
          </span>
        </>
      )}
      <div className="upscale-job-actions">
        {job.path && !inViewer && (
          <button onClick={() => openView(job.id)}>
            <ArrowsHorizontalIcon size={16} aria-hidden="true" />
            {t("compare")}
          </button>
        )}
        {job.path && !inViewer && (
          <button
            disabled={job.referencing || job.exporting || job.deleting}
            onClick={() => void referenceJob(job).catch(onError)}
          >
            {t("useReference")}
          </button>
        )}
        {job.assetId && (
          <span className="upscale-saved" title={t("saved")} aria-label={t("saved")}>
            <CheckIcon size={14} aria-hidden="true" />
          </span>
        )}
        {job.path && (!inViewer || job.exportError) && (
          <button
            disabled={job.exporting || job.referencing || job.deleting}
            title={job.exportError ?? t("saveAs")}
            aria-label={job.exportError ? t("retryUpscaleExport") : t("saveAs")}
            onClick={() => void exportJob(job, !!job.exportError).catch(onError)}
          >
            <DownloadSimpleIcon size={16} aria-hidden="true" />
            {job.exportError && t("retryUpscaleExport")}
          </button>
        )}
        {job.path && job.exportError && (
          <span className="upscale-save-error" title={job.exportError}>
            {t("upscaleSaveFailed")}
          </span>
        )}
        {job.path && batch && (
          <button
            disabled={busy || job.deleting}
            onClick={() => setJobs((current) => [...current, makeJob(job.input)])}
          >
            <PlusIcon size={14} aria-hidden="true" />
            {t("requeueUpscale")}
          </button>
        )}
        {!inViewer && job.status === "completed" && job.assetId && (
          <button
            disabled={job.deleting || job.exporting || job.referencing}
            title={t("deleteUpscaleResult")}
            aria-label={t("deleteUpscaleResult")}
            onClick={() => void deleteResult(job).catch(onError)}
          >
            <TrashIcon size={16} aria-hidden="true" />
          </button>
        )}
        {["queued", "generating"].includes(job.status) && (
          <button className="job-cancel" title={t("cancel")} onClick={() => void cancelUpscale(job.id).catch(onError)}>
            <StopIcon size={14} />
            {t("cancel")}
          </button>
        )}
        {(job.status === "cancelled" || job.status === "failed") && (
          <button
            disabled={busy || !model || missingDestination || job.deleting}
            title={t("retryUpscale")}
            aria-label={t("retryUpscale")}
            onClick={() => void retry(job).catch(onError)}
          >
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
          <button disabled={busy} aria-pressed={!batch} onClick={() => setBatch(false)}>
            {t("single")}
          </button>
          <button disabled={busy} aria-pressed={batch} onClick={() => setBatch(true)}>
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
          {t("upscaleScale")}
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
            {t("upscaleDenoise")}
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
          {t("upscaleTile")}
          <Select value={tile} disabled={busy} onValueChange={(nextValue) => setTile(Number(nextValue))}>
            {[32, 64, 128, 256, 512].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </label>
        <div className="button-row">
          <button disabled={busy} onClick={() => void chooseImages().then(add).catch(onError)}>
            <PlusIcon />
            {t("import")}
          </button>
          <button disabled={busy} onClick={() => setPicker(true)}>
            {t("gallery")}
          </button>
        </div>
        <div className="upscale-submit">
          {batch && (
            <div className="upscale-queue">
              <small>
                {t("pendingJobs")} · {pending}
              </small>
              {doneCount > 0 && (
                <button
                  className="queue-clear"
                  disabled={busy || jobs.some((job) => job.exporting || job.referencing || job.deleting)}
                  onClick={() =>
                    void remove(jobs.filter((job) => job.status === "completed").map((job) => job.id)).catch(onError)
                  }
                >
                  {t("clearCompleted")} · {doneCount}
                </button>
              )}
            </div>
          )}
          {!batch && single && (
            <div className="upscale-run-status" role="status">
              <div>
                <span>{statusText(single)}</span>
                {single.status === "generating" && <span>{single.progress}%</span>}
              </div>
              {["queued", "generating"].includes(single.status) && (
                <progress
                  max={100}
                  value={single.status === "generating" ? single.progress : undefined}
                  aria-label={t("processing")}
                />
              )}
              {single.error && <p className="error-text">{single.error}</p>}
            </div>
          )}
          <OutputControls kind="upscaleAuto" disabled={busy} onError={onError} />
          {busy && !batch && single && ["queued", "generating"].includes(single.status) ? (
            <button onClick={() => void cancelUpscale(single.id).catch(onError)}>
              <StopIcon aria-hidden="true" />
              {t("cancel")}
            </button>
          ) : busy ? (
            <button
              disabled={pausing}
              onClick={() => {
                setPausing(true);
                void Promise.all(
                  workspaceJobs()
                    .filter((job) => job.status === "queued")
                    .map((job) => cancelUpscale(job.id)),
                )
                  .catch(onError)
                  .finally(() => setPausing(false));
              }}
            >
              <PauseIcon />
              {settingsText("stopQueued")}
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={!model || (batch ? !pending : !input || !!single?.deleting) || missingDestination}
              onClick={() => void run().catch(onError)}
            >
              <PlayIcon weight="fill" />
              {t(batch || !single ? "startUpscale" : single.status === "completed" ? "runAgain" : "retryUpscale")}
            </button>
          )}
        </div>
      </ResizablePanel>
      <div className="upscale-results" ref={resultsContainer}>
        {batch && jobs.length ? (
          <div className="upscale-grid">
            {columns.map((column, index) => (
              <div className="upscale-column" key={index}>
                {column.map((job) => (
                  <article key={job.id}>
                    <button
                      className="upscale-remove"
                      disabled={busy || job.exporting || job.referencing || job.deleting}
                      title={t("remove")}
                      aria-label={t("remove")}
                      onClick={() => void remove([job.id]).catch(onError)}
                    >
                      <XIcon />
                    </button>
                    <button
                      className="image-button"
                      aria-label={job.path ? t("compare") : t("details")}
                      onClick={() => openView(job.id)}
                    >
                      <img
                        loading="lazy"
                        src={imageUrl(job.thumbnailPath ?? job.input.thumbnailPath)}
                        alt={job.path ? jobDescription(job) : t("upscaleOriginal")}
                        width={job.input.asset.width}
                        height={job.input.asset.height}
                        style={{ aspectRatio: `${job.input.asset.width} / ${job.input.asset.height}` }}
                      />
                    </button>
                    {job.configuration && (
                      <div className="upscale-card-description" title={jobDescription(job)}>
                        {jobDescription(job)}
                      </div>
                    )}
                    {jobFooter(job)}
                    {job.error && <p className="error-text">{job.error}</p>}
                  </article>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className={batch ? "upscale-grid" : "upscale-single"}>
            {input && !batch && (
              <article>
                <button
                  className="upscale-remove"
                  disabled={busy || !!single?.deleting}
                  title={t("remove")}
                  aria-label={t("remove")}
                  onClick={() => publish({ input: undefined, single: undefined })}
                >
                  <XIcon />
                </button>
                <PathPreview key={input.asset.id} before={input.path} beforeLabel={t("upscaleOriginal")} />
                <span className="upscale-input-label">
                  {t("upscaleOriginal")} · {input.asset.width} × {input.asset.height}
                </span>
              </article>
            )}
            {!(batch ? jobs.length : input) && (
              <div className="empty-state">
                <ArrowUpRightIcon size={40} weight="thin" />
                <p>{t("dropImages")}</p>
                <div className="button-row">
                  <button disabled={busy} onClick={() => void chooseImages().then(add).catch(onError)}>
                    {t("import")}
                  </button>
                  <button disabled={busy} onClick={() => setPicker(true)}>
                    {t("gallery")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {!batch && results.length > 0 && (
          <section className="upscale-result-tray" aria-label={t("upscaleSessionResults")}>
            <header>
              <h2>
                <span role="status">
                  {t("upscaleSessionResults")} <span className="upscale-result-count">{results.length}</span>
                </span>
              </h2>
              <button
                className="queue-clear"
                disabled={results.some((job) => job.exporting || job.referencing || job.deleting)}
                onClick={() => void remove(results.map((job) => job.id)).catch(onError)}
              >
                {t("clearUpscaleResults")}
              </button>
            </header>
            <div className="upscale-result-list" ref={resultList}>
              {results.map((job) => (
                <article key={job.id} className="upscale-result-card">
                  <button
                    className="upscale-result-preview"
                    title={jobDescription(job)}
                    aria-label={`${t("compare")} · ${jobDescription(job)}`}
                    onClick={() => openView(job.id)}
                  >
                    <img loading="lazy" src={imageUrl(job.thumbnailPath!)} alt="" width={64} height={64} />
                    <span>
                      <strong>{job.configuration?.modelName}</strong>
                      <small>
                        {job.input.asset.width * job.configuration!.scale} ×{" "}
                        {job.input.asset.height * job.configuration!.scale} · {job.configuration!.scale}×
                      </small>
                      {job.configuration?.noise && (
                        <small>
                          {t("upscaleDenoise")} ·{" "}
                          {localize(noiseOptions.find((option) => option.id === job.configuration!.noise)!.label)}
                        </small>
                      )}
                    </span>
                  </button>
                  <button
                    className="upscale-remove"
                    disabled={job.exporting || job.referencing || job.deleting}
                    aria-label={t("remove")}
                    title={t("remove")}
                    onClick={() => void remove([job.id]).catch(onError)}
                  >
                    <XIcon size={14} aria-hidden="true" />
                  </button>
                  {jobFooter(job, false, true)}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
      {picker && (
        <AssetPicker
          stagedImports={false}
          onSelect={(entries) => {
            if (add(entries)) setPicker(false);
          }}
          onClose={() => setPicker(false)}
          onError={onError}
        />
      )}
      {view && (
        <ImageViewer
          initialId={view}
          items={(batch ? jobs : results).map((job) => ({
            id: job.id,
            assetId: job.path ? job.assetId : job.input.asset.id,
            previewAssetId: job.input.asset.id,
            preview: {
              before: job.input.path,
              after: job.path,
              beforeLabel: t("upscaleOriginal"),
              afterLabel: t("upscaleProcessed"),
            },
            resolveEntry: job.assetId ? () => resolveJobEntry(job) : undefined,
            onExport: job.path ? () => exportJob(job) : undefined,
            onDelete: job.status === "completed" && job.assetId ? () => deleteResult(job) : undefined,
            onReference:
              job.status === "completed" && job.assetId
                ? async () => {
                    if (await referenceJob(job)) setView(undefined);
                  }
                : undefined,
            actionDisabled: !!(job.deleting || job.exporting || job.referencing),
            details: (
              <>
                <section className="upscale-viewer-details">
                  <h3>{job.configuration?.modelName ?? t("upscaleOriginal")}</h3>
                  <dl className="viewer-asset-metadata">
                    <div>
                      <dt>{t("upscaleOriginal")}</dt>
                      <dd>
                        {job.input.asset.width} × {job.input.asset.height} px
                      </dd>
                    </div>
                    {job.configuration && (
                      <>
                        <div>
                          <dt>{t("upscaleScale")}</dt>
                          <dd>{job.configuration.scale}×</dd>
                        </div>
                        {job.configuration.noise && (
                          <div>
                            <dt>{t("upscaleDenoise")}</dt>
                            <dd>
                              {localize(noiseOptions.find((option) => option.id === job.configuration!.noise)!.label)}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>{t("upscaleTile")}</dt>
                          <dd>{job.configuration.tileSize}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                </section>
                <section className="upscale-viewer-details">
                  {jobFooter(job, true)}
                  {job.error && <p className="error-text">{job.error}</p>}
                  {job.exportError && <p className="error-text">{job.exportError}</p>}
                </section>
              </>
            ),
          }))}
          onClose={() => setView(undefined)}
          onNavigate={(id) => {
            viewerCurrent.current = id;
            if ((batch ? jobs : results).some((job) => job.id === id)) setView(id);
          }}
          onReference={async (entry) => {
            await onReference(entry);
            setView(undefined);
          }}
          onEdit={(entry) => {
            if (onEdit(entry)) setView(undefined);
          }}
          onRestore={async (draft) => {
            if (await onRestore(draft)) setView(undefined);
          }}
          onUpscale={
            busy
              ? undefined
              : (entry) => {
                  if (workspaceJobs().some((job) => job.deleting && job.assetId === entry.asset.id)) {
                    onError(new Error(t("assetInUse")));
                    return;
                  }
                  publish({ input: entry, single: undefined, batch: false });
                  setView(undefined);
                }
          }
        />
      )}
    </div>
  );
}
