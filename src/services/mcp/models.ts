import { z } from "zod";
import { combinations } from "../../models";
import { native } from "../native";
import { identifier, McpError, pagination, success, tool } from "./contracts";
import { executionMode, modelById, parametersSchema } from "./creation";

const documents = import.meta.glob<string>("/doc/model/**/*.md", { query: "?raw", import: "default" });

export const modelTools = [
  tool(
    "list_models",
    "List model names and their providers with combination IDs, five models per page by default. Use get_model for parameters.",
    z.strictObject({
      query: z.string().optional(),
      provider: identifier.optional(),
      mode: executionMode.optional(),
      configuredOnly: z.boolean().optional().describe("Show only providers with saved credentials. Defaults to true."),
      ...pagination,
    }),
    async ({ query, provider, mode, configuredOnly = true, offset = 0, limit = 5 }) => {
      const search = query?.toLowerCase();
      const candidates = combinations.filter(
        (combination) =>
          (!provider || combination.provider === provider) &&
          (mode !== "batch" || !!combination.batch) &&
          (!search || `${combination.id} ${combination.label} ${combination.family}`.toLowerCase().includes(search)),
      );
      const readiness = configuredOnly
        ? new Map(
            await Promise.all(
              [...new Set(candidates.map((entry) => entry.provider))].map(
                async (provider) => [provider, await native<boolean>("credential_present", { provider })] as const,
              ),
            ),
          )
        : undefined;
      const models = new Map<string, { name: string; providers: Record<string, string> }>();
      for (const entry of candidates) {
        if (readiness && !readiness.get(entry.provider)) continue;
        let model = models.get(entry.model);
        if (!model) {
          model = { name: entry.label, providers: {} };
          models.set(entry.model, model);
        }
        model.providers[entry.provider] = entry.id;
      }
      const end = offset + limit;
      return success({
        models: [...models.values()].slice(offset, end),
        nextOffset: end < models.size ? end : null,
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
