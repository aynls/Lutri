import { z } from "zod";
import { combinations } from "../../models";
import { native } from "../native";
import { identifier, McpError, pagination, success, tool } from "./contracts";
import { executionMode, modelById, parametersSchema } from "./creation";

const documents = import.meta.glob<string>("/doc/model/**/*.md", { query: "?raw", import: "default" });

export const modelTools = [
  tool(
    "list_models",
    "List creation model/provider combinations, input capabilities and credential readiness. Use get_model for parameter schemas.",
    z.strictObject({
      query: z.string().optional(),
      provider: identifier.optional(),
      mode: executionMode.optional(),
      configuredOnly: z.boolean().optional(),
      ...pagination,
    }),
    async (input) => {
      const candidates = combinations.filter(
        (combination) =>
          (!input.provider || combination.provider === input.provider) &&
          (input.mode !== "batch" || !!combination.batch) &&
          (!input.query ||
            `${combination.id} ${combination.label} ${combination.family}`
              .toLowerCase()
              .includes(input.query.toLowerCase())),
      );
      const readiness = new Map(
        await Promise.all(
          [...new Set(candidates.map((entry) => entry.provider))].map(
            async (provider) => [provider, await native<boolean>("credential_present", { provider })] as const,
          ),
        ),
      );
      const entries = candidates
        .map((entry) => ({
          combinationId: entry.id,
          name: entry.label,
          family: entry.family,
          model: entry.model,
          provider: entry.provider,
          credentialConfigured: readiness.get(entry.provider) === true,
          modes: entry.batch ? ["regular", "batch"] : ["regular"],
          maxReferences: entry.maxReferences,
          supportsMask: !!entry.mask,
          supportsRegions: !!entry.regions,
        }))
        .filter((entry) => !input.configuredOnly || entry.credentialConfigured);
      const offset = input.offset ?? 0,
        limit = input.limit ?? 25;
      return success({
        models: entries.slice(offset, offset + limit),
        total: entries.length,
        nextOffset: offset + limit < entries.length ? offset + limit : null,
      });
    },
    { readOnly: true },
  ),
  tool(
    "get_model",
    "Return the JSON Schema for creation.parameters for one model/provider combination.",
    z.strictObject({
      combinationId: identifier,
      mode: executionMode.optional(),
      includeDocumentation: z
        .boolean()
        .optional()
        .describe("Include the combination's Markdown document. Defaults to false."),
    }),
    async ({ combinationId, mode, includeDocumentation }) => {
      const combination = modelById(combinationId);
      if (mode === "batch" && !combination.batch)
        throw new McpError("MODEL_MODE_UNSUPPORTED", "This model/provider combination does not support cloud batches.");
      const name = combination.documentationPath;
      const readDocumentation = includeDocumentation === true ? documents[`/${name}`] : undefined;
      return success({
        parametersSchema: z.toJSONSchema(parametersSchema(combination, mode)),
        ...(readDocumentation ? { documentation: { name, content: await readDocumentation() } } : {}),
      });
    },
    { readOnly: true },
  ),
];
