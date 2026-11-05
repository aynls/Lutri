import { useMemo, useState } from "react";
import { ArrowCounterClockwiseIcon, ClockCounterClockwiseIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { GenerationDraft } from "../domain/types";
import { displayPrompt } from "../domain/references";
import { ModelIcon } from "../components/ModelIcon";
import { t } from "../i18n";
import { combinationById } from "../models";
import { providerNames } from "../models/shared";
import { execute } from "../services/generation";
import { AssetImage } from "../gallery/AssetImage";
import { useApplication } from "../services/store";
import { parameterAssetIds } from "../services/parameterAssets";
import { Dialog } from "../components/Dialog";
import { RequestDetails } from "./RequestDetails";

const active = new Set(["queued", "submitting", "generating", "downloading"]);
export function History({
  initialSearch,
  onRestore,
  onView,
  onError,
}: {
  initialSearch: string;
  onRestore: (draft: GenerationDraft) => void;
  onView: (id: string) => void;
  onError: (error: unknown) => void;
}) {
  const { batches, tasks, gallery } = useApplication();
  const [search, setSearch] = useState(initialSearch),
    [status, setStatus] = useState("all"),
    [model, setModel] = useState("all");
  const [expanded, setExpanded] = useState<string>(),
    [page, setPage] = useState(1);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const assets = useMemo(() => new Map(gallery.map((entry) => [entry.asset.id, entry])), [gallery]);
  const models = [...new Set(tasks.map((task) => combinationById(task.draft.combinationId).model))];
  const query = search.trim().toLowerCase();
  const filtered = batches
    .map((batch) => ({
      batch,
      requests: batch.taskIds.map((id) => taskMap.get(id)).filter((task) => task !== undefined),
    }))
    .filter(({ requests }) =>
      requests.some((task) => {
        const combination = combinationById(task.draft.combinationId);
        return (
          (model === "all" || combination.model === model) &&
          (status === "all" ||
            (status === "active"
              ? active.has(task.status)
              : status === "failed"
                ? ["failed", "download-failed", "submission-unknown"].includes(task.status)
                : task.status === status)) &&
          (!query ||
            displayPrompt(task.draft).toLowerCase().includes(query) ||
            task.id.includes(query) ||
            task.batchId.includes(query) ||
            task.draft.references.some((reference) => reference.assetId.includes(query)) ||
            task.draft.mask?.assetId.includes(query) ||
            parameterAssetIds(task.draft.parameters).some((id) => id.includes(query)) ||
            task.results.some((result) => result.assetId?.includes(query)))
        );
      }),
    )
    .sort((a, b) => b.batch.createdAt - a.batch.createdAt);
  const detail = expanded ? taskMap.get(expanded) : undefined;
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20)),
    currentPage = Math.min(page, pageCount);
  return (
    <div className="history-workspace">
      <div className="content-toolbar history-toolbar">
        <div className="search-input">
          <MagnifyingGlassIcon />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t("searchHistory")}
            aria-label={t("searchHistory")}
          />
        </div>
        <select
          aria-label={t("allStatuses")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">{t("allStatuses")}</option>
          <option value="active">{t("activeTasks")}</option>
          <option value="completed">{t("completed")}</option>
          <option value="failed">{t("failed")}</option>
        </select>
        <select
          aria-label={t("model")}
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">{t("model")}</option>
          {models.map((id) => (
            <option key={id} value={id}>
              {
                combinationById(
                  tasks.find((task) => combinationById(task.draft.combinationId).model === id)!.draft.combinationId,
                ).label
              }
            </option>
          ))}
        </select>
        <span className="muted">
          {filtered.length} {t("batch")}
        </span>
      </div>
      <div className="history-scroll">
        {filtered.slice((currentPage - 1) * 20, currentPage * 20).map(({ batch, requests }) => (
          <section className="history-batch" key={batch.id}>
            <header>
              <div>
                <strong>{new Date(batch.createdAt).toLocaleString()}</strong>
                <small>
                  {batch.origin === "mcp" ? "MCP" : t("creation")} · {requests.length} {t("request")}
                </small>
              </div>
              <span className="muted">
                {requests.reduce(
                  (sum, task) => sum + task.results.filter((result) => result.status === "saved").length,
                  0,
                )}{" "}
                {t("saved")}
              </span>
            </header>
            {requests.map((task, index) => {
              const combination = combinationById(task.draft.combinationId);
              const busy = active.has(task.status);
              return (
                <div className="history-task" key={task.id}>
                  <span className="request-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="history-info">
                    <div className="history-task-heading">
                      <ModelIcon family={combination.family} size={20} />
                      <strong>{combination.label}</strong>
                      <span className="muted">{providerNames[combination.provider]}</span>
                      <span className={`status-badge status-${task.status}`}>
                        {busy && <span className="status-dot" />}
                        {t(task.status)}
                      </span>
                    </div>
                    <p className="history-prompt">{displayPrompt(task.draft)}</p>
                    <div className="history-task-actions">
                      <button onClick={() => setExpanded(task.id)}>{t("details")}</button>
                      <button onClick={() => onRestore(task.draft)}>
                        <ArrowCounterClockwiseIcon />
                        {t("restore")}
                      </button>
                      {!busy && task.status !== "completed" && (
                        <button className="result-retry" onClick={() => void execute(task.id).catch(onError)}>
                          {t("retry")}
                        </button>
                      )}
                      <small>
                        {task.results.filter((result) => result.status === "saved").length} / {task.results.length}{" "}
                        {t("results")}
                      </small>
                    </div>
                    {task.error && <p className="error-text">{task.error}</p>}
                  </div>
                  <div className="history-images">
                    {task.results.map((result) => {
                      const entry = result.assetId ? assets.get(result.assetId) : undefined;
                      return (
                        <button
                          key={result.id}
                          disabled={!entry}
                          onClick={() => entry && onView(entry.asset.id)}
                          title={result.error ?? t(result.status)}
                        >
                          {entry ? (
                            <AssetImage entry={entry} thumbnail />
                          ) : (
                            <span className="missing-image">{result.assetId ? t("missing") : t(result.status)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        {!filtered.length && (
          <div className="empty-state">
            <ClockCounterClockwiseIcon size={32} weight="thin" />
            <p>{t("emptyHistory")}</p>
          </div>
        )}
      </div>
      {pageCount > 1 && (
        <div className="pagination">
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
            ←
          </button>
          <span>
            {currentPage} / {pageCount}
          </span>
          <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
            →
          </button>
        </div>
      )}
      {detail && (
        <Dialog
          title={t("request")}
          onClose={() => setExpanded(undefined)}
          className="request-dialog"
          footer={
            <>
              <button onClick={() => setExpanded(undefined)}>{t("close")}</button>
              <button
                className="primary-button"
                onClick={() => {
                  onRestore(detail.draft);
                  setExpanded(undefined);
                }}
              >
                {t("restore")}
              </button>
            </>
          }
        >
          <RequestDetails task={detail} onView={onView} onError={onError} />
        </Dialog>
      )}
    </div>
  );
}
