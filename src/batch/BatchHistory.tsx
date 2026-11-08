import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  InfoIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import type { GalleryEntry, GenerationDraft, GenerationTask } from "../domain/types";
import { displayPrompt } from "../domain/references";
import { Dialog } from "../components/Dialog";
import { Select } from "../components/Select";
import { ModelIcon } from "../components/ModelIcon";
import { AssetImage } from "../gallery/AssetImage";
import { RequestDetails } from "../history/RequestDetails";
import { t } from "../i18n";
import { combinationById } from "../models";
import { providerNames } from "../models/shared";
import { useApplication } from "../services/store";
import { native } from "../services/native";
import { b } from "./messages";
import { cloudSummary, failedDrafts } from "./service";

export function BatchHistory({
  initialSearch,
  onError,
  onView,
  onRestore,
  onRequeue,
}: {
  initialSearch: string;
  onError: (error: unknown) => void;
  onView: (id: string, ids?: string[]) => void;
  onRestore: (draft: GenerationDraft) => void;
  onRequeue: (drafts: GenerationDraft[]) => void;
}) {
  const { batches, tasks, gallery } = useApplication();
  const [query, setQuery] = useState(initialSearch);
  const [status, setStatus] = useState("all");
  const [model, setModel] = useState("all");
  const [provider, setProvider] = useState("all");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string>();
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  useEffect(() => {
    setQuery(initialSearch);
    setPage(1);
  }, [initialSearch]);
  const taskMap = useMemo(
    () => new Map(tasks.filter((task) => !task.historyDeletedAt).map((task) => [task.id, task])),
    [tasks],
  );
  const rows = useMemo(
    () =>
      batches
        .filter((batch) => batch.cloud)
        .map((batch) => {
          const requests = batch.taskIds.map((id) => taskMap.get(id)).filter((task): task is GenerationTask => !!task);
          return { batch, requests, summary: cloudSummary(batch, requests) };
        })
        .filter((row) => row.requests.length)
        .sort((a, b) => b.batch.createdAt - a.batch.createdAt),
    [batches, taskMap],
  );
  const models = [
    ...new Map(
      rows.flatMap(({ requests }) =>
        requests.map((task) => {
          const combination = combinationById(task.draft.combinationId);
          return [combination.model, combination.label] as const;
        }),
      ),
    ).entries(),
  ];
  const search = query.trim().toLowerCase();
  const filtered = rows.filter(({ batch, requests, summary }) => {
    if (since && batch.createdAt < new Date(`${since}T00:00:00`).getTime()) return false;
    if (until && batch.createdAt > new Date(`${until}T23:59:59.999`).getTime()) return false;
    if (status !== "all") {
      if (
        status === "active" &&
        !["prepared", "uploading", "submitting", "queued", "running", "retrieving", "cancelling"].includes(summary)
      )
        return false;
      if (
        status === "error" &&
        ![
          "partial",
          "partial-submission",
          "failed",
          "submission-failed",
          "submission-unknown",
          "retrieval-failed",
          "expired",
        ].includes(summary)
      )
        return false;
      if (!["active", "error"].includes(status) && summary !== status) return false;
    }
    return requests.some((task) => {
      const combination = combinationById(task.draft.combinationId);
      return (
        (model === "all" || model === combination.model) &&
        (provider === "all" || provider === combination.provider) &&
        (!search ||
          displayPrompt(task.draft).toLowerCase().includes(search) ||
          batch.id.includes(search) ||
          task.id.includes(search) ||
          task.draft.references.some((ref) => ref.assetId.includes(search)) ||
          task.draft.mask?.assetId.includes(search) ||
          task.results.some((result) => result.assetId?.includes(search)))
      );
    });
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const shown = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const ids = [
    ...new Set(
      shown.flatMap(({ batch, requests }) =>
        batch.cloud!.items.flatMap((item) =>
          requests
            .filter((task) => task.draftItemId === item.id)
            .slice(0, visibleCounts[item.id] ?? 20)
            .flatMap((task) => task.results.flatMap((result) => (result.assetId ? [result.assetId] : []))),
        ),
      ),
    ),
  ];
  const assetKey = JSON.stringify(ids);
  useEffect(() => {
    let active = true;
    if (!JSON.parse(assetKey).length) {
      setEntries([]);
      return;
    }
    void native<GalleryEntry[]>("gallery_entries", { ids: JSON.parse(assetKey) })
      .then((value) => {
        if (active) setEntries(value);
      })
      .catch((error) => errorHandler.current(error));
    return () => {
      active = false;
    };
  }, [assetKey, gallery]);
  const assets = new Map([...gallery, ...entries].map((entry) => [entry.asset.id, entry]));
  const detailTask = detail ? taskMap.get(detail) : undefined;
  return (
    <div className="history-workspace">
      <div className="content-toolbar history-toolbar">
        <div className="search-input">
          <MagnifyingGlassIcon />
          <input
            aria-label={t("searchHistory")}
            placeholder={t("searchHistory")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          aria-label={t("allStatuses")}
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <option value="all">{t("allStatuses")}</option>
          <option value="active">{t("activeTasks")}</option>
          <option value="error">{b("error")}</option>
          <option value="completed">{t("completed")}</option>
          <option value="cancelled">{b("cancelled")}</option>
        </Select>
        <Select
          aria-label={t("model")}
          value={model}
          onValueChange={(value) => {
            setModel(value);
            setPage(1);
          }}
        >
          <option value="all">{t("model")}</option>
          {models.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t("provider")}
          value={provider}
          onValueChange={(value) => {
            setProvider(value);
            setPage(1);
          }}
        >
          <option value="all">{t("provider")}</option>
          <option value="google">Google</option>
          <option value="openai">OpenAI</option>
        </Select>
        <input
          className="history-filter-date"
          type="date"
          aria-label={b("since")}
          title={b("since")}
          value={since}
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
          value={until}
          onChange={(event) => {
            setUntil(event.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="history-scroll">
        {!shown.length && (
          <div className="empty-state">
            <ListChecksIcon size={32} weight="thin" />
            <p>{b("emptyHistory")}</p>
          </div>
        )}
        {shown.map(({ batch, requests, summary }) => {
          const groups = batch.cloud!.groups;
          const failed = failedDrafts(batch, requests);
          const saved = requests.reduce((sum, task) => sum + task.results.filter((result) => result.assetId).length, 0);
          const processed = groups.every((group) => group.processed !== undefined)
            ? groups.reduce((sum, group) => sum + group.processed!, 0)
            : undefined;
          const images = requests.flatMap((task) =>
            task.results.flatMap((result) => (result.assetId ? [result.assetId] : [])),
          );
          return (
            <section className="history-batch cloud-batch" key={batch.id}>
              <header>
                <div className="history-batch-heading">
                  <span>
                    <strong>{new Date(batch.createdAt).toLocaleString()}</strong>
                    <small>
                      {batch.cloud!.items.length} {b("items")} · {requests.length} {b("requests")} · {saved}{" "}
                      {t("saved")}
                    </small>
                  </span>
                </div>
                <span className={`status-badge status-${summary}`}>{b(summary)}</span>
                {processed !== undefined && (
                  <span className="cloud-batch-summary">
                    {b("processed")} {processed}/{requests.length}
                  </span>
                )}
              </header>
              {batch.cloud!.items.map((item, index) => {
                const combination = combinationById(item.draft.combinationId);
                const children = requests.filter((task) => task.draftItemId === item.id);
                const count = visibleCounts[item.id] ?? 20;
                return (
                  <div className="cloud-item" key={item.id}>
                    <div className="cloud-item-heading">
                      <span className="muted">{index + 1}</span>
                      <ModelIcon family={combination.family} size={18} />
                      <strong>{combination.label}</strong>
                      <span className="muted">{providerNames[combination.provider]}</span>
                      <span>
                        {children.length} {b("requests")}
                      </span>
                      <button title={b("requeue")} aria-label={b("requeue")} onClick={() => onRequeue([item.draft])}>
                        <PlusIcon size={16} />
                      </button>
                    </div>
                    <p className="batch-item-prompt cloud-item-prompt">{displayPrompt(item.draft)}</p>
                    {children.slice(0, count).map((task, taskIndex) => (
                      <div className="history-task" key={task.id}>
                        <div className="history-info">
                          <div className="history-task-heading">
                            <span className="muted">
                              {t("request")} {taskIndex + 1}
                            </span>
                            <span className={`status-badge status-${task.status}`}>{t(task.status)}</span>
                          </div>
                          <div className="history-meta">
                            <span>
                              {task.results.filter((result) => result.assetId).length} {t("saved")}
                            </span>
                            <div className="history-task-actions">
                              <button title={t("details")} aria-label={t("details")} onClick={() => setDetail(task.id)}>
                                <InfoIcon size={16} />
                              </button>
                              <button
                                title={t("restore")}
                                aria-label={t("restore")}
                                onClick={() => onRestore({ ...task.draft, requestCount: 1 })}
                              >
                                <ArrowCounterClockwiseIcon size={16} />
                              </button>
                            </div>
                          </div>
                          {task.error && <p className="error-text">{task.error}</p>}
                        </div>
                        {!!task.results.length && (
                          <div className="history-images">
                            {task.results.map((result) => {
                              const entry = result.assetId ? assets.get(result.assetId) : undefined;
                              return (
                                <button
                                  key={result.id}
                                  disabled={!entry}
                                  title={result.error ?? t("results")}
                                  onClick={() => entry && onView(entry.asset.id, images)}
                                >
                                  {entry ? (
                                    <AssetImage entry={entry} thumbnail />
                                  ) : (
                                    <span className="missing-image">{t("missing")}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                    {children.length > count && (
                      <button onClick={() => setVisibleCounts((value) => ({ ...value, [item.id]: count + 20 }))}>
                        + {Math.min(20, children.length - count)} {b("requests")}
                      </button>
                    )}
                  </div>
                );
              })}
              {failed.length > 0 && (
                <div className="cloud-batch-details">
                  <button onClick={() => onRequeue(failed.map((item) => item.draft))}>
                    {b("failedOnly")} · {failed.reduce((sum, item) => sum + item.draft.requestCount, 0)}
                  </button>
                </div>
              )}
              <details className="cloud-batch-details">
                <summary>
                  {b("remoteGroups")} · {groups.length}
                </summary>
                {groups.map((group) => (
                  <div className="cloud-group" key={group.id}>
                    <span>
                      {providerNames[group.provider]} · {group.model} · {b(group.status)}
                    </span>
                    <code>{group.remoteId ?? group.id}</code>
                    {group.error && <p className="error-text">{group.error}</p>}
                  </div>
                ))}
              </details>
            </section>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="pagination">
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
            ←
          </button>
          <span>
            {currentPage}/{pages}
          </span>
          <button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>
            →
          </button>
        </div>
      )}
      {detailTask && (
        <Dialog
          title={t("request")}
          className="request-dialog"
          onClose={() => setDetail(undefined)}
          footer={
            <>
              <button onClick={() => setDetail(undefined)}>{t("close")}</button>
              <button
                className="primary-button"
                onClick={() => {
                  onRestore({ ...detailTask.draft, requestCount: 1 });
                  setDetail(undefined);
                }}
              >
                {t("restore")}
              </button>
            </>
          }
        >
          <RequestDetails
            task={detailTask}
            onView={(id) =>
              onView(
                id,
                detailTask.results.flatMap((result) => (result.assetId ? [result.assetId] : [])),
              )
            }
            onError={onError}
          />
        </Dialog>
      )}
    </div>
  );
}
