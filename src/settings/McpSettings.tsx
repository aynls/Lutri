import { useEffect, useState, useSyncExternalStore } from "react";
import { CopyButton } from "../components/CopyButton";
import { t } from "../i18n";
import { getMcpConnection, subscribeMcp, refreshMcpConnection, startMcp, stopMcp } from "../services/mcp";
import { getState, savePreferences, useApplication } from "../services/store";
import { settingsText as text } from "./messages";

export function McpSettings({ onError }: { onError: (error: unknown) => void }) {
  const { preferences } = useApplication();
  const current = useSyncExternalStore(subscribeMcp, getMcpConnection);
  const [port, setPort] = useState(preferences.mcp?.port ?? 39632);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refreshMcpConnection().catch(onError);
  }, []);
  const endpoint =
    current?.url ??
    `http://127.0.0.1:${Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : (preferences.mcp?.port ?? 39632)}/mcp`;
  const copyConfigLabel = text("copyConfig");
  const attempt = (action: () => Promise<unknown>) => {
    setBusy(true);
    void action()
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const save = async (next: { port?: number; autoStart?: boolean }) => {
    const preferences = getState().preferences;
    await savePreferences({ ...preferences, mcp: { port: 39632, autoStart: false, ...preferences.mcp, ...next } });
  };
  return (
    <section>
      <div className="mcp-heading">
        <h2>MCP</h2>
        <span className={`mcp-status${current ? " is-running" : ""}`}>
          {current ? text("running") : text("stopped")}
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
          disabled={!!current || busy}
          onChange={(event) => setPort(Number(event.target.value))}
          onBlur={() => {
            if (Number.isInteger(port) && port >= 1024 && port <= 65535) void save({ port }).catch(onError);
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
          onChange={(event) => attempt(() => save({ autoStart: event.target.checked }))}
        />
      </label>
      <div className="button-row">
        <button
          disabled={busy || !Number.isInteger(port) || port < 1024 || port > 65535}
          onClick={() =>
            attempt(async () => {
              if (current) {
                await stopMcp();
              } else {
                await save({ port });
                await startMcp(port);
              }
            })
          }
        >
          {current ? text("stop") : text("start")}
        </button>
        <CopyButton
          value={JSON.stringify({ mcpServers: { lutri: { url: endpoint } } }, null, 2)}
          title={copyConfigLabel}
          label={copyConfigLabel}
          onError={onError}
        />
      </div>
      {busy && <small role="status">{t("processing")}</small>}
    </section>
  );
}
