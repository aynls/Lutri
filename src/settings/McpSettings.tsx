import { useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n";
import { connection, startMcp, stopMcp } from "../services/mcp";
import { getState, savePreferences, useApplication } from "../services/store";
import { native } from "../services/native";
import { settingsText as text } from "./messages";

export function McpSettings({ onError }: { onError: (error: unknown) => void }) {
  const { preferences } = useApplication();
  const [port, setPort] = useState(preferences.mcp?.port ?? 39632),
    [current, setCurrent] = useState(connection),
    [busy, setBusy] = useState(false);
  const attempt = (action: () => Promise<unknown>) => {
    setBusy(true);
    void action()
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const save = async (next: { port?: number; autoStart?: boolean }) => {
    const current = getState().preferences;
    await savePreferences({ ...current, mcp: { port: 39632, autoStart: false, ...current.mcp, ...next } });
  };
  return (
    <section>
      <h2>MCP</h2>
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
                setCurrent(undefined);
              } else {
                await save({ port });
                setCurrent(await startMcp(port));
              }
            })
          }
        >
          {current ? text("stop") : text("start")}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            attempt(async () => {
              if (!(await confirm(text("rotateConfirm"), { title: "MCP", kind: "warning" }))) return;
              const token = await native<string>("mcp_rotate_token");
              if (connection) connection.token = token;
              if (current) setCurrent({ ...current, token });
            })
          }
        >
          {text("rotate")}
        </button>
      </div>
      {current && (
        <div className="mcp-connection">
          <code>{current.url}</code>
          <button
            onClick={() =>
              attempt(() =>
                navigator.clipboard.writeText(
                  JSON.stringify(
                    {
                      mcpServers: {
                        lutri: { url: current.url, headers: { Authorization: `Bearer ${current.token}` } },
                      },
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
      )}
      {busy && <small role="status">{t("processing")}</small>}
    </section>
  );
}
