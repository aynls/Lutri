import { useEffect, useMemo, useRef, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { ArrowCounterClockwiseIcon, ClockCounterClockwiseIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft, GenerationTask } from "../domain/types";
import { displayPrompt } from "../domain/references";
import { ModelIcon } from "../components/ModelIcon";
import { t } from "../i18n";
import { combinationById } from "../models";
import { providerNames } from "../models/shared";
import { execute, cancelBatch } from "../services/generation";
import { AssetImage } from "../gallery/AssetImage";
import { useApplication } from "../services/store";
import { parameterAssetIds } from "../services/parameterAssets";
import { Dialog } from "../components/Dialog";
import { RequestDetails } from "./RequestDetails";
import { canDeleteHistory, deleteHistory } from "../services/history";
import { taskText, taskStatusLabel } from "../i18n/tasks";
import { BatchUsage, TaskUsage } from "./TaskUsage";
import { native } from "../services/native";

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
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const [search, setSearch] = useState(initialSearch),
    [status, setStatus] = useState("all"),
    [model, setModel] = useState("all");
  const [expanded, setExpanded] = useState<string>(),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]),
    [deleting, setDeleting] = useState(false),
    [notice, setNotice] = useState("");
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const [pageAssets, setPageAssets] = useState<GalleryEntry[]>([]);
  const assets = useMemo(
    () => new Map([...gallery, ...pageAssets].map((entry) => [entry.asset.id, entry])),
    [gallery, pageAssets],
  );
  const models = [
    ...new Set(
      tasks.filter((task) => !task.historyDeletedAt).map((task) => combinationById(task.draft.combinationId).model),
    ),
  ];
  const query = search.trim().toLowerCase();
  const filtered = batches
    .map((batch) => ({
      batch,
      requests: batch.taskIds
        .map((id) => taskMap.get(id))
        .filter((task): task is GenerationTask => task !== undefined && !task.historyDeletedAt),
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
  const pageRequests = filtered.slice((currentPage - 1) * 20, currentPage * 20).flatMap(({ requests }) => requests);
  const assetKey = JSON.stringify([
    ...new Set(
      pageRequests.flatMap((task) => [
        ...task.draft.references.map((reference) => reference.assetId),
        ...(task.draft.mask ? [task.draft.mask.assetId] : []),
        ...task.results.flatMap((result) => (result.assetId ? [result.assetId] : [])),
      ]),
    ),
  ]);
  useEffect(() => {
    let current = true;
    void native<GalleryEntry[]>("gallery_entries", { ids: JSON.parse(assetKey) })
      .then((entries) => {
        if (current) setPageAssets(entries);
      })
      .catch((error) => errorHandler.current(error));
    return () => {
      current = false;
    };
  }, [assetKey, gallery]);
  const visible = new Set(filtered.flatMap(({ requests }) => requests.map((task) => task.id)));
  const selection = selected.filter((id) => visible.has(id));
  const selectedDeletable = selection.filter((id) => {
    const task = taskMap.get(id);
    return task && canDeleteHistory(task);
  }).length;
  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const remove = async (ids: string[]) => {
    if (deleting) return;
    const count = ids.filter((id) => {
      const task = taskMap.get(id);
      return task && canDeleteHistory(task);
    }).length;
    if (
      !count ||
      !(await confirm(
        `${taskText("deleteConfirmation")}\n${taskText("deletable")}: ${count} · ${taskText("skipped")}: ${ids.length - count}`,
        { title: taskText("deleteHistory"), kind: "warning", okLabel: t("delete"), cancelLabel: t("cancel") },
      ))
    )
      return;
    setDeleting(true);
    try {
      const result = await deleteHistory(ids);
      setNotice(`${t("delete")}: ${result.deleted} · ${taskText("skipped")}: ${result.skipped}`);
      setSelected((current) => current.filter((id) => !ids.includes(id)));
      if (expanded && ids.includes(expanded)) setExpanded(undefined);
    } finally {
      setDeleting(false);
    }
  };
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
          <option value="cancelled">{taskText("cancelled")}</option>
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
        <button onClick={() => setSelected(selection.length === visible.size ? [] : [...visible])}>
          {selection.length ? `${taskText("selecting")} ${selection.length}` : t("selectAll")}
        </button>
        {selection.length > 0 && (
          <button
            className="danger-button"
            disabled={deleting || !selectedDeletable}
            onClick={() => void remove(selection).catch(onError)}
          >
            {taskText("deleteSelected")} · {selectedDeletable}
          </button>
        )}
        {notice && (
          <span role="status" className="muted">
            {notice}
          </span>
        )}
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
              <BatchUsage tasks={requests} />
              <div className="history-batch-actions">
                {requests.some((task) => task.status === "queued") && (
                  <button onClick={() => void cancelBatch(batch.id).catch(onError)}>{taskText("stopQueued")}</button>
                )}
                <button
                  disabled={deleting || !requests.every(canDeleteHistory)}
                  onClick={() => void remove(requests.map((task) => task.id)).catch(onError)}
                >
                  {t("delete")}
                </button>
              </div>
            </header>
            {requests.map((task, index) => {
              const combination = combinationById(task.draft.combinationId);
              const busy = active.has(task.status);
              return (
                <div className="history-task" key={task.id}>
                  <label className="request-index">
                    <input
                      type="checkbox"
                      aria-label={`${taskText("select")} ${task.id}`}
                      checked={selection.includes(task.id)}
                      onChange={() => toggle(task.id)}
                    />
                    {String(index + 1).padStart(2, "0")}
                  </label>
                  <div className="history-info">
                    <div className="history-task-heading">
                      <ModelIcon family={combination.family} size={20} />
                      <strong>{combination.label}</strong>
                      <span className="muted">{providerNames[combination.provider]}</span>
                      <span className={`status-badge status-${task.status}`}>
                        {busy && <span className="status-dot" />}
                        {taskStatusLabel(task.status)}
                      </span>
                    </div>
                    <p className="history-prompt">{displayPrompt(task.draft)}</p>
                    <TaskUsage task={task} compact />
                    <div className="history-task-actions">
                      <button onClick={() => setExpanded(task.id)}>{t("details")}</button>
                      <button onClick={() => onRestore(task.draft)}>
                        <ArrowCounterClockwiseIcon />
                        {t("restore")}
                      </button>
                      {!busy && !["completed", "cancelled"].includes(task.status) && (
                        <button className="result-retry" onClick={() => void execute(task.id).catch(onError)}>
                          {t("retry")}
                        </button>
                      )}
                      <button
                        disabled={deleting || !canDeleteHistory(task)}
                        onClick={() => void remove([task.id]).catch(onError)}
                      >
                        {t("delete")}
                      </button>
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
