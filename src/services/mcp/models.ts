import { z } from "zod";
import { combinations } from "../../models";
import { initialDraft, maxRequestCount, regionLimit } from "../../models/shared";
import { batchRequestLimit } from "../../batch/capabilities";
import { native } from "../native";
import { getState } from "../store";
import { identifier, McpError, pagination, success, tool } from "./contracts";
import { creationSchema, creationDraft, executionMode, modelById, parametersSchema } from "./creation";

const documents = import.meta.glob<string>("/doc/model/**/*.md", { query: "?raw", import: "default" });

export const modelTools = [
  tool(
    "list_models",
    "List concise creation model/provider combinations and credential readiness. Use get_model for parameters and constraints before composing a request.",
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
        .filter((entry) => !input.configuredOnly || readiness.get(entry.provider))
        .map((entry) => ({
          combinationId: entry.id,
          name: entry.label,
          family: entry.family,
          model: entry.model,
          provider: entry.provider,
          credentialConfigured: readiness.get(entry.provider),
          modes: entry.batch ? ["regular", "batch"] : ["regular"],
          maxReferences: entry.maxReferences,
          supportsMask: !!entry.mask,
          supportsRegions: !!entry.regions,
        }));
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
    "Describe one creation model with parameter schema, defaults, input limits, active fields and model documentation. Supply input to evaluate conditional fields for that exact creation request.",
    z.strictObject({
      combinationId: identifier,
      mode: executionMode.optional(),
      input: creationSchema.omit({ combinationId: true }).optional(),
      includeDocumentation: z.boolean().optional(),
    }),
    async (input) => {
      const combination = modelById(input.combinationId);
      if (input.mode === "batch" && !combination.batch)
        throw new McpError("MODEL_MODE_UNSUPPORTED", "This model/provider combination does not support cloud batches.");
      const draft = creationDraft({ ...input.input, combinationId: input.combinationId });
      const policy =
        typeof combination.inputPolicy === "function" ? combination.inputPolicy(draft) : combination.inputPolicy;
      const unsupported = input.mode === "batch" ? (combination.batch?.unsupportedFields ?? []) : [];
      const docs =
        input.includeDocumentation === false
          ? []
          : await Promise.all(
              Object.entries(documents)
                .filter(([path]) =>
                  combination.docs.some((doc) => {
                    const target = `/${doc.replace(/\\/g, "/")}`;
                    return path === target || (target.endsWith("/") && path.startsWith(target));
                  }),
                )
                .map(async ([path, read]) => ({ name: path.slice(1), content: await read() })),
            );
      return success({
        combinationId: combination.id,
        name: combination.label,
        provider: combination.provider,
        credentialConfigured: await native<boolean>("credential_present", { provider: combination.provider }),
        modes: combination.batch ? ["regular", "batch"] : ["regular"],
        parametersSchema: z.toJSONSchema(parametersSchema(combination)),
        defaults: initialDraft(combination).parameters,
        effectiveParameters: draft.parameters,
        fields: combination.fields.map(({ visible, label, optionLabels, ...field }) => ({
          ...field,
          label: label.en,
          optionLabels: optionLabels
            ? Object.fromEntries(Object.entries(optionLabels).map(([key, value]) => [key, value.en]))
            : undefined,
          active: (!visible || visible(draft)) && !unsupported.includes(field.key),
        })),
        inputs: {
          maxReferences: combination.maxReferences,
          primaryReference: combination.primaryReference ?? false,
          creationControl: combination.creationControl ?? null,
          creationModes: combination.creationControl ? ["generate", "edit"] : [],
          defaultCreationMode: combination.creationControl ? "generate" : null,
          mask: combination.mask ?? null,
          regions: combination.regions ?? null,
          maxRegions: regionLimit(combination),
          promptLimit: combination.promptLimit ?? null,
          imagePolicy: policy ?? {},
          referenceSyntax:
            "[[ref:references[].id]]; assetId identifies the stored image, id identifies its role in this request.",
        },
        requestLimit: input.mode === "batch" ? batchRequestLimit : maxRequestCount(getState().preferences),
        batchUnsupportedParameters: unsupported,
        documentation: docs,
      });
    },
    { readOnly: true },
  ),
];
