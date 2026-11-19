import { z } from "zod";
import type { GenerationBatch } from "../../domain/types";
import { submitCloudBatch, BatchValidationError } from "../../batch/service";
import { batchRequestLimit } from "../../batch/capabilities";
import { submitBatch } from "../generation";
import { getState } from "../store";
import { identifier, McpError, success, tool } from "./contracts";
import { checkedOutput, checkCreation, creationSchema, executionMode, outputFields, requireCreation } from "./creation";

let submissions: Promise<unknown> = Promise.resolve();

function submissionReceipt(batch: GenerationBatch, reused: boolean) {
  return success({
    batchId: batch.id,
    reused,
    ...(batch.cloud ? { taskCount: batch.taskIds.length } : { taskIds: batch.taskIds }),
  });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function submitOnce(
  name: string,
  input: { requestId: string },
  submit: (request: NonNullable<GenerationBatch["mcpRequest"]>) => Promise<GenerationBatch>,
) {
  const operation = submissions
    .catch(() => {})
    .then(async () => {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical({ name, input })));
      const fingerprint = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const existing = getState().batches.find((batch) => batch.mcpRequest?.id === input.requestId);
      if (existing) {
        if (existing.mcpRequest?.fingerprint !== fingerprint)
          throw new McpError(
            "REQUEST_ID_CONFLICT",
            "This requestId already identifies a different creation request. Use a new ID for intentional new work.",
            { batchId: existing.id },
          );
        return submissionReceipt(existing, true);
      }
      try {
        const batch = await submit({ id: input.requestId, fingerprint });
        return submissionReceipt(batch, false);
      } catch (error) {
        if (error instanceof BatchValidationError)
          throw new McpError("INVALID_CREATION", "Correct the batch items before submitting.", error.issues);
        throw error;
      }
    });
  submissions = operation;
  return operation;
}

const requestId = identifier
  .regex(/\S/)
  .describe(
    "Caller-generated unique ID. Reuse the same ID and identical input after a lost response; a new ID starts new paid work. Persisted with the batch.",
  );

export const submissionTools = [
  tool(
    "validate_creation",
    "Check one creation request, referenced assets, provider credential presence and output settings without submitting to the provider. Reports model validation issues; no paid request is made.",
    z.strictObject({ creation: creationSchema, mode: executionMode.optional(), ...outputFields }),
    async (input) => {
      const mode = input.mode ?? "regular";
      const checked = await checkCreation(input.creation, mode);
      const issues: { code: string; message: string; assetIds?: string[] }[] = checked.issues.map((message) => ({
        code: "INVALID_CREATION",
        message,
      }));
      const missing = checked.assets.filter((asset) => !asset.available).map((asset) => asset.assetId);
      if (missing.length)
        issues.push({
          code: "ASSET_UNAVAILABLE",
          message: "Reference or mask images are missing.",
          assetIds: missing,
        });
      if (!checked.credentialConfigured)
        issues.push({
          code: "CREDENTIAL_REQUIRED",
          message: "Configure this provider in Lutri Settings before submitting.",
        });
      try {
        await checkedOutput(mode, input);
      } catch (error) {
        if (!(error instanceof McpError)) throw error;
        issues.push({ code: error.code, message: error.message });
      }
      return success(issues.length ? { valid: false, issues } : { valid: true });
    },
    { readOnly: true },
  ),
  tool(
    "generate",
    "Submit regular creation independently of the user's current draft. Returns durable batch/task IDs without waiting for generation. Each requestCount starts a separate provider request; model image-count parameters control outputs per request. Retry lost responses with the same requestId and identical input.",
    z.strictObject({ requestId, creation: creationSchema, ...outputFields }),
    async (input) =>
      submitOnce("generate", input, async (request) => {
        const draft = await requireCreation(input.creation, "regular");
        const output = await checkedOutput("regular", input);
        return submitBatch(draft, "mcp", output, request);
      }),
    { idempotent: true, external: true },
  ),
  tool(
    "submit_batch",
    "Submit up to 50,000 cloud requests independently of the user's batch draft. Returns the batch ID and task count after local preparation. Use get_batch for progress and list_tasks with batchId for tasks. Retry lost responses with the same requestId and identical input.",
    z.strictObject({ requestId, items: z.array(creationSchema).min(1).max(batchRequestLimit), ...outputFields }),
    async (input) =>
      submitOnce("submit_batch", input, async (request) => {
        if (input.items.reduce((sum, item) => sum + (item.requestCount ?? 1), 0) > batchRequestLimit)
          throw new McpError("INVALID_CREATION", `A cloud batch supports at most ${batchRequestLimit} total requests.`);
        const items = [];
        for (const item of input.items)
          items.push({ id: crypto.randomUUID(), draft: await requireCreation(item, "batch") });
        const output = await checkedOutput("batch", input);
        return submitCloudBatch({ items, output, mcpRequest: request });
      }),
    { idempotent: true, external: true },
  ),
];
