import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApertureIcon,
  ArrowUpRightIcon,
  ClockCounterClockwiseIcon,
  GearSixIcon,
  ImagesIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { confirm, message } from "@tauri-apps/plugin-dialog";
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
import { assetExists } from "./services/native";
import { ImageViewer } from "./gallery/ImageViewer";
import { resumeTasks, submitBatch } from "./services/generation";
import { Feed } from "./create/Feed";
import { PromptField } from "./create/components/PromptField";
import { References } from "./create/components/References";
import { RequestPreview } from "./create/components/RequestPreview";
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
  const state = useApplication();
  const [page, setPage] = useState<Page>("creation"),
    [error, setError] = useState(""),
    [picker, setPicker] = useState(false),
    [search, setSearch] = useState(""),
    [writers, setWriters] = useState(false),
    [maskEditor, setMaskEditor] = useState(false);
  const [upscaleInput, setUpscaleInput] = useState<{ entries: GalleryEntry[]; nonce: string }>();
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
        .catch(onError);
    }
  }, [onError]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
  }, [state.preferences.theme]);
  const receiveImages = useCallback(
    async (entries: GalleryEntry[]) => {
      if (!entries.length) return;
      if (page === "creation") {
        const draft = getState().draft;
        await saveDraft({
          ...draft,
          references: [
            ...draft.references,
            ...entries.map((entry) => ({
              id: crypto.randomUUID(),
              assetId: entry.asset.id,
              name: entry.asset.name,
              purpose: "reference" as const,
            })),
          ],
        });
      } else if (page === "upscale") setUpscaleInput({ entries, nonce: crypto.randomUUID() });
    },
    [page],
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
    const window = new WebviewWindow(`image-${crypto.randomUUID()}`, {
      url: `index.html?asset=${encodeURIComponent(id)}`,
      title: "Lutri",
      width: 1100,
      height: 800,
    });
    void window.once("tauri://error", (event) => onError(event.payload));
  };
  const addReferences = (entries: GalleryEntry[]) => {
    const draft = getState().draft;
    changeDraft({
      ...draft,
      references: [
        ...draft.references,
        ...entries.map((entry) => ({
          id: crypto.randomUUID(),
          assetId: entry.asset.id,
          name: entry.asset.name,
          purpose: "reference" as const,
        })),
      ],
    });
    setPicker(false);
    setPage("creation");
  };
  const addReference = (entry: GalleryEntry) => addReferences([entry]);
  const switchModel = (next: ModelCombination) => {
    const current = getState().draft;
    drafts.current.set(current.combinationId, structuredClone(current));
    const previous = drafts.current.get(next.id) ?? initialDraft(next);
    changeDraft({
      ...previous,
      prompt: current.prompt,
      references: current.references,
      requestCount: current.requestCount,
      regions: next.regions
        ? previous.regions.filter(
            (region) => !region.referenceId || current.references.some((ref) => ref.id === region.referenceId),
          )
        : [],
      mask:
        next.mask && previous.mask && current.references.some((ref) => ref.id === previous.mask?.referenceId)
          ? previous.mask
          : undefined,
    });
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
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const invalid = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(".creation-panel :invalid");
      if (invalid) {
        invalid.reportValidity();
        return;
      }
      const missing = await Promise.all(
        state.draft.references.map(async (ref) => ({ ref, exists: await assetExists(ref.assetId) })),
      );
      const ids = new Set(missing.filter((entry) => !entry.exists).map((entry) => entry.ref.id));
      const maskMissing = state.draft.mask && !(await assetExists(state.draft.mask.assetId));
      if (
        (ids.size || maskMissing || missingPromptReferences(state.draft).length) &&
        !(await confirm(t("missingWarning"), { title: "Lutri", kind: "warning" }))
      )
        return;
      const draft = {
        ...state.draft,
        references: state.draft.references.filter((ref) => !ids.has(ref.id)),
        regions: state.draft.regions.filter((region) => !region.referenceId || !ids.has(region.referenceId)),
        mask: state.draft.mask && (ids.has(state.draft.mask.referenceId) || maskMissing) ? undefined : state.draft.mask,
      };
      if (ids.size || maskMissing) await saveDraft({ ...draft, references: state.draft.references });
      await submitBatch({ ...draft, references: state.draft.references });
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
  const validation = validateDraft(state.draft);
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
              <span>{t(id)}</span>
            </button>
          ))}
        </div>
        <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>
          <GearSixIcon size={20} />
          <span>{t("settings")}</span>
        </button>
        <span className="version">Lutri / 0.1</span>
      </nav>
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <h1>{t(page)}</h1>
          </div>
          {page === "creation" ? (
            <button onClick={() => void removeFeed(state.feed.map((slot) => slot.id)).catch(onError)}>
              {t("clear")}
            </button>
          ) : null}
        </header>
        {page === "creation" ? (
          <div
            className="creation-workspace"
            onKeyDown={(event) => {
              if (document.querySelector("dialog[open]")) return;
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                if (!validation.length && state.draft.prompt.trim()) void submit().catch(onError);
              }
            }}
          >
            <ResizablePanel className="creation-panel" storageKey="lutri.creation.panel">
              <div className="creation-scroll">
                <ModelSelector value={combination} onChange={switchModel} />
                <PromptField draft={state.draft} onChange={changeDraft} onWriters={() => setWriters(true)} />
                <References
                  draft={state.draft}
                  gallery={state.gallery}
                  onChange={changeDraft}
                  onAdd={() => setPicker(true)}
                  onView={view}
                  limit={combination.maxReferences}
                  primary
                />
                {combination.mask && state.draft.references.length ? (
                  <div className="button-row">
                    <button onClick={() => setMaskEditor(true)}>{t("mask")}</button>
                    {state.draft.mask ? (
                      <button onClick={() => changeDraft({ ...state.draft, mask: undefined })}>{t("remove")}</button>
                    ) : null}
                  </div>
                ) : null}
                <section>
                  <div className="section-heading">
                    <span>{t("parameters")}</span>
                    <button
                      onClick={() => changeDraft({ ...state.draft, parameters: initialDraft(combination).parameters })}
                    >
                      {t("reset")}
                    </button>
                  </div>
                  <Form combination={combination} draft={state.draft} onChange={changeDraft} />
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
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <label>
                  {t("requestCount")}
                  <input
                    type="number"
                    min={1}
                    value={state.draft.requestCount}
                    onChange={(e) => changeDraft({ ...state.draft, requestCount: Number(e.target.value) })}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={
                    !state.ready ||
                    submitting ||
                    validation.length > 0 ||
                    (!state.draft.prompt.trim() &&
                      !state.draft.parameters.layer_decomposition &&
                      !state.draft.parameters.structured_prompt)
                  }
                  onClick={() => void submit().catch(onError)}
                >
                  <SparkleIcon weight="fill" />
                  {submitting
                    ? t("submitting")
                    : `${t("generate")}${
                        state.draft.requestCount * combination.outputCount(state.draft.parameters) > 1
                          ? ` · ${state.draft.requestCount * combination.outputCount(state.draft.parameters)} ${t("imageCount")}`
                          : ""
                      }`}
                  <kbd>Ctrl ↵</kbd>
                </button>
              </div>
            </ResizablePanel>
            <Feed
              onView={view}
              onReference={addReference}
              onRelated={(id) => {
                setSearch(id);
                setPage("history");
              }}
              onError={onError}
            />
          </div>
        ) : null}
        {page === "gallery" ? (
          <Gallery
            onView={view}
            onUpscale={(entry) => {
              setUpscaleInput({ entries: [entry], nonce: crypto.randomUUID() });
              setPage("upscale");
            }}
            onReference={addReference}
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
          onChange={changeDraft}
          onClose={() => setMaskEditor(false)}
          onError={onError}
        />
      ) : null}
      <div hidden={!writers}>
        <Writers
          draft={state.draft}
          onAccept={(prompt) => {
            changeDraft({ ...state.draft, prompt });
            setWriters(false);
          }}
          onClose={() => setWriters(false)}
          onError={onError}
        />
      </div>
    </div>
  );
}
