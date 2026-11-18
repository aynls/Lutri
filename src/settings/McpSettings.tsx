import { useEffect, useState, useSyncExternalStore } from "react";
import { CopyButton } from "../components/CopyButton";
import { t } from "../i18n";
import {
  getMcpStatus,
  getMcpStdioConfig,
  refreshMcpStatus,
  setMcpStdioEnabled,
  startMcpHttp,
  stopMcpHttp,
  subscribeMcp,
} from "../services/mcp";
import { getState, savePreferences, useApplication, type Preferences } from "../services/store";
import { settingsText as text } from "./messages";

let preferenceWrite = Promise.resolve();
function saveMcpPreferences(next: Partial<NonNullable<Preferences["mcp"]>>) {
  preferenceWrite = preferenceWrite.catch(() => {}).then(() => {
    const preferences = getState().preferences;
    return savePreferences({ ...preferences, mcp: { port: 39632, autoStart: false, ...preferences.mcp, ...next } });
  });
  return preferenceWrite;
}

export function McpSettings({ onError }: { onError: (error: unknown) => void }) {
  const { preferences } = useApplication();
  const { url, stdioRunning } = useSyncExternalStore(subscribeMcp, getMcpStatus);
  const [port, setPort] = useState(preferences.mcp?.port ?? 39632);
  const [busy, setBusy] = useState({ http: false, stdio: false });
  const [stdioConfig, setStdioConfig] = useState<string>();
  useEffect(() => {
    void refreshMcpStatus().catch(onError);
    void getMcpStdioConfig()
      .then((config) => setStdioConfig(JSON.stringify({ mcpServers: { "lutri-stdio": config } }, null, 2)))
      .catch(onError);
  }, []);
  const validPort = Number.isInteger(port) && port >= 1024 && port <= 65535;
  const endpoint = url ?? `http://127.0.0.1:${validPort ? port : (preferences.mcp?.port ?? 39632)}/mcp`;
  const attempt = (transport: keyof typeof busy, action: () => Promise<unknown>) => {
    setBusy((current) => ({ ...current, [transport]: true }));
    void action()
      .catch(onError)
      .finally(() => setBusy((current) => ({ ...current, [transport]: false })));
  };

  return (
    <>
      <section>
        <div className="mcp-heading">
          <h2>Streamable HTTP</h2>
          <span className={`mcp-status${url ? " is-running" : ""}`} role="status">
            {url ? text("running") : text("stopped")}
          </span>
        </div>
        <div className="mcp-connection">
          <span>{text("endpoint")}</span>
          <div className="mcp-connection-value">
            <code>{endpoint}</code>
            <CopyButton value={endpoint} title={text("copyEndpoint")} onError={onError} />
          </div>
        </div>
        <label className="settings-row">
          <span>{text("port")}</span>
          <input
            type="number"
            min={1024}
            max={65535}
            step={1}
            value={port}
            disabled={!!url || busy.http}
            onChange={(event) => setPort(Number(event.target.value))}
            onBlur={() => {
              if (validPort) void saveMcpPreferences({ port }).catch(onError);
              else setPort(preferences.mcp?.port ?? 39632);
            }}
          />
        </label>
        <label className="settings-row">
          <span>{text("automaticMcp")}</span>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.mcp?.autoStart ?? false}
            disabled={busy.http}
            onChange={(event) => {
              const autoStart = event.currentTarget.checked;
              attempt("http", () => saveMcpPreferences({ autoStart }));
            }}
          />
        </label>
        <div className="button-row">
          <button
            disabled={busy.http || (!url && !validPort)}
            onClick={() =>
              attempt("http", async () => {
                if (url) {
                  await stopMcpHttp();
                } else {
                  await saveMcpPreferences({ port });
                  await startMcpHttp(port);
                }
              })
            }
          >
            {url ? text("stop") : text("start")}
          </button>
          <CopyButton
            value={JSON.stringify({ mcpServers: { lutri: { url: endpoint } } }, null, 2)}
            title={text("copyConfig")}
            label={text("copyConfig")}
            onError={onError}
          />
        </div>
        {busy.http && <small role="status">{t("processing")}</small>}
      </section>
      <section>
        <div className="mcp-heading">
          <h2>stdio</h2>
          <span className={`mcp-status${stdioRunning ? " is-running" : ""}`} role="status">
            {stdioRunning ? text("running") : text("stopped")}
          </span>
        </div>
        <label className="settings-row">
          <span>{text("enableStdio")}</span>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.mcp?.stdioEnabled ?? false}
            disabled={busy.stdio}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              attempt("stdio", async () => {
                await setMcpStdioEnabled(enabled);
                try {
                  await saveMcpPreferences({ stdioEnabled: enabled });
                } catch (error) {
                  if (enabled) await setMcpStdioEnabled(false).catch(onError);
                  throw error;
                }
              });
            }}
          />
        </label>
        {stdioConfig && (
          <div className="button-row">
            <CopyButton
              value={stdioConfig}
              title={text("copyStdioConfig")}
              label={text("copyStdioConfig")}
              onError={onError}
            />
          </div>
        )}
        {busy.stdio && <small role="status">{t("processing")}</small>}
      </section>
    </>
  );
}
