import { useState } from "react";
import { label, localize } from "../i18n";
import { connection, startMcp, stopMcp } from "../services/mcp";
export function McpSettings({ onError }: { onError: (error: unknown) => void }) {
  const [port, setPort] = useState(39632),
    [current, setCurrent] = useState(connection);
  return (
    <section>
      <h2>MCP</h2>
      <label>
        {localize(label("Port", "端口", "ポート"))}
        <input
          type="number"
          min={1024}
          max={65535}
          value={port}
          disabled={!!current}
          onChange={(e) => setPort(Number(e.target.value))}
        />
      </label>
      <button
        onClick={() =>
          void (current ? stopMcp().then(() => setCurrent(undefined)) : startMcp(port).then(setCurrent)).catch(onError)
        }
      >
        {current ? localize(label("Stop", "停止", "停止")) : localize(label("Start", "启动", "開始"))}
      </button>
      {current ? (
        <>
          <code>{current.url}</code>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(
                  JSON.stringify(
                    {
                      mcpServers: {
                        lutri: { url: current.url, headers: { Authorization: `Bearer ${current.token}` } },
                      },
                    },
                    null,
                    2,
                  ),
                )
                .catch(onError)
            }
          >
            {localize(label("Copy configuration", "复制配置", "設定をコピー"))}
          </button>
        </>
      ) : null}
    </section>
  );
}
