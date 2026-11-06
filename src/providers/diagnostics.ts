const sensitiveKey =
  /^(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|b64_json|imageBase64Data|inlineData)$/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? "[redacted]" : redact(item)]),
    );
  if (typeof value !== "string") return value;
  return value
    .replace(/data:[^\s"']+;base64,[A-Za-z0-9+/=]+/g, "[image data]")
    .replace(/https?:\/\/[^\s"'<>]+/g, (raw) => {
      try {
        const url = new URL(raw);
        url.search = "";
        url.hash = "";
        url.username = "";
        url.password = "";
        return url.toString();
      } catch {
        return "[url]";
      }
    })
    .replace(/\b(Bearer|Key)\s+[\w.\-+/=]+/gi, "$1 [redacted]")
    .replace(/\bsk-[\w-]+/g, "[redacted]")
    .replace(/((?:api[-_]?key|authorization|access[-_]?token|secret|password)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]");
}

export function sanitizeDiagnostic(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  try {
    return JSON.stringify(redact(JSON.parse(text)), null, 2).slice(0, 12000);
  } catch {
    return String(redact(text)).slice(0, 12000);
  }
}
