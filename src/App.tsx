import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApertureIcon,
  ArrowUpRightIcon,
  ClockCounterClockwiseIcon,
  GearSixIcon,
  ImagesIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { initializeDesktop } from "./services/desktop";
import { useLocale } from "./i18n";
import { AssetPicker } from "./gallery/AssetPicker";
import { ResizablePanel } from "./components/ResizablePanel";
import { BrandMark } from "./components/ModelIcon";
import { ModelSelector } from "./create/components/ModelSelector";
import type { ModelCombination } from "./models/types";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { GalleryEntry, GenerationDraft } from "./domain/types";
import { missingPromptReferences } from "./domain/references";
import { t } from "./i18n";
import { validateDraft } from "./models/validateDraft";
import { combinationById } from "./models";
import { initialDraft } from "./models/shared";
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
import { chooseImages } from "./gallery/actions";
import { takeViewerContext } from "./gallery/viewContext";
import { RequestPreview } from "./create/components/RequestPreview";
import { SavedStyles } from "./create/components/SavedStyles";
import { Regions } from "./create/components/Regions";
import { Gallery } from "./gallery/Gallery";
import { History } from "./history/History";
import { Settings } from "./settings/Settings";
import { Writers } from "./writers/Writers";
import { Upscale } from "./upscale/Upscale";
import { MaskEditor } from "./create/components/MaskEditor";
import { importFiles, importPaths, isImagePath } from "./gallery/imports";
import "./App.css";
import "./components/studio.css";
import "./gallery/gallery.css";
import "./history/history.css";
import "./upscale/upscale.css";
import "./create/editor.css";
import "./create/sidebar.css";
import "./typography.css";

type Page = "creation" | "upscale" | "gallery" | "history" | "settings";
const navigation = [
  { id: "creation", icon: ApertureIcon },
  { id: "upscale", icon: ArrowUpRightIcon },
  { id: "gallery", icon: ImagesIcon },
  { id: "history", icon: ClockCounterClockwiseIcon },
] as const;
let started = false;

export default function App() {
  useLocale();
  const state = useApplication();
  const [page, setPage] = useState<Page>("creation"),
    [error, setError] = useState(""),
    [picker, setPicker] = useState(false),
    [search, setSearch] = useState(""),
    [writers, setWriters] = useState(false),
    [maskEditor, setMaskEditor] = useState(false);
  const [writerImages, setWriterImages] = useState<{ entries: GalleryEntry[]; nonce: string }>();
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
  const [dragging, setDragging] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const drafts = useRef(new Map<string, GenerationDraft>());
  const onError = useCallback((value: unknown) => setError(String(value)), []);
  const changeDraft = (draft: GenerationDraft) => void saveDraft(draft).catch(onError);
  useEffect(() => {
    if (!started) {
      started = true;
      void loadApplication()
        .then(() => {
          if (!new URLSearchParams(location.search).has("asset")) return resumeTasks();
        })
        .then(() => initializeDesktop(onError))
        .catch(onError);
    }
  }, [onError]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
    document.documentElement.dataset.accent = state.preferences.accent ?? "clay";
  }, [state.preferences.theme, state.preferences.accent]);
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
  const receiveImages = useCallback(
    async (entries: GalleryEntry[]) => {
      if (!entries.length) return;
      if (writers) {
        setWriterImages({ entries, nonce: crypto.randomUUID() });
        return;
      }
      if (page === "creation") {
        const draft = getState().draft;
        if (draft.references.length + entries.length > combinationById(draft.combinationId).maxReferences)
          throw new Error(c("tooMany"));
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
      } else if (page === "upscale") setUpscaleInput({ entries, nonce: crypto.randomUUID() });
    },
    [page, writers],
  );
  useEffect(() => {
    if (new URLSearchParams(location.search).has("asset")) return;
    const paste = (event: ClipboardEvent) => {
      if (!["creation", "upscale", "gallery"].includes(page) || document.querySelector("dialog[open]")) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (!files.length) return;
      event.preventDefault();
      void importFiles(files).then(receiveImages).catch(onError);
    };
    document.addEventListener("paste", paste, true);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!["creation", "upscale", "gallery"].includes(page) || document.querySelector("dialog[open]")) return;
        const payload = event.payload;
        if (payload.type === "enter") setDragging(payload.paths.some(isImagePath));
        if (payload.type === "leave") setDragging(false);
        if (payload.type === "drop") {
          setDragging(false);
          void importPaths(payload.paths).then(receiveImages).catch(onError);
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
  }, [page, receiveImages, onError]);
  useEffect(() => {
    const refresh = () => {
      if (getState().ready) void refreshGallery().catch(onError);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [onError]);
  const view = (id: string) => {
    const context = takeViewerContext(id);
    const window = new WebviewWindow(`image-${crypto.randomUUID()}`, {
      url: `index.html?asset=${encodeURIComponent(id)}&context=${context}`,
      title: "Lutri",
      width: 1100,
      height: 800,
    });
    void window.once("tauri://error", (event) => onError(event.payload));
  };
  const addReferences = (entries: GalleryEntry[]) => {
    const draft = getState().draft;
    if (draft.references.length + entries.length > combinationById(draft.combinationId).maxReferences) {
      onError(c("tooMany"));
      return;
    }
    changeDraft({
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
    setPicker(false);
    setPage("creation");
  };
  const addReference = (entry: GalleryEntry) => addReferences([entry]);
  useEffect(() => {
    if (new URLSearchParams(location.search).has("asset")) return;
    let disposed = false;
    const unlistens: (() => void)[] = [];
    const settle = (stop: () => void) => {
      if (disposed) stop();
      else unlistens.push(stop);
    };
    void listen<GalleryEntry>("viewer-use-reference", (event) => addReferences([event.payload]))
      .then(settle)
      .catch(onError);
    void listen<GalleryEntry>("viewer-use-upscale", (event) => {
      setUpscaleInput({ entries: [event.payload], nonce: crypto.randomUUID() });
      setPage("upscale");
    })
      .then(settle)
      .catch(onError);
    return () => {
      disposed = true;
      unlistens.forEach((stop) => stop());
    };
  }, [onError]);
  const switchModel = async (next: ModelCombination) => {
    const current = getState().draft;
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
      mask:
        next.mask && current.mask && current.references[0]?.id === current.mask.referenceId ? current.mask : undefined,
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
      addReferences(await chooseImages());
      return;
    }
    const entry = await native<GalleryEntry>("asset_paste");
    await refreshGallery();
    addReferences([entry]);
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
  const restore = async (draft: GenerationDraft) => {
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
      if (validateDraft(submittedDraft).length) return;
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
  const assetId = new URLSearchParams(location.search).get("asset");
  if (assetId) {
    return <ImageViewer assetId={assetId} />;
  }
  const combination = combinationById(state.draft.combinationId),
    Form = combination.Form;
  const maskEntry = state.draft.mask
    ? state.masks.find((entry) => entry.asset.id === state.draft.mask?.assetId)
    : undefined;
  const maskReference = state.draft.references.find((reference) => reference.id === state.draft.mask?.referenceId);
  const maskReferenceEntry = maskReference
    ? state.gallery.find((entry) => entry.asset.id === maskReference.assetId)
    : undefined;
  const validation = validateDraft(state.draft);
  const configuration = state.preferences.providers[combination.provider];
  const configured =
    credential &&
    (combination.provider !== "azure" || !!(configuration?.endpoint?.trim() && configuration?.deployment?.trim()));
  const promptEmpty =
    !state.draft.prompt.trim() &&
    !state.draft.parameters.layer_decomposition &&
    !state.draft.parameters.structured_prompt;
  const canSubmit = state.ready && !submitting && !!configured && !validation.length && !promptEmpty;
  const queuedBatches = state.batches.filter((batch) =>
    state.tasks.some((task) => task.batchId === batch.id && task.status === "queued"),
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
    field.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")?.focus();
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
          <div>
            <h1>{t(page)}</h1>
          </div>
          {page === "creation" ? (
            <div className="button-row">
              {!!queuedBatches.length && (
                <button
                  onClick={() =>
                    void Promise.all(queuedBatches.map((batch) => cancelBatchQueued(batch.id))).catch(onError)
                  }
                >
                  {c("stopQueued")} · {state.tasks.filter((task) => task.status === "queued").length}
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
                <ModelSelector value={combination} onChange={(next) => void switchModel(next).catch(onError)} />
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
                <PromptField
                  draft={state.draft}
                  onChange={changeDraft}
                  onWriters={() => setWriters(true)}
                  limit={combination.promptLimit}
                />
                {!!combination.maxReferences && (
                  <References
                    draft={state.draft}
                    gallery={state.gallery}
                    onChange={changeDraft}
                    onAdd={(source) => void addSource(source).catch(onError)}
                    onView={view}
                    limit={combination.maxReferences}
                    primary={combination.primaryReference}
                    onNotice={(notice) => void message(notice, { title: "Lutri", kind: "warning" })}
                  />
                )}
                {combination.mask && state.draft.references.length ? (
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
                <section>
                  <div className="section-heading">
                    <span>{t("parameters")}</span>
                    <button
                      onClick={() =>
                        changeDraft({
                          ...state.draft,
                          parameters: initialDraft(combination).parameters,
                          requestCount: 1,
                        })
                      }
                    >
                      {t("reset")}
                    </button>
                  </div>
                  <Form
                    combination={combination}
                    draft={state.draft}
                    onChange={changeDraft}
                    styleControl={<SavedStyles combination={combination} draft={state.draft} onChange={changeDraft} />}
                  />
                  {!!combination.maxReferences && <InputPreparation draft={state.draft} onChange={changeDraft} />}
                  <RequestPreview
                    combination={combination}
                    draft={state.draft}
                    configuration={state.preferences.providers[combination.provider] ?? {}}
                  />
                </section>
                {combination.regions ? <Regions draft={state.draft} onChange={changeDraft} /> : null}
              </div>
              <div className="submit-panel">
                {!!validation.length && (
                  <details className="validation-notice">
                    <summary>
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
                {!configured && credential !== undefined ? (
                  <button
                    className="submit-reason"
                    onClick={() => {
                      sessionStorage.setItem("lutri.settings.provider", combination.provider);
                      setPage("settings");
                    }}
                  >
                    {c(credential ? "needsConfiguration" : "needsKey")} · {c("configure")}
                  </button>
                ) : validation.length ? (
                  <button className="submit-reason" onClick={() => focusIssue(validation[0])}>
                    {validation[0]}
                  </button>
                ) : promptEmpty ? (
                  <span className="submit-reason muted">{c("promptRequired")}</span>
                ) : null}
                <div className="generate-submit-row">
                  <label>
                    {t("requestCount")}
                    <input
                      type="number"
                      min={1}
                      value={state.draft.requestCount}
                      onChange={(e) => changeDraft({ ...state.draft, requestCount: Number(e.target.value) })}
                    />
                  </label>
                  <button className="primary-button" disabled={!canSubmit} onClick={() => void submit().catch(onError)}>
                    <SparkleIcon weight="fill" />
                    {submitting
                      ? t("submitting")
                      : `${sent ? c("sent") : t("generate")}${
                          state.draft.requestCount * combination.outputCount(state.draft.parameters) > 1
                            ? ` · ${state.draft.requestCount * combination.outputCount(state.draft.parameters)} ${t("imageCount")}`
                            : ""
                        }`}
                    <kbd>Ctrl ↵</kbd>
                  </button>
                </div>
              </div>
            </ResizablePanel>
            <Feed
              onView={view}
              onReference={addReference}
              onEdit={editImage}
              onRelated={(id) => {
                setSearch(id);
                setPage("history");
              }}
              onError={onError}
            />
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
            onRelated={(id) => {
              setSearch(id);
              setPage("history");
            }}
            onError={onError}
          />
        ) : null}
        {page === "history" ? (
          <History
            key={search}
            initialSearch={search}
            onError={onError}
            onRestore={(draft) => void restore(draft).catch(onError)}
            onView={view}
          />
        ) : null}
        {page === "settings" ? <Settings onError={onError} /> : null}
        <div className="upscale-host" hidden={page !== "upscale"}>
          <Upscale onError={onError} incoming={upscaleInput} />
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
          onSelect={addReferences}
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
                  void importAsset({ url: imageUrl })
                    .then(async (entry) => {
                      await refreshGallery();
                      addReferences([entry]);
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
          <label className="check">
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
          onView={view}
          incomingImages={writerImages}
          onAccept={(draft) => {
            changeDraft({ ...getState().draft, prompt: draft.prompt });
            setWriters(false);
          }}
          onSyncReferences={(draft) => {
            const current = getState().draft;
            const sameCombination = draft.combinationId === current.combinationId;
            changeDraft({
              ...current,
              references: draft.references,
              regions: sameCombination ? draft.regions : [],
              mask: sameCombination ? draft.mask : undefined,
            });
          }}
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
    </div>
  );
}
