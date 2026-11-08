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
type Connection = { url: string; token: string };
export let connection: Connection | undefined;
const subscribers = new Set<() => void>();
let unlistenRequests: UnlistenFn | undefined;
let statusListener: Promise<UnlistenFn> | undefined;
let lifecycle: Promise<unknown> = Promise.resolve();

function setConnection(value: Connection | undefined) {
  connection = value;
  for (const subscriber of subscribers) subscriber();
}

export const getMcpConnection = () => connection;
export function subscribeMcp(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export async function refreshMcpConnection() {
  statusListener ??= listen("mcp-status-changed", () => {
    void refreshMcpConnection().catch(() => setConnection(undefined));
  }).catch((error: unknown) => {
    statusListener = undefined;
    throw error;
  });
  await statusListener;
  const status = await native<{ url: string | null; token: string }>("mcp_status");
  setConnection(status.url ? { url: status.url, token: status.token } : undefined);
}

export function startMcp(port: number): Promise<Connection> {
  const operation = lifecycle
    .catch(() => {})
    .then(async () => {
      if (!getState().ready) throw new Error("Lutri is still loading.");
      await refreshMcpConnection();
      if (!unlistenRequests)
        unlistenRequests = await listen<{ id: string; name: string; arguments: unknown }>(
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
        );
      try {
        const started = await native<Connection>("mcp_start", { port, tools: tools.map((tool) => tool.definition) });
        setConnection(started);
        return started;
      } catch (error) {
        await refreshMcpConnection().catch(() => setConnection(undefined));
        if (!connection) {
          unlistenRequests?.();
          unlistenRequests = undefined;
        }
        throw error;
      }
    });
  lifecycle = operation;
  return operation;
}

export function stopMcp(): Promise<void> {
  const operation = lifecycle
    .catch(() => {})
    .then(async () => {
      await native("mcp_stop");
      unlistenRequests?.();
      unlistenRequests = undefined;
      setConnection(undefined);
    });
  lifecycle = operation;
  return operation;
}

export function setConnectionToken(token: string) {
  if (connection) setConnection({ ...connection, token });
}
