import type { Json } from "../domain/types";
import type { CompiledRequest } from "../models/types";
import { native } from "../services/native";
import { streamEvents } from "./events";
import { sanitizeDiagnostic } from "./diagnostics";

export class HttpError extends Error {
  constructor(
    public status: number,
    body: string,
    public retryAfter?: string,
  ) {
    super(`${status}: ${sanitizeDiagnostic(body)}`);
  }
}

export async function send(request: CompiledRequest): Promise<Json> {
  if (object(request.body).stream === true) {
    const images: Json[] = [];
    await streamEvents(request, (event) => {
      const value = object(event);
      if (value.error) {
        images.push(value);
        return;
      }
      const type = string(value.type);
      if (
        type === "image_generation.completed" ||
        type === "image_edit.completed" ||
        type === "image_generation.partial_succeeded"
      ) {
        if (value.b64_json || value.url) images.push(value);
      }
    });
    if (!images.length) throw new Error("Stream ended without a completed image");
    images.sort((a, b) => Number(object(a).image_index ?? 0) - Number(object(b).image_index ?? 0));
    return { data: images };
  }
  const response = await native<{ status: number; body: string; retryAfter?: string }>("http_request", { request });
  if (response.status < 200 || response.status >= 300)
    throw new HttpError(response.status, response.body, response.retryAfter);
  return JSON.parse(response.body) as Json;
}

export function object(value: Json | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function array(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}
export function string(value: Json | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
