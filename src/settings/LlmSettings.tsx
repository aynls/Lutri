import { useEffect, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Dialog } from "../components/Dialog";
import { label, localize, t } from "../i18n";
import { commit, native, readRecords } from "../services/native";
import type { Writer } from "../writers/types";
import type { Specification } from "../writers/specifications";

export function LlmSettings({ onError }: { onError: (error: unknown) => void }) {
  const [writers, setWriters] = useState<Writer[]>([]);
  const [specs, setSpecs] = useState<Specification[]>([]);
  const [editing, setEditing] = useState<Writer>();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  useEffect(() => {
    void readRecords<Writer>("writers").then(setWriters).catch(onError);
    void readRecords<Specification>("specifications").then(setSpecs).catch(onError);
  }, [onError]);
  const attempt = (action: () => Promise<void>) => {
    setBusy(true);
    void action()
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const existing = editing && writers.some((writer) => writer.id === editing.id);
  return (
    <>
      <section>
        <div className="llm-heading">
          <h2>LLM</h2>
          <button
            onClick={() => {
              setSecret("");
              setEditing({
                id: crypto.randomUUID(),
                name: "",
                endpoint: "https://openrouter.ai/api/v1",
                model: "",
              });
            }}
          >
            {t("add")}
          </button>
        </div>
        <div className="llm-list">
          {writers.map((writer) => (
            <div className="llm-item" key={writer.id}>
              <div>
                <strong>{writer.name}</strong>
                <small>{writer.model}</small>
              </div>
              <button
                onClick={() => {
                  setSecret("");
                  setEditing(writer);
                }}
              >
                {localize(label("Edit", "编辑", "編集"))}
              </button>
            </div>
          ))}
          {!writers.length && <p className="muted">{localize(label("No models", "暂无模型", "モデルなし"))}</p>}
        </div>
        {editing && (
          <Dialog
            className="compact-dialog llm-dialog"
            title={
              existing
                ? localize(
                    label("Edit OpenAI-compatible model", "编辑 OpenAI-compatible 模型", "OpenAI 互換モデルを編集"),
                  )
                : localize(
                    label("Add OpenAI-compatible model", "添加 OpenAI-compatible 模型", "OpenAI 互換モデルを追加"),
                  )
            }
            onClose={() => {
              if (!busy) setEditing(undefined);
            }}
            footer={
              <>
                {existing && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      attempt(async () => {
                        if (
                          !(await confirm(
                            localize(label("Delete this model?", "删除此模型？", "このモデルを削除しますか？")),
                            { title: editing.name, kind: "warning" },
                          ))
                        )
                          return;
                        await commit([{ collection: "writers", id: editing.id }]);
                        setWriters((current) => current.filter((writer) => writer.id !== editing.id));
                        setEditing(undefined);
                        await native("credential_remove", { provider: `writer:${editing.id}` });
                      })
                    }
                  >
                    {t("delete")}
                  </button>
                )}
                <button disabled={busy} onClick={() => setEditing(undefined)}>
                  {t("cancel")}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    !editing.name.trim() ||
                    !editing.endpoint.trim() ||
                    !editing.model.trim() ||
                    (!existing && !secret.trim())
                  }
                  onClick={() =>
                    attempt(async () => {
                      const value = {
                        ...editing,
                        name: editing.name.trim(),
                        endpoint: editing.endpoint.trim(),
                        model: editing.model.trim(),
                      };
                      if (secret.trim())
                        await native("credential_save", { provider: `writer:${editing.id}`, secret: secret.trim() });
                      await commit([{ collection: "writers", id: editing.id, value }]);
                      setWriters((current) =>
                        existing
                          ? current.map((writer) => (writer.id === value.id ? value : writer))
                          : [...current, value],
                      );
                      setEditing(undefined);
                      setSecret("");
                    })
                  }
                >
                  {t("save")}
                </button>
              </>
            }
          >
            <div className="llm-fields">
              <span className="muted">
                {localize(
                  label(
                    "Only models with image input are supported.",
                    "仅可用支持图片输入的模型。",
                    "画像入力に対応したモデルのみ利用できます。",
                  ),
                )}
              </span>
              {(["name", "endpoint", "model"] as const).map((key) => (
                <label key={key}>
                  {key === "name" ? localize(label("Name", "名称", "名前")) : t(key)}
                  <input
                    disabled={busy}
                    value={editing[key]}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        [key]: event.target.value,
                        ...(key === "name" ? {} : { efforts: undefined }),
                      })
                    }
                  />
                </label>
              ))}
              <label>
                {t("key")}
                <input
                  type="password"
                  autoComplete="off"
                  disabled={busy}
                  value={secret}
                  onChange={(event) => {
                    setSecret(event.target.value);
                    setEditing({ ...editing, efforts: undefined });
                  }}
                />
              </label>
              <div className="llm-discovery">
                <button
                  disabled={busy || !editing.endpoint.trim() || !editing.model.trim() || (!existing && !secret.trim())}
                  onClick={() => {
                    setDetecting(true);
                    attempt(async () => {
                      try {
                        const efforts = await native<string[]>("writer_discover_efforts", {
                          provider: `writer:${editing.id}`,
                          endpoint: editing.endpoint.trim(),
                          model: editing.model.trim(),
                          secret: secret.trim() || null,
                        }).catch(() => []);
                        setEditing({ ...editing, efforts });
                      } finally {
                        setDetecting(false);
                      }
                    });
                  }}
                >
                  {detecting
                    ? localize(label("Detecting…", "检测中…", "検出中…"))
                    : localize(label("Detect reasoning levels", "检测思考强度", "推論強度を検出"))}
                </button>
                <span className="muted" role="status">
                  {!detecting &&
                    (editing.efforts === undefined
                      ? localize(label("Not checked", "未检测", "未検出"))
                      : editing.efforts.length
                        ? editing.efforts.join(", ")
                        : localize(
                            label(
                              "Unavailable · provider default",
                              "不可用 · 供应商默认",
                              "利用不可 · プロバイダーの既定値",
                            ),
                          ))}
                </span>
              </div>
            </div>
          </Dialog>
        )}
      </section>
      <section>
        <div className="llm-heading">
          <h2>{localize(label("Custom specifications", "自定义规范", "カスタムガイド"))}</h2>
          <label className="file-button llm-import">
            {localize(label("Import Markdown spec", "导入Markdown规范", "Markdown ガイドを読み込む"))}
            <input
              type="file"
              accept=".md"
              multiple
              disabled={busy}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                attempt(async () => {
                  for (const file of files) {
                    const spec = { id: crypto.randomUUID(), name: file.name, content: await file.text() };
                    await commit([{ collection: "specifications", id: spec.id, value: spec }]);
                    setSpecs((current) => [...current, spec]);
                  }
                });
              }}
            />
          </label>
        </div>
        <div className="llm-list">
          {specs.map((spec) => (
            <div className="llm-item" key={spec.id}>
              <div>
                <strong>{spec.name}</strong>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  attempt(async () => {
                    if (
                      !(await confirm(
                        localize(label("Delete this specification?", "删除此规范？", "このガイドを削除しますか？")),
                        { title: spec.name, kind: "warning" },
                      ))
                    )
                      return;
                    await commit([{ collection: "specifications", id: spec.id }]);
                    setSpecs((current) => current.filter((item) => item.id !== spec.id));
                  })
                }
              >
                {t("delete")}
              </button>
            </div>
          ))}
          {!specs.length && (
            <p className="muted">
              {localize(label("No custom specifications", "暂无自定义规范", "カスタムガイドなし"))}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
