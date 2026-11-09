import { useEffect, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { GalleryEntry } from "../domain/types";
import { Dialog } from "../components/Dialog";
import { Select } from "../components/Select";
import { AssetImage } from "../gallery/AssetImage";
import { t } from "../i18n";
import { lt } from "../i18n/library";
import { native } from "../services/native";
import {
  flushWrites,
  getState,
  inUseAssetIds,
  refreshGallery,
  savePreferences,
  useApplication,
} from "../services/store";
import type { CleanupReport } from "../services/cleanup";
import { settingsText as text } from "./messages";

interface LocalFile {
  entry: GalleryEntry;
  bytes: number;
  thumbnailBytes: number;
  protected: boolean;
  inUse: boolean;
  canDelete: boolean;
  automaticEligible: boolean;
  missing: boolean;
}

const defaultPolicy = { enabled: false, retentionDays: 30 };
const size = (bytes: number) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;

export function LocalResourceCleanup({
  onError,
  onView,
}: {
  onError: (error: unknown) => void;
  onView: (id: string) => void;
}) {
  const { preferences, gallery, boards } = useApplication();
  const policy = preferences.localCleanup ?? defaultPolicy;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<CleanupReport>();
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void (async () => {
      await flushWrites();
      return native<{ entries: LocalFile[]; total: number }>("local_files_query", {
        keepIds: inUseAssetIds(),
        filter,
        source,
        search,
        limit: 80,
        offset,
      });
    })()
      .then((page) => {
        if (!active) return;
        setFiles(page.entries);
        setTotal(page.total);
        if (offset && offset >= page.total) setOffset(Math.max(0, Math.ceil(page.total / 80) - 1) * 80);
      })
      .catch(onError)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, filter, source, search, offset, revision, gallery, onError]);
  const changeQuery = (change: () => void) => {
    setSelected([]);
    setOffset(0);
    setFiles([]);
    setLoading(true);
    change();
  };
  const savePolicy = (next: typeof defaultPolicy) =>
    savePreferences({ ...getState().preferences, localCleanup: next }).catch(onError);
  const deleteSelected = async () => {
    const ids = [...selected];
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      if (!(await confirm(text("cleanConfirm"), { title: text("localFiles"), kind: "warning" }))) return;
      await flushWrites();
      const result = await native<CleanupReport>("local_files_delete", { ids, keepIds: inUseAssetIds() });
      setReport(result);
      setSelected([]);
      if (result.deleted.length || result.errors.length) await refreshGallery();
      setRevision((value) => value + 1);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const reason = (value: string) =>
    value === "protected"
      ? text("protected")
      : value === "inUse"
        ? text("inUse")
        : value === "missingRecord"
          ? text("missingRecord")
          : value === "outsideManaged"
            ? text("outsideManaged")
            : value === "invalid"
              ? text("unsafe")
              : value;
  return (
    <section>
      <h2>{text("localFiles")}</h2>
      <button onClick={() => setOpen(true)}>{text("manageFiles")}</button>
      <h3>{t("cleanup")}</h3>
      <label className="settings-row">
        <span>{text("autoScope")}</span>
        <input
          type="checkbox"
          role="switch"
          checked={policy.enabled === true}
          onChange={(event) => void savePolicy({ ...policy, enabled: event.target.checked })}
        />
      </label>
      <label className="settings-row">
        <span>{text("keepDays")}</span>
        <input
          type="number"
          min={1}
          max={3650}
          step={1}
          defaultValue={policy.retentionDays}
          key={policy.retentionDays}
          onBlur={(event) => {
            const retentionDays = Number(event.target.value);
            if (Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 3650)
              void savePolicy({ ...(getState().preferences.localCleanup ?? defaultPolicy), retentionDays });
            else event.target.value = String(policy.retentionDays);
          }}
        />
      </label>
      {open && (
        <Dialog
          title={text("localFiles")}
          className="asset-picker local-files-dialog"
          onClose={() => !busy && setOpen(false)}
          footer={
            <>
              <span>
                {t("selectedCount")} · {selected.length}
              </span>
              <button
                disabled={busy || loading || !files.some((file) => file.canDelete)}
                onClick={() =>
                  setSelected((previous) => [
                    ...new Set([
                      ...previous,
                      ...files.filter((file) => file.canDelete).map((file) => file.entry.asset.id),
                    ]),
                  ])
                }
              >
                {text("selectPage")}
              </button>
              <button
                className="danger-button"
                disabled={busy || loading || !selected.length}
                onClick={() => void deleteSelected()}
              >
                {t("delete")}
              </button>
            </>
          }
        >
          <div className="local-files-content">
            <div className="button-row local-files-filters">
              <input
                aria-label={t("searchImages")}
                placeholder={t("searchImages")}
                value={search}
                onChange={(event) => {
                  if (event.target.value !== search) changeQuery(() => setSearch(event.target.value));
                }}
              />
              <Select
                aria-label={t("filters")}
                value={filter}
                onValueChange={(value) => {
                  if (value !== filter) changeQuery(() => setFilter(value));
                }}
              >
                <option value="all">{t("all")}</option>
                <option value="eligible">{text("cleanable")}</option>
                <option value="protected">{text("protected")}</option>
                <option value="inUse">{text("inUse")}</option>
              </Select>
              <Select
                aria-label={lt("kind")}
                value={source}
                onValueChange={(value) => {
                  if (value !== source) changeQuery(() => setSource(value));
                }}
              >
                <option value="all">{t("all")}</option>
                <option value="generated">{t("generated")}</option>
                <option value="imported">{lt("import")}</option>
              </Select>
            </div>
            <div className="local-files-list">
              {files.map((file, index) => {
                const entry = file.entry;
                const id = entry?.asset?.id;
                const preview = !!id && file.bytes > 0 && file.thumbnailBytes > 0 && !file.missing;
                const boardIds = Array.isArray(entry?.boardIds)
                  ? entry.boardIds.filter((board) => typeof board === "string")
                  : [];
                const labels = [
                  ...(entry?.favorite ? [t("favorites")] : []),
                  ...boardIds.map((board) => boards.find((item) => item.id === board)?.name ?? board),
                  ...(file.inUse ? [text("inUse")] : []),
                  ...(!file.canDelete && !file.protected && !file.inUse ? [text("unsafe")] : []),
                  ...(file.missing ? [t("missing")] : []),
                ];
                return (
                  <div className="local-file" key={id ?? index}>
                    <input
                      type="checkbox"
                      aria-label={id ?? text("unsafe")}
                      checked={!!id && selected.includes(id)}
                      disabled={busy || loading || !file.canDelete || !id}
                      onChange={() =>
                        id &&
                        setSelected((previous) =>
                          previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
                        )
                      }
                    />
                    <button className="local-file-preview" disabled={!preview} onClick={() => id && onView(id)}>
                      {preview ? (
                        <AssetImage entry={entry} thumbnail />
                      ) : (
                        <span>{file.missing ? t("missing") : "—"}</span>
                      )}
                    </button>
                    <div className="local-file-details">
                      <code>{id ?? "—"}</code>
                      <small>
                        {entry?.source === "generated"
                          ? t("generated")
                          : entry?.source === "imported"
                            ? lt("import")
                            : text("unsafe")}{" "}
                        · {entry?.addedAt ? new Date(entry.addedAt).toLocaleDateString() : "—"} ·{" "}
                        {size(file.bytes + file.thumbnailBytes)}
                      </small>
                      {!!labels.length && <small>{labels.join(" · ")}</small>}
                    </div>
                  </div>
                );
              })}
              {!loading && !files.length && <p>{t("noMatches")}</p>}
            </div>
            <div className="button-row">
              <button disabled={loading || busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 80))}>
                {text("previousPage")}
              </button>
              <span>
                {total ? offset + 1 : 0}–{Math.min(offset + files.length, total)} / {total}
              </span>
              <button
                disabled={loading || busy || offset + files.length >= total}
                onClick={() => setOffset(offset + 80)}
              >
                {text("nextPage")}
              </button>
            </div>
            {report && (
              <div role="status" className="local-files-report">
                <p>
                  {text("deleted")} {report.deleted.length} · {text("skipped")} {report.skipped.length} ·{" "}
                  {text("errors")} {report.errors.length}
                </p>
                {!!report.skipped.length && (
                  <ul>
                    {report.skipped.map((item) => (
                      <li key={item.id}>
                        <code>{item.id}</code> · {reason(item.reason)}
                      </li>
                    ))}
                  </ul>
                )}
                {!!report.errors.length && (
                  <ul>
                    {report.errors.map((item) => (
                      <li key={item.id}>
                        <code>{item.id}</code> · {item.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </section>
  );
}
