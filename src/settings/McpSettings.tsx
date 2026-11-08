import { useEffect, useState, useSyncExternalStore } from "react";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { CopyButton } from "../components/CopyButton";
import { confirm } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n";
import {
  getMcpConnection,
  subscribeMcp,
  refreshMcpConnection,
  setConnectionToken,
  startMcp,
  stopMcp,
} from "../services/mcp";
import { getState, savePreferences, useApplication } from "../services/store";
import { native } from "../services/native";
import { settingsText as text } from "./messages";

export function McpSettings({ onError }: { onError: (error: unknown) => void }) {
  const { preferences } = useApplication();
  const current = useSyncExternalStore(subscribeMcp, getMcpConnection);
  const [port, setPort] = useState(preferences.mcp?.port ?? 39632),
    [storedToken, setToken] = useState(current?.token),
    [showToken, setShowToken] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void refreshMcpConnection().catch(onError);
    void native<string>("mcp_get_token")
      .then((value) => {
        if (active) setToken(value);
      })
      .catch(onError);
    return () => {
      active = false;
    };
  }, []);
  const token = current?.token ?? storedToken;
  const endpoint =
    current?.url ??
    `http://127.0.0.1:${Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : (preferences.mcp?.port ?? 39632)}/mcp`;
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
        <div className="mcp-connection-row">
          <span>{text("endpoint")}</span>
          <div className="mcp-connection-value">
            <code>{endpoint}</code>
            <CopyButton value={endpoint} title={text("copyEndpoint")} onError={onError} />
          </div>
        </div>
        <div className="mcp-connection-row">
          <span>{text("token")}</span>
          <div className="mcp-connection-value">
            <code className={!showToken ? "mcp-token-hidden" : ""}>
              {token ? (showToken ? token : "••••••••••••••••") : "—"}
            </code>
            <button
              type="button"
              disabled={!token}
              aria-label={showToken ? text("hideToken") : text("showToken")}
              title={showToken ? text("hideToken") : text("showToken")}
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
            {token && <CopyButton value={token} title={text("copyToken")} onError={onError} />}
          </div>
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
                const started = await startMcp(port);
                setToken(started.token);
              }
            })
          }
        >
          {current ? text("stop") : text("start")}
        </button>
        <button
          disabled={busy || !token}
          onClick={() =>
            attempt(async () => {
              if (!(await confirm(text("rotateConfirm"), { title: "MCP", kind: "warning" }))) return;
              const token = await native<string>("mcp_rotate_token");
              setConnectionToken(token);
              setToken(token);
            })
          }
        >
          {text("rotate")}
        </button>
        <button
          disabled={!token || busy}
          onClick={() =>
            attempt(() =>
              navigator.clipboard.writeText(
                JSON.stringify(
                  {
                    mcpServers: { lutri: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } },
                  },
                  null,
                  2,
                ),
              ),
            )
          }
        >
          {text("copyConfig")}
        </button>
      </div>
      {busy && <small role="status">{t("processing")}</small>}
    </section>
  );
}
