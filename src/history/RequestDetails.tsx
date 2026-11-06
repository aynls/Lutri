import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "@phosphor-icons/react";
import type { GalleryEntry, GenerationTask } from "../domain/types";
import { displayPrompt } from "../domain/references";
import { combinationById } from "../models";
import { providerNames } from "../models/shared";
import { t } from "../i18n";
import { useApplication } from "../services/store";
import { AssetImage } from "../gallery/AssetImage";
import { CopyButton } from "../components/CopyButton";
import { taskText } from "../i18n/tasks";
import { TaskUsage } from "./TaskUsage";
import { retryResultExport } from "../services/generation";
import { native } from "../services/native";

export function RequestDetails({
  task,
  onView,
  onError,
}: {
  task: GenerationTask;
  onView: (id: string) => void;
  onError: (error: unknown) => void;
}) {
  const { gallery: cached } = useApplication();
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const gallery = [...new Map([...cached, ...entries].map((entry) => [entry.asset.id, entry])).values()];
  const assetKey = JSON.stringify([
    ...new Set([
      ...task.draft.references.map((reference) => reference.assetId),
      ...task.results.flatMap((result) => (result.assetId ? [result.assetId] : [])),
    ]),
  ]);
  useEffect(() => {
    let current = true;
    void native<GalleryEntry[]>("gallery_entries", { ids: JSON.parse(assetKey) })
      .then((value) => {
        if (current) setEntries(value);
      })
      .catch((error) => errorHandler.current(error));
    return () => {
      current = false;
    };
  }, [assetKey, cached]);
  const combination = combinationById(task.draft.combinationId);
  return (
    <div className="request-details">
      <dl className="metadata-grid">
        <dt>{t("model")}</dt>
        <dd>{combination.label}</dd>
        <dt>{t("provider")}</dt>
        <dd>{providerNames[combination.provider]}</dd>
        <dt>{t("request")}</dt>
        <dd>
          <code>{task.id}</code>
          <CopyButton value={task.id} onError={onError} />
        </dd>
        <dt>{t("results")}</dt>
        <dd>
          {task.results.filter((result) => result.status === "saved").length} / {task.results.length}
        </dd>
        {(task.providerTaskId ?? task.recovery?.remoteId) && (
          <>
            <dt>{taskText("providerTask")}</dt>
            <dd>
              <code>{task.providerTaskId ?? task.recovery?.remoteId}</code>
              <CopyButton value={task.providerTaskId ?? task.recovery!.remoteId} onError={onError} />
            </dd>
          </>
        )}
        {task.httpStatus !== undefined && (
          <>
            <dt>HTTP</dt>
            <dd>{task.httpStatus}</dd>
          </>
        )}
      </dl>
      <TaskUsage task={task} />
      {typeof task.draft.parameters.seed === "number" && (
        <p className="muted">
          {taskText("requestedSeed")} · {task.draft.parameters.seed}
        </p>
      )}
      <section>
        <div className="section-heading">
          <span>{t("prompt")}</span>
          <CopyButton value={displayPrompt(task.draft)} title={t("copyPrompt")} onError={onError} />
        </div>
        <p className="full-prompt">{displayPrompt(task.draft)}</p>
      </section>
      {!!task.draft.references.length && (
        <section>
          <h3>{t("references")}</h3>
          <div className="detail-images">
            {task.draft.references.map((reference) => {
              const entry = gallery.find((value) => value.asset.id === reference.assetId);
              return (
                <div key={reference.id}>
                  <button
                    className="image-button"
                    aria-label={reference.name}
                    disabled={!entry}
                    onClick={() => onView(reference.assetId)}
                  >
                    {entry ? (
                      <AssetImage entry={entry} thumbnail />
                    ) : (
                      <span className="missing-image">{t("missing")}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {!!task.draft.regions.length && (
        <details>
          <summary>{t("regions")}</summary>
          <pre>{JSON.stringify(task.draft.regions, null, 2)}</pre>
        </details>
      )}
      {task.draft.mask && (
        <details>
          <summary>{t("mask")}</summary>
          <code>{task.draft.mask.assetId}</code>
        </details>
      )}
      {!!task.results.length && (
        <section>
          <h3>{t("results")}</h3>
          <div className="detail-images">
            {task.results.map((result) => {
              const entry = gallery.find((value) => value.asset.id === result.assetId);
              return (
                <div key={result.id}>
                  <button className="image-button" disabled={!entry} onClick={() => entry && onView(entry.asset.id)}>
                    {entry ? (
                      <AssetImage entry={entry} thumbnail />
                    ) : (
                      <span className="missing-image">
                        <ImageIcon size={20} />
                      </span>
                    )}
                  </button>
                  {result.status === "downloading" && <span>{t("downloading")}</span>}
                  {result.error && <p className="error-text">{result.error}</p>}
                  <TaskUsage task={task} result={result} />
                  {result.exportError && (
                    <>
                      <p className="error-text">{result.exportError}</p>
                      <button onClick={() => void retryResultExport(task.id, result.id).catch(onError)}>
                        {taskText("retryExport")}
                      </button>
                    </>
                  )}
                  {result.metadata && Object.keys(result.metadata).length > 0 && (
                    <details>
                      <summary>{t("details")}</summary>
                      <pre>{JSON.stringify(result.metadata, null, 2)}</pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {task.metadata && Object.keys(task.metadata).length > 0 && (
        <details>
          <summary>{t("details")}</summary>
          <pre>{JSON.stringify(task.metadata, null, 2)}</pre>
        </details>
      )}
      {task.error && (
        <details open>
          <summary>{taskText("diagnostics")}</summary>
          <pre className="error-text">{task.error}</pre>
        </details>
      )}
    </div>
  );
}
