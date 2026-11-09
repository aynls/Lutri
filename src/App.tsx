import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyAppearance } from "./appearance";
import { createPortal } from "react-dom";
import {
  ApertureIcon,
  ArrowUpRightIcon,
  ClockCounterClockwiseIcon,
  CaretRightIcon,
  GearSixIcon,
  ImagesIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { initializeDesktop } from "./services/desktop";
import { useLocale } from "./i18n";
import { AssetPicker } from "./gallery/AssetPicker";
import { ResizablePanel } from "./components/ResizablePanel";
import { BrandMark } from "./components/ModelIcon";
import { OutputControls } from "./components/OutputControls";
import { ModelSelector } from "./create/components/ModelSelector";
import { CreationControl } from "./create/components/CreationControl";
import { editTargetId } from "./models/creation";
import type { ModelCombination } from "./models/types";
import type { CreationMode, GalleryEntry, GenerationDraft } from "./domain/types";
import { missingPromptReferences } from "./domain/references";
import { t } from "./i18n";
import { validateDraft } from "./models/validateDraft";
import { combinationById } from "./models";
import { initialDraft, maxRequestCount } from "./models/shared";
import { useApplication, loadApplication, saveDraft, removeFeed, getState, refreshGallery } from "./services/store";
import { assetExists, imageUrl as assetImageUrl, importAsset, native } from "./services/native";
import { ImageViewer } from "./gallery/ImageViewer";
import { AssetImage } from "./gallery/AssetImage";
import { cancelBatchQueued, resumeTasks, submitBatch } from "./services/generation";
import { Feed } from "./create/Feed";
import { PromptField } from "./create/components/PromptField";
import { References, type ReferenceSource } from "./create/components/References";
import { c } from "./create/messages";
import { InputPreparation } from "./create/components/InputPreparation";
import { Dialog } from "./components/Dialog";
import { chooseImages, deleteImage } from "./gallery/actions";
import { RequestPreview } from "./create/components/RequestPreview";
import { BatchDraft } from "./batch/BatchDraft";
import { BatchHistory } from "./batch/BatchHistory";
import { b } from "./batch/messages";
import {
  batchCombinations,
  batchForm,
  batchRequestLimit,
  transferDraft,
  validateBatchDraft,
} from "./batch/capabilities";
import { addBatchItem, appendBatchDrafts, cancelBatchEdit, switchCreationMode } from "./batch/draft";
import { SavedStyles } from "./create/components/SavedStyles";
import { Regions } from "./create/components/Regions";
import { Gallery } from "./gallery/Gallery";
import { History } from "./history/History";
import { Settings } from "./settings/Settings";
import { Writers } from "./writers/Writers";
import { Upscale } from "./upscale/Upscale";
import { MaskEditor } from "./create/components/MaskEditor";
import { importFiles, importPaths, isImagePath } from "./gallery/imports";
import "./themes.css";
import "./App.css";
import "./components/studio.css";
import "./gallery/gallery.css";
import "./history/history.css";
import "./upscale/upscale.css";
import "./create/editor.css";
import "./create/sidebar.css";
import "./typography.css";
import "./batch/batch.css";

type Page = "creation" | "upscale" | "gallery" | "history" | "settings";
const navigation = [
  { id: "creation", icon: ApertureIcon },
  { id: "upscale", icon: ArrowUpRightIcon },
  { id: "gallery", icon: ImagesIcon },
  { id: "history", icon: ClockCounterClockwiseIcon },
] as const;
let started = false;

function hasDraftEdits(draft: GenerationDraft) {
  const defaults = initialDraft(combinationById(draft.combinationId));
  return Boolean(
    draft.prompt ||
    draft.references.length ||
    draft.regions.length ||
    draft.mask ||
    draft.requestCount !== defaults.requestCount ||
    draft.creationMode !== defaults.creationMode ||
    draft.editTargetId ||
    draft.inputPreparation?.maxEdge !== undefined ||
    draft.layerOutputDirectory ||
    draft.outputDirectory ||
    draft.saveToGallery !== undefined ||
    Object.keys({ ...defaults.parameters, ...draft.parameters }).some(
      (key) => JSON.stringify(draft.parameters[key]) !== JSON.stringify(defaults.parameters[key]),
    ),
  );
}

export default function App() {
  useLocale();
  const state = useApplication();
  const isBatch = state.creation.mode === "batch";
  const [modeBusy, setModeBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [taskTab, setTaskTab] = useState<CreationMode>("regular");
  const [viewer, setViewer] = useState<{ assetId: string; ids: string[] }>();
  const [page, setPage] = useState<Page>("creation"),
    [error, setError] = useState(""),
    [picker, setPicker] = useState(false),
    [search, setSearch] = useState({ regular: "", batch: "", request: 0 }),
    [writers, setWriters] = useState(false),
    [maskEditor, setMaskEditor] = useState(false);
  const [upscaleInput, setUpscaleInput] = useState<{ entries: GalleryEntry[]; nonce: string }>();
  const [credential, setCredential] = useState<boolean | undefined>(),
    [sent, setSent] = useState(false);
  const [urlImport, setUrlImport] = useState(false),
    [imageUrl, setImageUrl] = useState(""),
    [importBusy, setImportBusy] = useState(false);
  const [editing, setEditing] = useState<GalleryEntry>(),
    [keepReferences, setKeepReferences] = useState(false);
  const creationScroll = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const [parameterReset, setParameterReset] = useState(0);
  const [dragging, setDragging] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const drafts = useRef(new Map<string, GenerationDraft>());
  const onError = useCallback((value: unknown) => setError(String(value)), []);
  const changeDraft = (draft: GenerationDraft) => void saveDraft(draft).catch(onError);
  const changeMode = async (mode: CreationMode) => {
    if (modeBusy || batchBusy) return;
    setModeBusy(true);
    try {
      await switchCreationMode(mode);
    } finally {
      setModeBusy(false);
    }
  };
  const clearDraft = async () => {
    if (!state.ready || modeBusy || batchBusy || submitting) return;
    setModeBusy(true);
    try {
      if (
        !(await confirm(c("clearDraftConfirm"), {
          title: c("clearDraft"),
          kind: "warning",
          okLabel: c("clearDraft"),
          cancelLabel: t("cancel"),
        }))
      )
        return;
      await saveDraft(initialDraft(combinationById(getState().draft.combinationId)));
      drafts.current.clear();
      setParameterReset((value) => value + 1);
      setSent(false);
    } finally {
      setModeBusy(false);
    }
  };
  const relatedHistory = (id: string) => {
    const task = getState().tasks.find((task) => task.results.some((result) => result.assetId === id));
    const tab = task?.cloudGroupId ? "batch" : "regular";
    setTaskTab(tab);
    setSearch((current) => ({ regular: id, batch: id, request: current.request + 1 }));
    setPage("history");
  };
  useEffect(() => {
    if (!started) {
      started = true;
      void loadApplication()
        .then(() => {
          return resumeTasks();
        })
        .then(() => initializeDesktop(onError))
        .catch(onError);
    }
  }, [onError]);
  useLayoutEffect(
    () => applyAppearance(state.preferences.palette, state.preferences.accent, state.preferences.fontScale),
    [state.preferences.palette, state.preferences.accent, state.preferences.fontScale],
  );
  useEffect(() => {
    let disposed = false;
    setCredential(undefined);
    const provider = combinationById(state.draft.combinationId).provider;
    void native<boolean>("credential_present", { provider })
      .then((value) => {
        if (!disposed) setCredential(value);
      })
      .catch(onError);
    return () => {
      disposed = true;
    };
  }, [state.draft.combinationId, state.preferences.providers, page, onError]);
  useEffect(() => {
    if (page !== "creation") return;
    requestAnimationFrame(() => {
      if (creationScroll.current)
        creationScroll.current.scrollTop = scrollPositions.current.get(getState().draft.combinationId) ?? 0;
    });
  }, [page]);
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), 1400);
    return () => window.clearTimeout(timer);
  }, [sent]);
  const appendReferences = useCallback(async (entries: GalleryEntry[]) => {
    if (!entries.length) return;
    const draft = getState().draft;
    const limit = combinationById(draft.combinationId).maxReferences;
    if (!limit) throw new Error(c("unsupportedImages"));
    if (draft.references.length + entries.length > limit) throw new Error(c("tooMany"));
    await saveDraft({
      ...draft,
      references: [
        ...draft.references,
        ...entries.map((entry) => ({
          id: crypto.randomUUID(),
          assetId: entry.asset.id,
          name: t("referenceAlias"),
          purpose: "reference" as const,
        })),
      ],
    });
  }, []);
  const receiveImages = useCallback(
    async (entries: GalleryEntry[]) => {
      if (!entries.length) return;
      if (writers || page === "creation") await appendReferences(entries);
      else if (page === "upscale") setUpscaleInput({ entries, nonce: crypto.randomUUID() });
    },
    [page, writers, appendReferences],
  );
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if ((!writers && !["creation", "upscale", "gallery"].includes(page)) || document.querySelector("dialog[open]"))
        return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (!files.length) return;
      event.preventDefault();
      void importFiles(files, writers || page === "creation")
        .then(receiveImages)
        .catch(onError);
    };
    document.addEventListener("paste", paste, true);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if ((!writers && !["creation", "upscale", "gallery"].includes(page)) || document.querySelector("dialog[open]"))
          return;
        const payload = event.payload;
        if (payload.type === "enter") setDragging(payload.paths.some(isImagePath));
        if (payload.type === "leave") setDragging(false);
        if (payload.type === "drop") {
          setDragging(false);
          void importPaths(payload.paths, writers || page === "creation")
            .then(receiveImages)
            .catch(onError);
        }
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(onError);
    return () => {
      disposed = true;
      unlisten?.();
      document.removeEventListener("paste", paste, true);
    };
  }, [page, writers, receiveImages, onError]);
  useEffect(() => {
    const refresh = () => {
      if (getState().ready) void refreshGallery().catch(onError);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [onError]);
  const view = (assetId: string, ids: string[] = [assetId]) => {
    setViewer({ assetId, ids });
  };
  const addReferences = async (entries: GalleryEntry[]) => {
    if (!entries.length) return;
    await appendReferences(entries);
    setPicker(false);
    setPage("creation");
  };
  const addReference = (entry: GalleryEntry) => void addReferences([entry]).catch(onError);
  const useImageAsReference = async (entry: GalleryEntry) => {
    await appendReferences([entry]);
    if (!writers) setPage("creation");
    setViewer(undefined);
  };
  const acceptWriterPrompt = async (snapshot: GenerationDraft) => {
    const approved = new Map<string, string>();
    for (;;) {
      const current = getState().draft;
      const references = new Map(current.references.map((reference) => [reference.id, reference]));
      for (const reference of snapshot.references) {
        const existing = references.get(reference.id);
        if (existing && existing.assetId !== reference.assetId) throw new Error(c("writerReferenceConflict"));
      }
      const missing = snapshot.references.filter((reference) => !references.has(reference.id));
      if (missing.some((reference) => approved.get(reference.id) !== reference.assetId)) {
        if (
          !(await confirm(c("restoreWriterReferencesConfirm"), {
            title: c("restoreWriterReferences"),
            kind: "warning",
            okLabel: c("restoreAndUse"),
            cancelLabel: t("cancel"),
          }))
        )
          return;
        for (const reference of missing) approved.set(reference.id, reference.assetId);
        continue;
      }
      const limit = combinationById(current.combinationId).maxReferences;
      if ((current.references.length || missing.length) && !limit) throw new Error(c("unsupportedImages"));
      if (current.references.length + missing.length > limit) throw new Error(c("tooMany"));
      const candidate = { ...current, prompt: snapshot.prompt, references: [...current.references, ...missing] };
      if (missingPromptReferences(candidate).length) throw new Error(c("writerTokenMissing"));
      if (missing.length) {
        const exists = await Promise.all(missing.map((reference) => assetExists(reference.assetId)));
        if (getState().draft !== current) continue;
        if (exists.some((available) => !available)) throw new Error(c("writerReferenceMissing"));
      }
      await saveDraft(candidate);
      setWriters(false);
      return;
    }
  };
  const switchModel = async (next: ModelCombination) => {
    const current = getState().draft;
    if (isBatch) {
      drafts.current.set(current.combinationId, structuredClone(current));
      const target = transferDraft(current, next, drafts.current.get(next.id));
      await saveDraft(target);
      return;
    }
    if (
      ((current.mask && !next.mask) || (current.regions.length && !next.regions)) &&
      !(await confirm(c("switchWarning"), { title: "Lutri", kind: "warning" }))
    )
      return;
    scrollPositions.current.set(current.combinationId, creationScroll.current?.scrollTop ?? 0);
    drafts.current.set(current.combinationId, structuredClone(current));
    const previous = drafts.current.get(next.id) ?? initialDraft(next);
    changeDraft({
      ...previous,
      prompt: current.prompt,
      references: current.references,
      requestCount: current.requestCount,
      inputPreparation: current.inputPreparation,
      regions: next.regions
        ? previous.regions.filter(
            (region) => !region.referenceId || current.references.some((ref) => ref.id === region.referenceId),
          )
        : [],
      mask: next.mask ? current.mask : undefined,
    });
    requestAnimationFrame(() => {
      if (creationScroll.current) creationScroll.current.scrollTop = scrollPositions.current.get(next.id) ?? 0;
    });
  };
  const addSource = async (source: ReferenceSource) => {
    if (source === "library") {
      setPicker(true);
      return;
    }
    if (source === "url") {
      setUrlImport(true);
      return;
    }
    if (source === "files") {
      await addReferences(await chooseImages(true));
      return;
    }
    const entry = await native<GalleryEntry>("asset_paste", { staged: true });
    await refreshGallery();
    await addReferences([entry]);
  };
  const applyEdit = (entry: GalleryEntry, keep: boolean) => {
    const current = getState().draft,
      target = combinationById(current.combinationId);
    if (!target.maxReferences) {
      onError(c("unsupportedImages"));
      return;
    }
    const reference = current.references.find((ref) => ref.assetId === entry.asset.id) ?? {
      id: crypto.randomUUID(),
      assetId: entry.asset.id,
      name: t("referenceAlias"),
      purpose: "reference" as const,
    };
    const references = [reference, ...(keep ? current.references.filter((ref) => ref.id !== reference.id) : [])];
    if (references.length > target.maxReferences) {
      onError(c("tooMany"));
      return;
    }
    const retained = new Set(references.map((ref) => ref.id));
    const mask = current.mask?.referenceId === reference.id ? current.mask : undefined;
    changeDraft({
      ...current,
      ...(target.creationControl ? { creationMode: "edit" as const, editTargetId: reference.id } : {}),
      references,
      mask,
      regions: current.regions.filter((region) => !region.referenceId || retained.has(region.referenceId)),
    });
    if (current.mask && !mask) void message(c("maskRemoved"), { title: "Lutri", kind: "warning" });
    setEditing(undefined);
    setPage("creation");
  };
  const editImage = (entry: GalleryEntry) => {
    if (!combinationById(getState().draft.combinationId).maxReferences) {
      onError(c("unsupportedImages"));
      return;
    }
    if (getState().draft.references.length) {
      setKeepReferences(false);
      setEditing(entry);
    } else applyEdit(entry, false);
  };
  const restore = async (draft: GenerationDraft, mode: CreationMode = "regular") => {
    const { draft: current, creation } = getState();
    if (creation.editing) {
      onError(b("pendingEdit"));
      return;
    }
    const replaced = creation.mode === mode ? current : creation[mode];
    if (
      replaced &&
      hasDraftEdits(replaced) &&
      !(await confirm(b("replaceEditor"), { title: "Lutri", kind: "warning" }))
    )
      return;
    await switchCreationMode(mode);
    const availability = await Promise.all(
      draft.references.map(async (ref) => ({ id: ref.id, exists: await assetExists(ref.assetId) })),
    );
    const missing = new Set(availability.filter((entry) => !entry.exists).map((entry) => entry.id));
    const maskMissing = draft.mask && !(await assetExists(draft.mask.assetId));
    changeDraft({
      ...structuredClone(draft),
      regions: draft.regions.filter((region) => !region.referenceId || !missing.has(region.referenceId)),
      mask: draft.mask && (missing.has(draft.mask.referenceId) || maskMissing) ? undefined : draft.mask,
    });
    setPage("creation");
    if (missing.size || maskMissing) await message(t("missing"), { title: "Lutri", kind: "warning" });
  };
  const submit = async () => {
    if (submittingRef.current || !canSubmit) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const invalid = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(".creation-panel :invalid");
      if (invalid) {
        for (let parent = invalid.parentElement; parent; parent = parent.parentElement)
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        invalid.focus();
        invalid.reportValidity();
        return;
      }
      const submittedDraft = getState().draft;
      if (isBatch) {
        await addBatchItem();
        setSent(true);
        return;
      }
      if (validateDraft(submittedDraft, maxRequestCount(getState().preferences)).length) return;
      const missing = await Promise.all(
        submittedDraft.references.map(async (ref) => ({ ref, exists: await assetExists(ref.assetId) })),
      );
      const ids = new Set(missing.filter((entry) => !entry.exists).map((entry) => entry.ref.id));
      const maskMissing = submittedDraft.mask && !(await assetExists(submittedDraft.mask.assetId));
      if (
        (ids.size || maskMissing || missingPromptReferences(submittedDraft).length) &&
        !(await confirm(t("missingWarning"), { title: "Lutri", kind: "warning" }))
      )
        return;
      const draft = {
        ...submittedDraft,
        references: submittedDraft.references.filter((ref) => !ids.has(ref.id)),
        regions: submittedDraft.regions.filter((region) => !region.referenceId || !ids.has(region.referenceId)),
        mask:
          submittedDraft.mask && (ids.has(submittedDraft.mask.referenceId) || maskMissing)
            ? undefined
            : submittedDraft.mask,
      };
      if (ids.size || maskMissing) await saveDraft({ ...draft, references: submittedDraft.references });
      await submitBatch({ ...draft, references: submittedDraft.references });
      setSent(true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const originalCombination = combinationById(state.draft.combinationId);
  const combination = isBatch ? batchForm(originalCombination) : originalCombination,
    Form = combination.Form;
  const maskEntry = state.draft.mask
    ? state.masks.find((entry) => entry.asset.id === state.draft.mask?.assetId)
    : undefined;
  const maskReference = state.draft.references.find((reference) => reference.id === state.draft.mask?.referenceId);
  const maskReferenceEntry = maskReference
    ? state.gallery.find((entry) => entry.asset.id === maskReference.assetId)
    : undefined;
  const validation = isBatch
    ? validateBatchDraft(state.draft, false)
    : validateDraft(state.draft, maxRequestCount(state.preferences));
  if (!isBatch && state.preferences.outputs?.generationAuto && !state.preferences.outputs.directory?.trim())
    validation.push(t("saveDirectoryRequired"));
  const configuration = state.preferences.providers[combination.provider];
  const configured =
    credential &&
    (combination.provider !== "azure" || !!(configuration?.endpoint?.trim() && configuration?.deployment?.trim()));
  const promptEmpty =
    !state.draft.prompt.trim() &&
    !state.draft.parameters.layer_decomposition &&
    !state.draft.parameters.structured_prompt;
  const canSubmit =
    state.ready &&
    !submitting &&
    !batchBusy &&
    !modeBusy &&
    (isBatch || !!configured) &&
    !validation.length &&
    !promptEmpty;
  const queuedBatches = state.batches.filter(
    (batch) => !batch.cloud && state.tasks.some((task) => task.batchId === batch.id && task.status === "queued"),
  );
  const focusIssue = (issue: string) => {
    const field = Array.from(document.querySelectorAll<HTMLElement>(".creation-panel [data-field]")).find(
      (field) =>
        issue.toLowerCase().includes(field.dataset.field!.toLowerCase()) ||
        issue.includes(field.querySelector("label")?.textContent ?? "\0"),
    );
    if (!field) return;
    for (let parent = field.parentElement; parent; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    field.scrollIntoView({ block: "center", behavior: "instant" });
    field.querySelector<HTMLElement>('input:not([type="hidden"]), .select-trigger, textarea, button')?.focus();
  };
  return (
    <div className="app-shell">
      <nav className="navigation">
        <div className="brand">
          <BrandMark />
          <span>Lutri</span>
        </div>
        <div className="navigation-pages">
          {navigation.map(({ id, icon: Icon }) => (
            <button title={t(id)} key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
              <Icon size={20} />
            </button>
          ))}
        </div>
        <button
          title={t("settings")}
          className={page === "settings" ? "active" : ""}
          onClick={() => setPage("settings")}
        >
          <GearSixIcon size={20} />
        </button>
      </nav>
      <main className="workspace">
        <header className="workspace-header">
          <h1>{t(page)}</h1>
          {page === "creation" ? (
            <div className="button-row">
              <button
                disabled={!state.ready || modeBusy || batchBusy || submitting || !hasDraftEdits(state.draft)}
                onClick={() => void clearDraft().catch(onError)}
              >
                {c("clearDraft")}
              </button>
              {!isBatch && (
                <>
                  {!!queuedBatches.length && (
                    <button
                      onClick={() =>
                        void Promise.all(queuedBatches.map((batch) => cancelBatchQueued(batch.id))).catch(onError)
                      }
                    >
                      {c("stopQueued")} ·{" "}
                      {state.tasks.filter((task) => !task.cloudGroupId && task.status === "queued").length}
                    </button>
                  )}
                  <button
                    disabled={!state.feed.length}
                    onClick={() =>
                      void (async () => {
                        if (await confirm(c("clearConfirm"), { title: "Lutri", kind: "warning" }))
                          await removeFeed(state.feed.map((slot) => slot.id));
                      })().catch(onError)
                    }
                  >
                    {t("clear")}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </header>
        <div className={page === "creation" ? "creation-host" : "creation-host workspace-hidden"}>
          <div
            className="creation-workspace"
            onKeyDown={(event) => {
              if (document.querySelector("dialog[open]")) return;
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSubmit) void submit().catch(onError);
              }
            }}
          >
            <ResizablePanel className="creation-panel" storageKey="lutri.creation.panel">
              <div
                className="creation-scroll"
                ref={creationScroll}
                onScroll={(event) =>
                  scrollPositions.current.set(state.draft.combinationId, event.currentTarget.scrollTop)
                }
              >
                <div className="segmented-control" role="group" aria-label={t("creation")}>
                  {(["regular", "batch"] as const).map((mode) => (
                    <button
                      key={mode}
                      aria-pressed={state.creation.mode === mode}
                      disabled={modeBusy || batchBusy || submitting}
                      onClick={() => void changeMode(mode).catch(onError)}
                    >
                      {b(mode)}
                    </button>
                  ))}
                </div>
                <ModelSelector
                  key={state.creation.mode}
                  available={isBatch ? batchCombinations : undefined}
                  value={combination}
                  onChange={(next) => void switchModel(next).catch(onError)}
                />
                <div className="creation-credential" role="status">
                  <span className={credential === false ? "error-text" : "muted"}>
                    {credential === undefined
                      ? "…"
                      : c(configured ? "configured" : credential ? "needsConfiguration" : "needsKey")}
                  </span>
                  <button
                    onClick={() => {
                      sessionStorage.setItem("lutri.settings.provider", combination.provider);
                      setPage("settings");
                    }}
                  >
                    {c("configure")}
                  </button>
                </div>
                <CreationControl combination={combination} draft={state.draft} onChange={changeDraft} />
                {isBatch && state.draft.mask && !combination.mask && (
                  <div className="batch-item-errors">
                    <p>{t("unsupportedMask")}</p>
                    <button onClick={() => changeDraft({ ...state.draft, mask: undefined })}>
                      {t("remove")} · {t("mask")}
                    </button>
                  </div>
                )}
                {isBatch && !!state.draft.regions.length && !combination.regions && (
                  <div className="batch-item-errors">
                    <p>{t("unsupportedRegions")}</p>
                    <button onClick={() => changeDraft({ ...state.draft, regions: [] })}>
                      {t("remove")} · {t("regions")}
                    </button>
                  </div>
                )}
                <PromptField
                  draft={state.draft}
                  onChange={changeDraft}
                  onWriters={() => setWriters(true)}
                  limit={combination.promptLimit}
                  regions={!!combination.regions}
                />
                {!!combination.maxReferences && (
                  <References
                    draft={state.draft}
                    gallery={state.gallery}
                    onChange={changeDraft}
                    onAdd={(source) => void addSource(source).catch(onError)}
                    onView={view}
                    limit={combination.maxReferences}
                    primary={!combination.creationControl && combination.primaryReference}
                    targetId={editTargetId(state.draft, combination)}
                    stableTarget={!!combination.creationControl && state.draft.creationMode === "edit"}
                    onNotice={(notice) => void message(notice, { title: "Lutri", kind: "warning" })}
                  />
                )}
                {combination.mask &&
                state.draft.references.length &&
                (state.draft.mask || editTargetId(state.draft, combination)) ? (
                  state.draft.mask ? (
                    <div className="reference-item mask-input">
                      <button
                        className="image-button reference-preview mask-preview"
                        aria-label={c("editMask")}
                        title={c("editMask")}
                        onClick={() => setMaskEditor(true)}
                      >
                        {maskEntry && maskReferenceEntry ? (
                          <>
                            <AssetImage key={maskReferenceEntry.asset.id} entry={maskReferenceEntry} thumbnail />
                            <span
                              className="mask-preview-overlay"
                              aria-hidden="true"
                              style={{ maskImage: `url(${JSON.stringify(assetImageUrl(maskEntry.thumbnailPath))})` }}
                            />
                          </>
                        ) : (
                          <span className="missing-image">{t("missing")}</span>
                        )}
                      </button>
                      <div className="reference-information">
                        <div className="reference-name">{t("mask")}</div>
                        <small className="reference-dims">{maskReference?.name ?? t("missing")}</small>
                        <div className="reference-actions">
                          <button title={c("editMask")} aria-label={c("editMask")} onClick={() => setMaskEditor(true)}>
                            <PencilSimpleIcon />
                          </button>
                          <button
                            title={t("remove")}
                            aria-label={t("remove")}
                            onClick={() => changeDraft({ ...state.draft, mask: undefined })}
                          >
                            <XIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button className="reference-add mask-input" onClick={() => setMaskEditor(true)}>
                      <PlusIcon size={18} />
                      <span>{c("addMask")}</span>
                    </button>
                  )
                ) : null}
                {combination.regions ? <Regions draft={state.draft} onChange={changeDraft} /> : null}
                <section className="creation-parameters">
                  <div className="section-heading">
                    <span>{t("parameters")}</span>
                    <button
                      onClick={() => {
                        setParameterReset((value) => value + 1);
                        changeDraft({
                          ...state.draft,
                          parameters: initialDraft(combination).parameters,
                          requestCount: 1,
                        });
                      }}
                    >
                      {t("reset")}
                    </button>
                  </div>
                  <Form
                    key={`${state.creation.mode}:${state.creation.editing?.id ?? "new"}:${parameterReset}`}
                    combination={combination}
                    draft={state.draft}
                    onChange={changeDraft}
                    styleControl={<SavedStyles combination={combination} draft={state.draft} onChange={changeDraft} />}
                  />
                  {!!combination.maxReferences && <InputPreparation draft={state.draft} onChange={changeDraft} />}
                  <RequestPreview
                    combination={combination}
                    batch={isBatch}
                    draft={state.draft}
                    configuration={state.preferences.providers[combination.provider] ?? {}}
                  />
                </section>
              </div>
              <div className="submit-panel">
                {!!validation.length && (
                  <details className="validation-notice">
                    <summary>
                      <CaretRightIcon size={16} aria-hidden="true" />
                      {t("validateParameters")} · {validation.length}
                    </summary>
                    <ul>
                      {validation.map((issue, index) => (
                        <li key={index}>
                          <button onClick={() => focusIssue(issue)}>{issue}</button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {!isBatch && <OutputControls kind="generationAuto" disabled={submitting} onError={onError} />}
                <div className="generate-submit-row">
                  <input
                    type="number"
                    aria-label={t("requestCount")}
                    title={t("requestCount")}
                    min={1}
                    max={isBatch ? batchRequestLimit : maxRequestCount(state.preferences)}
                    value={state.draft.requestCount}
                    onChange={(e) => changeDraft({ ...state.draft, requestCount: Number(e.target.value) })}
                  />
                  <button className="primary-button" disabled={!canSubmit} onClick={() => void submit().catch(onError)}>
                    <span className="generate-button-label">
                      <SparkleIcon weight="fill" />
                      <span>
                        {submitting
                          ? t("submitting")
                          : isBatch
                            ? state.creation.editing
                              ? b("save")
                              : b("add")
                            : `${sent ? c("sent") : t("generate")}${
                                state.draft.requestCount * combination.outputCount(state.draft.parameters) > 1
                                  ? ` · ${state.draft.requestCount * combination.outputCount(state.draft.parameters)} ${t("imageCount")}`
                                  : ""
                              }`}
                      </span>
                    </span>
                    <kbd>Ctrl ↵</kbd>
                  </button>
                </div>
                {isBatch && state.creation.editing && (
                  <button
                    className="batch-edit-cancel"
                    disabled={submitting || batchBusy}
                    onClick={() => void cancelBatchEdit()?.catch(onError)}
                  >
                    {t("cancel")}
                  </button>
                )}
              </div>
            </ResizablePanel>
            {isBatch ? (
              <BatchDraft
                onError={onError}
                onBusy={setBatchBusy}
                onTasks={() => {
                  setTaskTab("batch");
                  setPage("history");
                }}
              />
            ) : (
              <Feed
                onView={view}
                onReference={addReference}
                onEdit={editImage}
                onRestore={(draft) => void restore(draft).catch(onError)}
                onRelated={relatedHistory}
                onError={onError}
              />
            )}
          </div>
        </div>
        {page === "gallery" ? (
          <Gallery
            onView={view}
            onUpscale={(entry) => {
              setUpscaleInput({ entries: [entry], nonce: crypto.randomUUID() });
              setPage("upscale");
            }}
            onReference={addReference}
            onEdit={editImage}
            onRelated={relatedHistory}
            onError={onError}
          />
        ) : null}
        <div className="tasks-host" hidden={page !== "history"}>
          <div className="task-tabs">
            <div className="segmented-control" aria-label={t("history")}>
              {(["regular", "batch"] as const).map((tab) => (
                <button key={tab} aria-pressed={taskTab === tab} onClick={() => setTaskTab(tab)}>
                  {b(tab)}
                </button>
              ))}
            </div>
          </div>
          <div className="task-view" hidden={taskTab !== "regular"}>
            <History
              initialSearch={search.regular}
              searchRequest={search.request}
              onError={onError}
              onRestore={(draft) => void restore(draft).catch(onError)}
              onView={view}
            />
          </div>
          <div className="task-view" hidden={taskTab !== "batch"}>
            <BatchHistory
              initialSearch={search.batch}
              searchRequest={search.request}
              onError={onError}
              onView={view}
              onRestore={(draft) => void restore(draft, "batch").catch(onError)}
              onRequeue={(drafts) => {
                void appendBatchDrafts(drafts)
                  .then(() => setPage("creation"))
                  .catch(onError);
              }}
            />
          </div>
        </div>
        {page === "settings" ? <Settings onError={onError} /> : null}
        <div className="upscale-host" hidden={page !== "upscale"}>
          <Upscale onError={onError} incoming={upscaleInput} onReference={useImageAsReference} />
        </div>
      </main>
      {error
        ? createPortal(
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button aria-label={t("close")} onClick={() => setError("")}>
                <XIcon />
              </button>
            </div>,
            Array.from(document.querySelectorAll("dialog[open]")).slice(-1)[0] ?? document.body,
          )
        : null}
      {picker && (
        <AssetPicker
          stagedImports
          onSelect={(entries) => void addReferences(entries).catch(onError)}
          onClose={() => setPicker(false)}
          onError={onError}
          limit={Math.max(0, combination.maxReferences - state.draft.references.length)}
        />
      )}
      {urlImport && (
        <Dialog
          title={c("url")}
          className="compact-dialog"
          onClose={() => setUrlImport(false)}
          footer={
            <>
              <button disabled={importBusy} onClick={() => setUrlImport(false)}>
                {t("cancel")}
              </button>
              <button
                className="primary-button"
                disabled={importBusy || !/^https?:\/\//i.test(imageUrl)}
                onClick={() => {
                  setImportBusy(true);
                  void importAsset({ url: imageUrl }, true)
                    .then(async (entry) => {
                      await refreshGallery();
                      await addReferences([entry]);
                      setImageUrl("");
                      setUrlImport(false);
                    })
                    .catch(onError)
                    .finally(() => setImportBusy(false));
                }}
              >
                {t("import")}
              </button>
            </>
          }
        >
          <input
            autoFocus
            type="url"
            aria-label={c("url")}
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
          />
        </Dialog>
      )}
      {editing && (
        <Dialog
          title={c("edit")}
          className="compact-dialog"
          onClose={() => setEditing(undefined)}
          footer={
            <>
              <button onClick={() => setEditing(undefined)}>{t("cancel")}</button>
              <button className="primary-button" onClick={() => applyEdit(editing, keepReferences)}>
                {c("edit")}
              </button>
            </>
          }
        >
          <label className="spec-option">
            <input
              type="checkbox"
              checked={keepReferences}
              onChange={(event) => setKeepReferences(event.target.checked)}
            />
            {c("keepReferences")}
          </label>
        </Dialog>
      )}
      {dragging && (
        <div className="file-drop-overlay">
          <ImagesIcon size={40} />
          <strong>{t("dropImages")}</strong>
        </div>
      )}
      {maskEditor ? (
        <MaskEditor
          draft={state.draft}
          gallery={state.gallery}
          masks={state.masks}
          onChange={changeDraft}
          onClose={() => setMaskEditor(false)}
          onError={onError}
        />
      ) : null}
      <div hidden={!writers}>
        <Writers
          draft={state.draft}
          onChange={changeDraft}
          onAddReferences={appendReferences}
          onView={view}
          onAccept={acceptWriterPrompt}
          onClose={() => setWriters(false)}
          active={writers}
          onSettings={() => {
            sessionStorage.setItem("lutri.settings.category", "llm");
            setWriters(false);
            setPage("settings");
          }}
          onError={onError}
        />
      </div>
      {viewer && (
        <ImageViewer
          key={viewer.assetId}
          initialId={viewer.assetId}
          items={Array.from(new Set(viewer.ids.includes(viewer.assetId) ? viewer.ids : [viewer.assetId])).map((id) => ({
            id,
            assetId: id,
          }))}
          onClose={() => setViewer(undefined)}
          onReference={useImageAsReference}
          onDelete={
            page === "gallery"
              ? async (entry) => {
                  if (await deleteImage(entry)) setViewer(undefined);
                }
              : undefined
          }
          onUpscale={(entry) => {
            setWriters(false);
            setUpscaleInput({ entries: [entry], nonce: crypto.randomUUID() });
            setPage("upscale");
            setViewer(undefined);
          }}
        />
      )}
    </div>
  );
}
