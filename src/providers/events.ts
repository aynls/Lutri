import { Channel } from "@tauri-apps/api/core";
import type { Json } from "../domain/types";
import type { CompiledRequest } from "../models/types";
import { native } from "../services/native";

/** Decode SSE across arbitrary UTF-8 and network chunk boundaries. */
export async function streamEvents(request: CompiledRequest, onEvent: (event: Json) => void) {
  const channel = new Channel<number[]>();
  const decoder = new TextDecoder();
  let buffer = "";
  let failure: unknown;
  const process = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    try {
      onEvent(JSON.parse(data) as Json);
    } catch (error) {
      failure = error;
    }
  };
  channel.onmessage = (chunk) => {
    buffer += decoder.decode(new Uint8Array(chunk), { stream: true });
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      process(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
  };
  await native("http_stream", { request, channel });
  buffer += decoder.decode();
  if (buffer.trim()) process(buffer);
  if (failure) throw failure;
}
