import { z } from "zod";
import { sanitizeDiagnostic } from "../../providers/diagnostics";

// Desktop CSP disallows runtime code generation.
z.config({ jitless: true });

export class McpError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
    public retryable = false,
  ) {
    super(message);
  }
}

export interface ToolResult {
  content: ({ type: "text"; text: string } | { type: "image"; mimeType: string; data: string })[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

export function success(data: Record<string, unknown>): ToolResult {
  const structuredContent = { ok: true, data };
  return { structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent) }] };
}

export function failure(error: unknown): ToolResult {
  const value = error instanceof McpError ? error : new McpError("OPERATION_FAILED", sanitizeDiagnostic(error));
  const structuredContent = {
    ok: false,
    error: { code: value.code, message: value.message, details: value.details, retryable: value.retryable },
  };
  return { isError: true, structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent) }] };
}

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new McpError(
      "INVALID_ARGUMENTS",
      "Correct the indicated input fields before retrying.",
      parsed.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
    );
  return parsed.data;
}

const outputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
        retryable: { type: "boolean" },
      },
      required: ["code", "message", "retryable"],
      additionalProperties: false,
    },
  },
  required: ["ok"],
  additionalProperties: false,
  oneOf: [
    { properties: { ok: { const: true } }, required: ["data"] },
    { properties: { ok: { const: false } }, required: ["error"] },
  ],
};

export function tool<S extends z.ZodType>(
  name: string,
  description: string,
  schema: S,
  handler: (input: z.output<S>) => Promise<ToolResult>,
  behavior: { readOnly?: boolean; idempotent?: boolean; external?: boolean } = {},
) {
  return {
    definition: {
      name,
      description,
      inputSchema: z.toJSONSchema(schema, { io: "input" }),
      outputSchema,
      annotations: {
        readOnlyHint: behavior.readOnly ?? false,
        destructiveHint: false,
        idempotentHint: behavior.readOnly || behavior.idempotent || false,
        openWorldHint: behavior.external ?? false,
      },
    },
    async call(input: unknown) {
      try {
        return await handler(parse(schema, input));
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export const identifier = z.string().min(1).max(256);
export const pagination = {
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
};
