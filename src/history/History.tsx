import { Select } from "../components/Select";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  ArrowCounterClockwiseIcon,
  ClockCounterClockwiseIcon,
  ImageIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft, GenerationTask } from "../domain/types";
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
import { canDeleteHistory, deleteHistory } from "../services/history";
import { taskText } from "../i18n/tasks";
import { BatchUsage, TaskUsage } from "./TaskUsage";
import { native } from "../services/native";
import { b } from "../batch/messages";
import { taskUsesAsset, type RelatedHistoryScope } from "./related";

const active = new Set(["queued", "submitting", "generating", "downloading"]);
export function History({
  related,
  onRestore,
  onView,
  onError,
}: {
  related?: RelatedHistoryScope;
  onRestore: (draft: GenerationDraft) => void;
  onView: (id: string, ids?: string[]) => void;
  onError: (error: unknown) => void;
}) {
  const { batches, tasks, gallery } = useApplication();
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [model, setModel] = useState("all");
  const [provider, setProvider] = useState("all");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [expanded, setExpanded] = useState<string>(),
    [page, setPage] = useState(1);
  const [relatedPage, setRelatedPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]),
    [deleting, setDeleting] = useState(false),
    [notice, setNotice] = useState("");
  useLayoutEffect(() => {
    setRelatedPage(1);
    setSelected([]);
    setExpanded(undefined);
    setNotice("");
  }, [related?.nonce]);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const [pageAssets, setPageAssets] = useState<GalleryEntry[]>([]);
  const assets = useMemo(
    () => new Map([...gallery, ...pageAssets].map((entry) => [entry.asset.id, entry])),
    [gallery, pageAssets],
  );
  const models = [
    ...new Set(
      tasks
        .filter((task) => !task.cloudGroupId && !task.historyDeletedAt)
        .map((task) => combinationById(task.draft.combinationId).model),
    ),
  ];
  const query = search.trim().toLowerCase();
  const filtered = batches
    .filter((batch) => !batch.cloud)
    .filter(
      (batch) =>
        !!related ||
        ((!since || batch.createdAt >= new Date(`${since}T00:00:00`).getTime()) &&
          (!until || batch.createdAt <= new Date(`${until}T23:59:59.999`).getTime())),
    )
    .map((batch) => ({
      batch,
      requests: batch.taskIds
        .map((id) => taskMap.get(id))
        .filter((task): task is GenerationTask => task !== undefined && !task.historyDeletedAt),
    }))
    .filter(({ requests }) =>
      requests.some((task) => {
        if (related) return taskUsesAsset(task, related.assetId);
        const combination = combinationById(task.draft.combinationId);
        return (
          (model === "all" || combination.model === model) &&
          (provider === "all" || combination.provider === provider) &&
          (status === "all" ||
            (status === "active"
              ? active.has(task.status)
              : status === "failed"
                ? ["failed", "retrieval-failed", "download-failed", "submission-unknown"].includes(task.status)
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
    currentPage = Math.min(related ? relatedPage : page, pageCount);
  const pageRequests = filtered.slice((currentPage - 1) * 20, currentPage * 20).flatMap(({ requests }) => requests);
  const assetKey = JSON.stringify([
    ...new Set(
      pageRequests.flatMap((task) => [
        ...task.draft.references.map((reference) => reference.assetId),
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
            value={related?.assetId ?? search}
            readOnly={!!related}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t("searchHistory")}
            aria-label={t("searchHistory")}
          />
        </div>
        <Select
          aria-label={t("allStatuses")}
          value={related ? "all" : status}
          disabled={!!related}
          onValueChange={(nextValue) => {
            setStatus(nextValue);
            setPage(1);
          }}
        >
          <option value="all">{t("allStatuses")}</option>
          <option value="active">{t("activeTasks")}</option>
          <option value="completed">{t("completed")}</option>
          <option value="failed">{t("failed")}</option>
          <option value="cancelled">{taskText("cancelled")}</option>
        </Select>
        <Select
          aria-label={t("model")}
          value={related ? "all" : model}
          disabled={!!related}
          onValueChange={(nextValue) => {
            setModel(nextValue);
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
        </Select>
        <Select
          aria-label={t("provider")}
          value={related ? "all" : provider}
          disabled={!!related}
          onValueChange={(value) => {
            setProvider(value);
            setPage(1);
          }}
        >
          <option value="all">{t("provider")}</option>
          {[
            ...new Set(
              tasks
                .filter((task) => !task.cloudGroupId && !task.historyDeletedAt)
                .map((task) => combinationById(task.draft.combinationId).provider),
            ),
          ].map((id) => (
            <option key={id} value={id}>
              {providerNames[id]}
            </option>
          ))}
        </Select>
        <input
          className="history-filter-date"
          type="date"
          aria-label={b("since")}
          title={b("since")}
          value={related ? "" : since}
          disabled={!!related}
          onChange={(event) => {
            setSince(event.target.value);
            setPage(1);
          }}
        />
        <input
          className="history-filter-date"
          type="date"
          aria-label={b("until")}
          title={b("until")}
          value={related ? "" : until}
          disabled={!!related}
          onChange={(event) => {
            setUntil(event.target.value);
            setPage(1);
          }}
        />
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
              <div className="history-batch-heading">
                <span>
                  <strong>{new Date(batch.createdAt).toLocaleString()}</strong>
                  <small>
                    {batch.origin === "mcp" ? "MCP" : t("creation")} · {requests.length} {t("request")} ·{" "}
                    {requests.reduce(
                      (sum, task) => sum + task.results.filter((result) => result.status === "saved").length,
                      0,
                    )}{" "}
                    {t("saved")}
                  </small>
                </span>
              </div>
              <BatchUsage tasks={requests} />
            </header>
            {requests.map((task) => {
              const combination = combinationById(task.draft.combinationId);
              const busy = active.has(task.status);
              const resultIds = task.results.flatMap((result) => {
                const entry = result.assetId ? assets.get(result.assetId) : undefined;
                return entry && entry.availability !== "missing" ? [entry.asset.id] : [];
              });
              return (
                <div
                  className="history-task"
                  key={task.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button, input")) return;
                    const selection = window.getSelection();
                    if (selection && !selection.isCollapsed) return;
                    setExpanded(task.id);
                  }}
                >
                  <input
                    type="checkbox"
                    className="task-select"
                    aria-label={`${taskText("select")} ${task.id}`}
                    checked={selection.includes(task.id)}
                    onChange={() => toggle(task.id)}
                  />
                  <div className="history-info">
                    <div className="history-task-heading">
                      <ModelIcon family={combination.family} size={18} />
                      <strong>{combination.label}</strong>
                      <span className="muted">{providerNames[combination.provider]}</span>
                      {busy && <span className="spinner" />}
                      <span className={`status-badge status-${task.status}`}>{t(task.status)}</span>
                    </div>
                    <p className="history-prompt" title={displayPrompt(task.draft)}>
                      {displayPrompt(task.draft)}
                    </p>
                    <div className="history-meta">
                      <TaskUsage task={task} compact />
                      {!!task.results.length && (
                        <span>
                          {task.results.filter((result) => result.status === "saved").length} / {task.results.length}{" "}
                          {t("results")}
                        </span>
                      )}
                      <div className="history-task-actions">
                        <button title={t("details")} aria-label={t("details")} onClick={() => setExpanded(task.id)}>
                          <InfoIcon size={15} />
                        </button>
                        <button title={t("restore")} aria-label={t("restore")} onClick={() => onRestore(task.draft)}>
                          <ArrowCounterClockwiseIcon size={15} />
                        </button>
                        {!busy && !["completed", "cancelled"].includes(task.status) && (
                          <button
                            title={t("retry")}
                            aria-label={t("retry")}
                            onClick={() => void execute(task.id).catch(onError)}
                          >
                            <PlayIcon size={15} />
                          </button>
                        )}
                        <button
                          className="task-delete"
                          title={t("delete")}
                          aria-label={t("delete")}
                          disabled={deleting || !canDeleteHistory(task)}
                          onClick={() => void remove([task.id]).catch(onError)}
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </div>
                    {task.error && (
                      <p className="error-text" title={task.error}>
                        {task.error}
                      </p>
                    )}
                  </div>
                  {!!task.results.length && (
                    <div className="history-images">
                      {task.results.slice(0, 4).map((result) => {
                        const entry = result.assetId ? assets.get(result.assetId) : undefined;
                        return (
                          <button
                            key={result.id}
                            disabled={!entry || entry.availability === "missing"}
                            onClick={() => entry && onView(entry.asset.id, resultIds)}
                            title={result.error}
                          >
                            {entry ? (
                              <AssetImage entry={entry} thumbnail />
                            ) : (
                              <span className="missing-image">
                                <ImageIcon size={20} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {task.results.length > 4 && (
                        <button className="history-images-more" onClick={() => setExpanded(task.id)}>
                          +{task.results.length - 4}
                        </button>
                      )}
                    </div>
                  )}
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
          <button
            disabled={currentPage === 1}
            onClick={() => (related ? setRelatedPage(currentPage - 1) : setPage(currentPage - 1))}
          >
            ←
          </button>
          <span>
            {currentPage} / {pageCount}
          </span>
          <button
            disabled={currentPage === pageCount}
            onClick={() => (related ? setRelatedPage(currentPage + 1) : setPage(currentPage + 1))}
          >
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
          <RequestDetails task={detail} onView={onView} onError={onError} groupResults />
        </Dialog>
      )}
    </div>
  );
}
