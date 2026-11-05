import { Channel } from "@tauri-apps/api/core";
import { native } from "../services/native";
import type { CompiledRequest } from "../models/types";
import { array, object, string } from "../providers/transport";

export async function streamChat(request: CompiledRequest, onDelta: (text: string, reasoning: string) => void) {
  const channel = new Channel<number[]>(),
    decoder = new TextDecoder();
  let buffer = "",
    text = "",
    reasoning = "",
    failure = "";
  const process = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    try {
      const value = object(JSON.parse(data));
      if (value.error) {
        failure = JSON.stringify(value.error);
        return;
      }
      const delta = object(object(array(value.choices)[0]).delta);
      text += string(delta.content) ?? "";
      reasoning += string(delta.reasoning_content) ?? string(delta.reasoning) ?? "";
      onDelta(text, reasoning);
    } catch (error) {
      failure = String(error);
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
  if (failure) throw new Error(failure);
  if (!text) throw new Error("Empty response");
  return text;
}
