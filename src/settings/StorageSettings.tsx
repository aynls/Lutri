import { useEffect, useState } from "react";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { native } from "../services/native";
import { refreshGallery, useApplication } from "../services/store";
import { t } from "../i18n";
import { lt } from "../i18n/library";
import { settingsText as text } from "./messages";
import "./storage.css";

interface Stats {
  directory: string;
  available: boolean;
  count: number;
  bytes: number;
  thumbnailBytes: number;
  missing: number;
}
const bytes = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value / 1024 / 1024) + " MB";
export function StorageSettings({ onError }: { onError: (error: unknown) => void }) {
  const { tasks, gallery } = useApplication();
  const [stats, setStats] = useState<Stats>(),
    [busy, setBusy] = useState(false),
    [missing, setMissing] = useState<string[]>([]);
  const reload = async () => setStats(await native<Stats>("library_stats"));
  useEffect(() => {
    void reload().catch(onError);
  }, [gallery]);
  const attempt = (action: () => Promise<unknown>) => {
    setBusy(true);
    void action()
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const running = tasks.some((task) => ["queued", "submitting", "generating", "downloading"].includes(task.status));
  return (
    <section className="storage-settings">
      <h2>{lt("storage")}</h2>
      <div className="storage-group">
        <label>
          {lt("library")}
          <code className="path-value">{stats?.directory ?? "…"}</code>
        </label>
        {stats && (
          <p className="muted">
            {stats.available
              ? `${text("indexedAssets")} ${stats.count} · ${bytes(stats.bytes)} + ${bytes(stats.thumbnailBytes)} · ${t("missing")} ${stats.missing}`
              : lt("unavailable")}
          </p>
        )}
        <div className="button-row">
          <button
            disabled={busy || running}
            onClick={() =>
              attempt(async () => {
                const directory = await open({ directory: true });
                if (typeof directory !== "string" || !(await confirm(lt("migrateNotice")))) return;
                await native("library_migrate", { directory });
                await refreshGallery();
                await reload();
              })
            }
          >
            {lt("migrate")}
          </button>
          <button
            disabled={busy || !stats?.available}
            onClick={() =>
              attempt(async () => {
                const report = await native<{ missing: string[] }>("library_maintain", { action: "scan" });
                setMissing(report.missing);
                await refreshGallery();
                await reload();
              })
            }
          >
            {lt("scan")}
          </button>
          <button
            disabled={busy || !stats?.available}
            onClick={() =>
              attempt(async () => {
                await native("library_maintain", { action: "thumbnails" });
                await refreshGallery();
                await reload();
              })
            }
          >
            {lt("thumbnails")}
          </button>
        </div>
        {missing.length > 0 && (
          <div>
            <p>
              {t("missing")} · {missing.length}
            </p>
            <details>
              <summary>{t("details")}</summary>
              {missing.map((id) => (
                <div key={id}>
                  <code>{id}</code>
                </div>
              ))}
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
