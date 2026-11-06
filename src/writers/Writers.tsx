import { useEffect, useState } from "react";
import type { GenerationDraft, Json } from "../domain/types";
import { label, localize, t } from "../i18n";
import { assetData, commit, native, readRecords } from "../services/native";
import { streamChat } from "./stream";
import { builtInSpecifications, type Specification } from "./specifications";
import { ResizablePanel } from "../components/ResizablePanel";

interface Writer {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  vision: boolean;
}
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
  onError,
}: {
  draft: GenerationDraft;
  onAccept: (text: string) => void;
  onClose: () => void;
  onError: (error: unknown) => void;
}) {
  const [writers, setWriters] = useState<Writer[]>([]),
    [queue, setQueue] = useState<string[]>([]),
    [input, setInput] = useState(draft.prompt),
    [specs, setSpecs] = useState<Specification[]>(builtInSpecifications),
    [selected, setSelected] = useState<string[]>([]),
    [outputs, setOutputs] = useState<Output[]>([]),
    [editing, setEditing] = useState<Writer>(),
    [secret, setSecret] = useState("");
  const [loaded, setLoaded] = useState(false);
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
          setQueue(sessions[0].queue);
          setSelected(sessions[0].selected);
          setInput(sessions[0].input);
        }
        setLoaded(true);
      })
      .catch(onError);
  }, [onError]);
  useEffect(() => {
    if (loaded)
      void commit([{ collection: "writer-session", id: "current", value: { queue, selected, input } }]).catch(onError);
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
      for (const id of selected) {
        const specification = specs.find((spec) => spec.id === id);
        if (specification) messages.push({ role: "user", content: specification.content });
      }
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
              <span>{localize(label("Writer queue", "作家队列", "ライターキュー"))}</span>
              <button
                onClick={() => {
                  setSecret("");
                  setEditing({
                    id: crypto.randomUUID(),
                    name: "",
                    endpoint: "https://openrouter.ai/api/v1",
                    model: "",
                    vision: true,
                  });
                }}
              >
                {t("add")}
              </button>
            </div>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setQueue([...queue, e.target.value]);
              }}
            >
              <option value="">{t("model")}</option>
              {writers.map((writer) => (
                <option key={writer.id} value={writer.id}>
                  {writer.name}
                </option>
              ))}
            </select>
            {queue.map((id, index) => {
              const writer = writers.find((entry) => entry.id === id);
              return writer ? (
                <div className="writer-queue-item" key={`${id}:${index}`}>
                  <span>{writer.name}</span>
                  <button
                    onClick={() => {
                      setSecret("");
                      setEditing(writer);
                    }}
                  >
                    {localize(label("Edit", "编辑", "編集"))}
                  </button>
                  {!writer.vision ? (
                    <small>{localize(label("No image input", "不支持图像输入", "画像入力非対応"))}</small>
                  ) : null}
                  <button onClick={() => setQueue(queue.filter((_, i) => i !== index))}>×</button>
                </div>
              ) : null;
            })}
            <div className="section-heading">
              <span>{localize(label("Specifications", "附加规范", "追加ガイド"))}</span>
              <label className="file-button">
                {t("import")}
                <input
                  type="file"
                  accept=".md"
                  multiple
                  onChange={(e) => {
                    for (const file of Array.from(e.target.files ?? []))
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
            {specs.map((spec) => (
              <label className="spec-option" key={spec.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(spec.id)}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...selected, spec.id] : selected.filter((id) => id !== spec.id))
                  }
                />
                {spec.name}
                {selected.includes(spec.id) ? (
                  <>
                    <small>{selected.indexOf(spec.id) + 1}</small>
                    <button
                      type="button"
                      disabled={selected.indexOf(spec.id) === 0}
                      onClick={(event) => {
                        event.preventDefault();
                        const next = [...selected],
                          index = next.indexOf(spec.id);
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setSelected(next);
                      }}
                    >
                      ↑
                    </button>
                  </>
                ) : null}
              </label>
            ))}
            <button
              className="primary-button"
              disabled={!queue.length || !input.trim()}
              onClick={() => {
                for (const id of queue) {
                  const writer = writers.find((entry) => entry.id === id);
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
      {editing ? (
        <div className="modal-backdrop">
          <section className="writer-config">
            <h2>{t("model")}</h2>
            {(["name", "endpoint", "model"] as const).map((key) => (
              <label key={key}>
                {key === "name" ? localize(label("Name", "名称", "名前")) : t(key)}
                <input value={editing[key]} onChange={(e) => setEditing({ ...editing, [key]: e.target.value })} />
              </label>
            ))}
            <label>
              {t("key")}
              <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </label>
            <label className="spec-option">
              <input
                type="checkbox"
                checked={editing.vision}
                onChange={(e) => setEditing({ ...editing, vision: e.target.checked })}
              />
              {localize(label("Image input", "图像输入", "画像入力"))}
            </label>
            <div className="button-row">
              <button onClick={() => setEditing(undefined)}>{t("close")}</button>
              {writers.some((writer) => writer.id === editing.id) ? (
                <button
                  onClick={() =>
                    void (async () => {
                      await commit([{ collection: "writers", id: editing.id }]);
                      await native("credential_remove", { provider: `writer:${editing.id}` });
                      setWriters((current) => current.filter((writer) => writer.id !== editing.id));
                      setQueue((current) => current.filter((id) => id !== editing.id));
                      setEditing(undefined);
                    })().catch(onError)
                  }
                >
                  {t("delete")}
                </button>
              ) : null}
              <button
                disabled={
                  !editing.name ||
                  !editing.model ||
                  !editing.endpoint ||
                  (!secret && !writers.some((writer) => writer.id === editing.id))
                }
                onClick={() =>
                  void (async () => {
                    if (secret) await native("credential_save", { provider: `writer:${editing.id}`, secret });
                    await commit([{ collection: "writers", id: editing.id, value: editing }]);
                    setWriters((current) => [...current.filter((w) => w.id !== editing.id), editing]);
                    if (!writers.some((writer) => writer.id === editing.id))
                      setQueue((current) => [...current, editing.id]);
                    setEditing(undefined);
                    setSecret("");
                  })().catch(onError)
                }
              >
                {t("save")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
