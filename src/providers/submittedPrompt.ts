import type { Json } from "../domain/types";
import type { CompiledRequest } from "../models/types";

/** Read only text-bearing request fields; never persist image bodies or headers. */
export function submittedPrompt(request: CompiledRequest): string {
  if (request.multipart)
    return request.multipart
      .filter((part) => part.name === "prompt" && part.text !== undefined)
      .map((part) => part.text)
      .join("\n");
  const text = (value: Json | undefined): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(text);
    if (!value || typeof value !== "object") return [];
    for (const key of ["prompt", "positivePrompt", "text"])
      if (typeof value[key] === "string") return [value[key] as string];
    if (value.structured_prompt !== undefined) return [JSON.stringify(value.structured_prompt)];
    return ["input", "contents", "messages", "content", "parts"].flatMap((key) => text(value[key]));
  };
  return text(request.body).join("\n");
}
