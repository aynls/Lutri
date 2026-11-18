import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { native } from "./native";
import { getState } from "./store";
import { assetTools } from "./mcp/assets";
import { modelTools } from "./mcp/models";
import { submissionTools } from "./mcp/submissions";
import { taskTools } from "./mcp/tasks";
import { failure, McpError } from "./mcp/contracts";

const tools = [...modelTools, ...submissionTools, ...taskTools, ...assetTools];
const byName = new Map(tools.map((tool) => [tool.definition.name, tool]));
type McpStatus = { url: string | null; stdioRunning: boolean };
type StdioConfig = { command: string; args: string[] };
let status: McpStatus = { url: null, stdioRunning: false };
const subscribers = new Set<() => void>();
let requestListener: Promise<UnlistenFn> | undefined;
let statusListener: Promise<UnlistenFn> | undefined;
let registration: Promise<void> | undefined;
let statusRevision = 0;

export const getMcpStatus = () => status;
export function subscribeMcp(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export async function refreshMcpStatus() {
  statusListener ??= listen("mcp-status-changed", () => {
    void refreshMcpStatus().catch(() => {});
  }).catch((error: unknown) => {
    statusListener = undefined;
    throw error;
  });
  await statusListener;
  const revision = ++statusRevision;
  const next = await native<McpStatus>("mcp_status");
  if (revision !== statusRevision || (status.url === next.url && status.stdioRunning === next.stdioRunning)) return;
  status = next;
  for (const subscriber of subscribers) subscriber();
}

function registerMcpTools() {
  requestListener ??= listen<{ id: string; name: string; arguments: unknown }>(
    "mcp-request",
    async ({ payload }) => {
      const tool = byName.get(payload.name);
      const result = getState().ready
        ? tool
          ? await tool.call(payload.arguments)
          : failure(new McpError("UNKNOWN_TOOL", `Unknown tool: ${payload.name}`))
        : failure(new McpError("APPLICATION_NOT_READY", "Lutri is still loading.", undefined, true));
      await native("mcp_reply", { id: payload.id, result }).catch(() => {});
    },
  ).catch((error: unknown) => {
    requestListener = undefined;
    throw error;
  });
  registration ??= requestListener
    .then(() => native<void>("mcp_register", { tools: tools.map((tool) => tool.definition) }))
    .catch((error: unknown) => {
      registration = undefined;
      throw error;
    });
  return registration;
}

export async function initializeMcp() {
  await registerMcpTools();
  await refreshMcpStatus();
}

export async function startMcpHttp(port: number) {
  await registerMcpTools();
  await native("mcp_start", { port });
  await refreshMcpStatus();
}

export async function stopMcpHttp() {
  await native("mcp_stop");
  await refreshMcpStatus();
}

export async function setMcpStdioEnabled(enabled: boolean) {
  if (enabled) await registerMcpTools();
  await native("mcp_set_stdio_enabled", { enabled });
  await refreshMcpStatus();
}

export function getMcpStdioConfig() {
  return native<StdioConfig>("mcp_stdio_config");
}
