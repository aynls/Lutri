import { CopyIcon, ListPlusIcon, PencilSimpleIcon, PaperPlaneTiltIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { OutputControls } from "../components/OutputControls";
import { ModelIcon } from "../components/ModelIcon";
import { t } from "../i18n";
import { displayPrompt, missingPromptReferences } from "../domain/references";
import { combinationById } from "../models";
import { providerNames } from "../models/shared";
import { useApplication } from "../services/store";
import { copyBatchItem, editBatchItem, removeBatchItem } from "./draft";
import { validateBatchDraft } from "./capabilities";
import { BatchValidationError, submitCloudBatch } from "./service";
import { b } from "./messages";

export function BatchDraft({
  onError,
  onTasks,
  onBusy,
}: {
  onError: (error: unknown) => void;
  onTasks: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { creation, preferences } = useApplication();
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const count = creation.items.reduce((sum, item) => sum + item.draft.requestCount, 0);
  const editing = !!creation.editing;
  const missingDirectory = preferences.outputs?.batchAuto && !preferences.outputs.directory?.trim();
  const submit = async () => {
    if (busy || editing || !creation.items.length) return;
    if (
      creation.items.some((item) => missingPromptReferences(item.draft).length) &&
      !(await confirm(t("missingWarning"), { title: "Lutri", kind: "warning" }))
    )
      return;
    setBusy(true);
    onBusy(true);
    setIssues({});
    try {
      await submitCloudBatch();
      setSubmitted(true);
    } catch (error) {
      if (error instanceof BatchValidationError) setIssues(error.issues);
      else onError(error);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <section className="batch-draft" aria-label={b("draft")}>
      <header className="batch-draft-header">
        <h2>{b("draft")}</h2>
        <span className="muted">
          {creation.items.length} {b("items")} · {count} {b("requests")}
        </span>
      </header>
      {submitted && (
        <div className="batch-submitted" role="status">
          <span>{b("submitted")}</span>
          <button onClick={onTasks}>{b("viewTasks")} →</button>
        </div>
      )}
      <div className="batch-draft-scroll">
        {!creation.items.length && (
          <div className="empty-state">
            <ListPlusIcon size={32} weight="thin" />
            <h2>{b("empty")}</h2>
            <p>{b("emptyHint")}</p>
          </div>
        )}
        <ol className="batch-draft-list">
          {creation.items.map((item, index) => {
            const combination = combinationById(item.draft.combinationId);
            const errors = [...new Set([...validateBatchDraft(item.draft), ...(issues[item.id] ?? [])])];
            const selected = creation.editing?.id === item.id;
            const parameterSummary = combination.fields
              .filter(
                (field) =>
                  item.draft.parameters[field.key] !== undefined &&
                  ["size", "aspect_ratio", "resolution", "quality", "output_format"].includes(field.key),
              )
              .map((field) => String(item.draft.parameters[field.key]))
              .join(" · ");
            return (
              <li
                className={`batch-draft-item${selected ? " is-editing" : ""}${errors.length ? " has-error" : ""}`}
                key={item.id}
              >
                <span className="batch-item-index">{index + 1}</span>
                <div className="batch-item-content">
                  <div className="batch-item-heading">
                    <ModelIcon family={combination.family} size={18} />
                    <strong>{combination.label}</strong>
                    <span className="muted">{providerNames[combination.provider]}</span>
                    {selected && <span className="batch-editing-label">{b("editing")}</span>}
                  </div>
                  <p className="batch-item-prompt" title={displayPrompt(item.draft)}>
                    {displayPrompt(item.draft)}
                  </p>
                  <div className="batch-item-meta">
                    <span>
                      {item.draft.requestCount} {b("requests")}
                      {combination.outputCount(item.draft.parameters) > 1
                        ? ` × ${combination.outputCount(item.draft.parameters)} ${t("imageCount")}`
                        : ""}
                    </span>
                    {parameterSummary && <span>{parameterSummary}</span>}
                    {!!item.draft.references.length && (
                      <span>
                        {item.draft.references.length} {t("references")}
                      </span>
                    )}
                  </div>
                  {!!errors.length && (
                    <div className="batch-item-errors" role="alert">
                      {errors.map((error) => (
                        <p key={error}>{error}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="batch-item-actions">
                  <button
                    title={b("edit")}
                    aria-label={b("edit")}
                    disabled={busy || editing}
                    onClick={() => {
                      setIssues({});
                      void editBatchItem(item.id).catch(onError);
                    }}
                  >
                    <PencilSimpleIcon size={17} />
                  </button>
                  <button
                    title={b("copy")}
                    aria-label={b("copy")}
                    disabled={busy || editing}
                    onClick={() => void copyBatchItem(item.id)?.catch(onError)}
                  >
                    <CopyIcon size={17} />
                  </button>
                  <button
                    title={t("remove")}
                    aria-label={t("remove")}
                    disabled={busy || editing}
                    onClick={() => void removeBatchItem(item.id).catch(onError)}
                  >
                    <TrashIcon size={17} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <footer className="batch-draft-footer">
        <OutputControls kind="batchAuto" disabled={busy} onError={onError} />
        <button
          className="primary-button"
          disabled={busy || editing || !creation.items.length || !!missingDirectory}
          onClick={() => void submit().catch(onError)}
        >
          {busy ? <span className="spinner" /> : <PaperPlaneTiltIcon size={18} />}
          {busy ? t("submitting") : b("submit")}
          {count > 0 && <span>· {count}</span>}
        </button>
      </footer>
    </section>
  );
}
