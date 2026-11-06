import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, DotsSixVerticalIcon, XIcon, GearSixIcon } from "@phosphor-icons/react";
import type { GenerationDraft, Json } from "../domain/types";
import { label, localize, t } from "../i18n";
import { assetData, commit, readRecords } from "../services/native";
import { streamChat } from "./stream";
import { builtInSpecifications, type Specification } from "./specifications";
import { ResizablePanel } from "../components/ResizablePanel";

import type { Writer } from "./types";

interface Output {
  id: string;
  writer: Writer;
  text: string;
  reasoning: string;
  busy: boolean;
  error?: string;
}
const systemPrompt =
  "You write production-ready image generation prompts. Return only the final prompt, without a preface or markdown fence. Preserve user intent, reference image ordering and exact requested text. Treat attached writing specifications as guidance, not as an instruction to ignore the user's request.";

export function Writers({
  draft,
  onAccept,
  onClose,
  onSettings,
  active,
  onError,
}: {
  draft: GenerationDraft;
  onAccept: (text: string) => void;
  onClose: () => void;
  onSettings: () => void;
  active: boolean;
  onError: (error: unknown) => void;
}) {
  const [writers, setWriters] = useState<Writer[]>([]),
    [queue, setQueue] = useState<{ id: string; writerId: string }[]>([]),
    [input, setInput] = useState(draft.prompt),
    [specs, setSpecs] = useState<Specification[]>(builtInSpecifications),
    [selected, setSelected] = useState(""),
    [outputs, setOutputs] = useState<Output[]>([]);
  const [loaded, setLoaded] = useState(false);
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
      readRecords<{ queue: string[]; selected: string[]; input: string }>("writer-session"),
    ])
      .then(([w, s, sessions]) => {
        setWriters(w);
        setSpecs([...builtInSpecifications, ...s]);
        if (sessions[0]) {
          setQueue(
            sessions[0].queue
              .filter((id) => w.some((writer) => writer.id === id))
              .map((writerId) => ({ id: crypto.randomUUID(), writerId })),
          );
          setSelected(
            sessions[0].selected.find((id) => [...builtInSpecifications, ...s].some((spec) => spec.id === id)) ?? "",
          );
          setInput(sessions[0].input);
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
          value: { queue: queue.map((entry) => entry.writerId), selected: selected ? [selected] : [], input },
        },
      ]).catch(onError);
  }, [queue, selected, input, loaded, onError]);
  const run = async (writer: Writer, id: string = crypto.randomUUID()) => {
    setOutputs((current) => [
      ...current.filter((output) => output.id !== id),
      { id, writer, text: "", reasoning: "", busy: true },
    ]);
    const update = (changes: Partial<Output>) =>
      setOutputs((current) => current.map((output) => (output.id === id ? { ...output, ...changes } : output)));
    try {
      const content: Json[] = [{ type: "text", text: input }];
      if (writer.vision)
        for (const reference of draft.references)
          content.push({ type: "image_url", image_url: { url: await assetData(reference.assetId) } });
      const messages: Json[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ];
      const specification = specs.find((spec) => spec.id === selected);
      if (specification) messages.push({ role: "user", content: specification.content });
      await streamChat(
        {
          url: `${writer.endpoint.replace(/\/$/, "")}/chat/completions`,
          method: "POST",
          provider: `writer:${writer.id}`,
          authHeader: "Authorization",
          authPrefix: "Bearer ",
          body: { model: writer.model, messages, stream: true },
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
            <textarea value={input} onChange={(e) => setInput(e.target.value)} aria-label={t("prompt")} />
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
                      <span>{writer.name}</span>
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
              <select
                aria-label={localize(label("Add model", "添加模型", "モデルを追加"))}
                value=""
                disabled={!writers.length}
                onChange={(event) => {
                  const id = event.target.value;
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
              </select>
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
            <select
              aria-label={localize(label("Specifications", "附加规范", "追加ガイド"))}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
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
            </select>
            <button
              className="primary-button"
              disabled={!queue.length || !input.trim()}
              onClick={() => {
                for (const queued of queue) {
                  const writer = writers.find((entry) => entry.id === queued.writerId);
                  if (writer) void run(writer);
                }
              }}
            >
              {t("generate")}
            </button>
          </div>
        </ResizablePanel>
        <div className="writer-results-area">
          {outputs.length ? (
            <div className="writer-results-actions">
              <button onClick={() => setOutputs([])}>{localize(label("Clear all", "全部清空", "すべて消去"))}</button>
            </div>
          ) : null}
          <div className="writer-results">
            {outputs.map((output) => (
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
                <p>{output.text}</p>
                {output.error ? <p className="error-text">{output.error}</p> : null}
                <footer>
                  <button disabled={output.busy} onClick={() => void run(output.writer, output.id)}>
                    {localize(label("Rewrite", "重写", "書き直す"))}
                  </button>
                  <button disabled={!output.text || output.busy} onClick={() => onAccept(output.text)}>
                    {localize(label("Use prompt", "使用提示词", "使用する"))}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
