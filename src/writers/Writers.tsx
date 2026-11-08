import { Select } from "../components/Select";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsSixVerticalIcon,
  XIcon,
  GearSixIcon,
  NotePencilIcon,
} from "@phosphor-icons/react";
import type { GenerationDraft, GalleryEntry } from "../domain/types";
import { label, localize, t } from "../i18n";
import { importAsset, native, commit, readRecords } from "../services/native";
import { streamChat } from "./stream";
import { builtInSpecifications, type Specification } from "./specifications";
import { ResizablePanel } from "../components/ResizablePanel";
import { CopyButton } from "../components/CopyButton";

import type { Writer } from "./types";
import { refreshGallery, useApplication } from "../services/store";
import { PromptField } from "../create/components/PromptField";
import { References, type ReferenceSource } from "../create/components/References";
import { AssetPicker } from "../gallery/AssetPicker";
import { Dialog } from "../components/Dialog";
import { chooseImages } from "../gallery/actions";
import { combinationById } from "../models";
import { editTargetId } from "../models/creation";
import { c } from "../create/messages";
import { writerMessages } from "./request";

interface Output {
  id: string;
  writer: Writer;
  draft: GenerationDraft;
  text: string;
  reasoning: string;
  effort: string;
  busy: boolean;
  error?: string;
}
export function Writers({
  draft,
  onAccept,
  onView,
  incomingImages,
  onClose,
  onSettings,
  onSyncReferences,
  active,
  onError,
}: {
  draft: GenerationDraft;
  onAccept: (draft: GenerationDraft) => void;
  onView: (id: string) => void;
  incomingImages?: { entries: GalleryEntry[]; nonce: string };
  onClose: () => void;
  onSettings: () => void;
  onSyncReferences: (draft: GenerationDraft) => void;
  active: boolean;
  onError: (error: unknown) => void;
}) {
  const { gallery } = useApplication();
  const [writers, setWriters] = useState<Writer[]>([]),
    [queue, setQueue] = useState<{ id: string; writerId: string }[]>([]),
    [writerDraft, setWriterDraft] = useState(() => structuredClone(draft)),
    [specs, setSpecs] = useState<Specification[]>(builtInSpecifications),
    [selected, setSelected] = useState(""),
    [efforts, setEfforts] = useState<Record<string, string>>({}),
    [outputs, setOutputs] = useState<Output[]>([]);
  const resultsArea = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setColumnCount(Math.max(1, Math.floor((entry.contentRect.width + 20) / 455))),
    );
    observer.observe(resultsArea.current!);
    return () => observer.disconnect();
  }, []);
  const resultColumns = useMemo(() => {
    const groups: Output[][] = Array.from({ length: columnCount }, () => []),
      heights = Array<number>(columnCount).fill(0);
    for (const output of outputs) {
      const column = heights.indexOf(Math.min(...heights));
      groups[column].push(output);
      let lines = 0;
      for (const line of `${output.text}\n${output.error ?? ""}`.split("\n"))
        lines += Math.max(
          1,
          Math.ceil([...line].reduce((width, char) => width + (char.charCodeAt(0) > 0xff ? 2 : 1), 0) / 56),
        );
      heights[column] += 150 + lines * 24 + (output.reasoning ? 38 : 0);
    }
    return groups;
  }, [outputs, columnCount]);
  const [picker, setPicker] = useState(false);
  const [urlImport, setUrlImport] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const referenceLimit = Math.max(
    combinationById(writerDraft.combinationId).maxReferences || 10,
    writerDraft.references.length,
  );
  const syncReferences = (next: GenerationDraft) => {
    setWriterDraft(next);
    onSyncReferences(next);
  };
  const addReferences = (entries: GalleryEntry[]) => {
    if (!entries.length) return;
    if (writerDraft.references.length + entries.length > referenceLimit) {
      onError(c("tooMany"));
      return;
    }
    syncReferences({
      ...writerDraft,
      references: [
        ...writerDraft.references,
        ...entries.map((entry) => ({
          id: crypto.randomUUID(),
          assetId: entry.asset.id,
          name: t("referenceAlias"),
          purpose: "reference" as const,
        })),
      ],
    });
    setPicker(false);
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
      addReferences(await chooseImages(true));
      return;
    }
    const entry = await native<GalleryEntry>("asset_paste", { staged: true });
    await refreshGallery();
    addReferences([entry]);
  };
  const [loaded, setLoaded] = useState(false);
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) {
      setWriterDraft(structuredClone(draft));
      setNotice("");
    }
    wasActive.current = active;
  }, [active, draft]);
  const lastIncoming = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!active || !incomingImages || incomingImages.nonce === lastIncoming.current) return;
    lastIncoming.current = incomingImages.nonce;
    addReferences(incomingImages.entries);
  }, [active, incomingImages]);
  const dragged = useRef<{ id: string; pointerId: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string>();
  useEffect(() => {
    if (!active || !loaded) return;
    let valid = true;
    void Promise.all([readRecords<Writer>("writers"), readRecords<Specification>("specifications")])
      .then(([items, customSpecs]) => {
        if (!valid) return;
        setWriters(items);
        const availableSpecs = [...builtInSpecifications, ...customSpecs];
        setSpecs(availableSpecs);
        setSelected((current) => (availableSpecs.some((spec) => spec.id === current) ? current : ""));
        setQueue((current) => current.filter((entry) => items.some((item) => item.id === entry.writerId)));
      })
      .catch(onError);
    return () => {
      valid = false;
    };
  }, [active, loaded, onError]);
  const move = (from: number, to: number) => {
    setQueue((current) => {
      if (from < 0 || to < 0 || from >= current.length || to >= current.length || from === to) return current;
      const next = [...current];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };
  useEffect(() => {
    void Promise.all([
      readRecords<Writer>("writers"),
      readRecords<Specification>("specifications"),
      readRecords<{ queue: string[]; selected: string[]; efforts?: Record<string, string> }>("writer-session"),
    ])
      .then(([w, s, sessions]) => {
        setWriters(w);
        setSpecs([...builtInSpecifications, ...s]);
        if (sessions[0]) {
          setEfforts(sessions[0].efforts ?? {});
          setQueue(
            sessions[0].queue
              .filter((id) => w.some((writer) => writer.id === id))
              .map((writerId) => ({ id: crypto.randomUUID(), writerId })),
          );
          setSelected(
            sessions[0].selected.find((id) => [...builtInSpecifications, ...s].some((spec) => spec.id === id)) ?? "",
          );
        }
        setLoaded(true);
      })
      .catch(onError);
  }, [onError]);
  useEffect(() => {
    if (loaded)
      void commit([
        {
          collection: "writer-session",
          id: "current",
          value: { queue: queue.map((entry) => entry.writerId), selected: selected ? [selected] : [], efforts },
        },
      ]).catch(onError);
  }, [queue, selected, efforts, loaded, onError]);
  const run = async (writer: Writer, effort: string, id: string = crypto.randomUUID()) => {
    const snapshot = structuredClone(writerDraft);
    setOutputs((current) => [
      ...current.filter((output) => output.id !== id),
      { id, writer, draft: snapshot, text: "", reasoning: "", effort, busy: true },
    ]);
    const update = (changes: Partial<Output>) =>
      setOutputs((current) => current.map((output) => (output.id === id ? { ...output, ...changes } : output)));
    try {
      const specification = specs.find((spec) => spec.id === selected);
      const messages = await writerMessages(snapshot, specification?.content);
      await streamChat(
        {
          url: `${writer.endpoint.replace(/\/$/, "")}/chat/completions`,
          method: "POST",
          provider: `writer:${writer.id}`,
          authHeader: "Authorization",
          authPrefix: "Bearer ",
          body: { model: writer.model, messages, stream: true, ...(effort ? { reasoning_effort: effort } : {}) },
        },
        (text, reasoning) => update({ text, reasoning }),
      );
      update({ busy: false });
    } catch (error) {
      update({ busy: false, error: String(error) });
    }
  };
  return (
    <section className="writer-workspace">
      <header className="writer-header">
        <button onClick={onClose}>← {t("back")}</button>
        <h2>{t("writers")}</h2>
      </header>
      <div className="writer-body">
        <ResizablePanel
          className="writer-panel"
          storageKey="lutri.writers.panel"
          initialWidth={350}
          minWidth={260}
          maxWidth={520}
        >
          <div className="writer-scroll">
            <PromptField draft={writerDraft} onChange={setWriterDraft} />
            <References
              draft={writerDraft}
              gallery={gallery}
              onChange={syncReferences}
              onAdd={(source) => void addSource(source).catch(onError)}
              onView={onView}
              limit={referenceLimit}
              targetId={editTargetId(writerDraft, combinationById(writerDraft.combinationId))}
              stableTarget={writerDraft.creationMode === "edit"}
              onNotice={setNotice}
            />
            {notice && (
              <span className="muted" role="status">
                {notice}
              </span>
            )}
            <div className="section-heading">
              <span>{localize(label("Writer queue", "Writer 队列", "Writer キュー"))}</span>
              <button onClick={onSettings}>
                <GearSixIcon /> {localize(label("LLM settings", "LLM 设置", "LLM 設定"))}
              </button>
            </div>
            <div
              className={`writer-queue${draggingId ? " is-dragging" : ""}`}
              onPointerMove={(event) => {
                const drag = dragged.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-queue-id]"));
                const from = rows.findIndex((row) => row.dataset.queueId === drag.id);
                const to = rows.findIndex((row) => {
                  const rect = row.getBoundingClientRect();
                  return event.clientY >= rect.top && event.clientY <= rect.bottom;
                });
                if (from < 0 || to < 0 || from === to) return;
                const rect = rows[to].getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                if ((from < to && event.clientY >= midpoint) || (from > to && event.clientY <= midpoint))
                  move(from, to);
              }}
              onPointerUp={(event) => {
                if (dragged.current?.pointerId !== event.pointerId) return;
                dragged.current = null;
                setDraggingId(undefined);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                dragged.current = null;
                setDraggingId(undefined);
              }}
              onLostPointerCapture={() => {
                dragged.current = null;
                setDraggingId(undefined);
              }}
            >
              {queue.length ? (
                queue.map((entry, index) => {
                  const writer = writers.find((item) => item.id === entry.writerId);
                  if (!writer) return null;
                  return (
                    <div
                      className={`writer-queue-item${draggingId === entry.id ? " is-dragging" : ""}`}
                      key={entry.id}
                      data-queue-id={entry.id}
                    >
                      <button
                        className="writer-drag-handle"
                        aria-label={localize(label("Drag to reorder", "拖动排序", "ドラッグで並べ替え"))}
                        title={localize(label("Drag to reorder", "拖动排序", "ドラッグで並べ替え"))}
                        onPointerDown={(event) => {
                          if (event.button !== 0 || !event.isPrimary) return;
                          event.preventDefault();
                          event.currentTarget.focus();
                          const container = event.currentTarget.closest<HTMLElement>(".writer-queue")!;
                          container.setPointerCapture(event.pointerId);
                          dragged.current = { id: entry.id, pointerId: event.pointerId };
                          setDraggingId(entry.id);
                        }}
                      >
                        <DotsSixVerticalIcon aria-hidden="true" />
                      </button>
                      <div className="writer-queue-model">
                        <span title={writer.name}>{writer.name}</span>
                        {!!writer.efforts?.length && (
                          <Select
                            aria-label={localize(label("Reasoning effort", "思考强度", "推論強度"))}
                            value={writer.efforts.includes(efforts[writer.id]) ? efforts[writer.id] : ""}
                            onValueChange={(value) => setEfforts((current) => ({ ...current, [writer.id]: value }))}
                          >
                            <option value="">
                              {localize(label("Provider default", "供应商默认", "プロバイダーの既定値"))}
                            </option>
                            {writer.efforts.map((level) => (
                              <option key={level} value={level}>
                                {level}
                              </option>
                            ))}
                          </Select>
                        )}
                      </div>
                      <button
                        title={t("moveUp")}
                        aria-label={t("moveUp")}
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                      >
                        <ArrowUpIcon />
                      </button>
                      <button
                        title={t("moveDown")}
                        aria-label={t("moveDown")}
                        disabled={index === queue.length - 1}
                        onClick={() => move(index, index + 1)}
                      >
                        <ArrowDownIcon />
                      </button>
                      <button
                        title={localize(label("Remove", "移除", "削除"))}
                        aria-label={localize(label("Remove", "移除", "削除"))}
                        onClick={() => setQueue((current) => current.filter((item) => item.id !== entry.id))}
                      >
                        <XIcon />
                      </button>
                    </div>
                  );
                })
              ) : (
                <span className="muted writer-queue-empty">
                  {localize(label("No models selected", "尚未添加模型", "モデルが未選択"))}
                </span>
              )}
              <Select
                aria-label={localize(label("Add model", "添加模型", "モデルを追加"))}
                value=""
                disabled={!writers.length}
                onValueChange={(nextValue) => {
                  const id = nextValue;
                  if (id) setQueue((current) => [...current, { id: crypto.randomUUID(), writerId: id }]);
                }}
              >
                <option value="" disabled hidden>
                  {localize(label("Add model", "添加模型", "モデルを追加"))}
                </option>
                {writers.map((writer) => (
                  <option key={writer.id} value={writer.id}>
                    {writer.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="section-heading">
              <span>{localize(label("Specifications", "附加规范", "追加ガイド"))}</span>
              <label className="file-button">
                {t("import")}
                <input
                  type="file"
                  accept=".md"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    for (const file of files)
                      void file
                        .text()
                        .then(async (content) => {
                          const spec = { id: crypto.randomUUID(), name: file.name, content };
                          await commit([{ collection: "specifications", id: spec.id, value: spec }]);
                          setSpecs((current) => [...current, spec]);
                        })
                        .catch(onError);
                  }}
                />
              </label>
            </div>
            <Select
              aria-label={localize(label("Specifications", "附加规范", "追加ガイド"))}
              value={selected}
              onValueChange={(nextValue) => setSelected(nextValue)}
            >
              <option value="">{localize(label("None", "无", "なし"))}</option>
              {specs
                .filter((spec) => spec.builtin)
                .map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.name.replace(/\.md$/i, "")}
                  </option>
                ))}
              {specs.some((spec) => !spec.builtin) && (
                <optgroup label={localize(label("Custom", "自定义", "カスタム"))}>
                  {specs
                    .filter((spec) => !spec.builtin)
                    .map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.name.replace(/\.md$/i, "")}
                      </option>
                    ))}
                </optgroup>
              )}
            </Select>
          </div>
          <footer className="submit-panel writer-submit">
            <button
              className="primary-button"
              disabled={!queue.length || !writerDraft.prompt.trim()}
              onClick={() => {
                for (const queued of queue) {
                  const writer = writers.find((entry) => entry.id === queued.writerId);
                  if (writer) void run(writer, writer.efforts?.includes(efforts[writer.id]) ? efforts[writer.id] : "");
                }
              }}
            >
              {t("writers")}
            </button>
          </footer>
        </ResizablePanel>
        <div className="writer-results-area">
          {outputs.length ? (
            <div className="writer-results-actions">
              <button onClick={() => setOutputs([])}>{localize(label("Clear all", "全部清空", "すべて消去"))}</button>
            </div>
          ) : null}
          <div className="writer-results" ref={resultsArea}>
            {!outputs.length && (
              <div className="empty-state">
                <NotePencilIcon size={36} weight="thin" />
                <p>{localize(label("No results yet", "暂无结果", "結果はまだありません"))}</p>
              </div>
            )}
            {resultColumns.map((column, index) => (
              <div className="writer-results-column" key={index}>
                {column.map((output) => (
                  <article key={output.id}>
                    <header>
                      <strong>{output.writer.name}</strong>
                      {output.busy ? <span className="spinner" /> : null}
                      <button
                        aria-label={localize(label("Remove", "移除", "削除"))}
                        onClick={() => setOutputs((current) => current.filter((item) => item.id !== output.id))}
                      >
                        ×
                      </button>
                    </header>
                    {output.reasoning ? (
                      <details>
                        <summary>{localize(label("Reasoning", "推理过程", "推論"))}</summary>
                        <p>{output.reasoning}</p>
                      </details>
                    ) : null}
                    <div className="writer-result-prompt">
                      <p>{output.text}</p>
                      {output.text.trim() ? (
                        <CopyButton
                          className="writer-result-copy"
                          value={output.text}
                          title={t("copyPrompt")}
                          onError={onError}
                        />
                      ) : null}
                    </div>
                    {output.error ? <p className="error-text">{output.error}</p> : null}
                    <footer>
                      <button
                        disabled={output.busy || !writers.some((writer) => writer.id === output.writer.id)}
                        onClick={() => {
                          const current = writers.find((writer) => writer.id === output.writer.id);
                          if (!current) return;
                          const effort =
                            current.endpoint === output.writer.endpoint &&
                            current.model === output.writer.model &&
                            current.efforts?.includes(output.effort)
                              ? output.effort
                              : "";
                          void run(current, effort, output.id);
                        }}
                      >
                        {localize(label("Rewrite", "重写", "書き直す"))}
                      </button>
                      <button
                        disabled={!output.text || output.busy}
                        onClick={() => onAccept({ ...output.draft, prompt: output.text })}
                      >
                        {localize(label("Use prompt", "使用提示词", "使用する"))}
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {picker && (
        <AssetPicker
          onSelect={addReferences}
          onClose={() => setPicker(false)}
          onError={onError}
          limit={Math.max(0, referenceLimit - writerDraft.references.length)}
        />
      )}
      {urlImport && (
        <Dialog
          title={c("url")}
          className="compact-dialog"
          onClose={() => setUrlImport(false)}
          footer={
            <>
              <button onClick={() => setUrlImport(false)}>{t("cancel")}</button>
              <button
                disabled={importBusy || !/^https?:\/\//i.test(imageUrl)}
                onClick={() => {
                  setImportBusy(true);
                  void importAsset({ url: imageUrl }, true)
                    .then(async (entry) => {
                      await refreshGallery();
                      addReferences([entry]);
                      setUrlImport(false);
                      setImageUrl("");
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
            type="url"
            aria-label={c("url")}
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
          />
        </Dialog>
      )}
    </section>
  );
}
