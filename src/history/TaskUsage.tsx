import type { GenerationResult, GenerationTask, Json, Parameters } from "../domain/types";
import { combinationById } from "../models";
import { taskText } from "../i18n/tasks";

const record = (value: Json | undefined): Parameters =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const numeric = (value: Json | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

export function usageFields(metadata: Parameters | undefined, provider: string): { label: string; value: string }[] {
  const data = metadata ?? {};
  const usage = record(data.usage),
    gemini = record(data.usageMetadata);
  const result: { label: string; value: string }[] = [];
  const add = (key: "inputTokens" | "outputTokens" | "totalTokens" | "seed", value: Json | undefined) => {
    const number = numeric(value);
    if (number !== undefined) result.push({ label: taskText(key), value: number.toLocaleString() });
  };
  add("inputTokens", usage.input_tokens ?? usage.prompt_tokens ?? gemini.promptTokenCount);
  add("outputTokens", usage.output_tokens ?? usage.completion_tokens ?? gemini.candidatesTokenCount);
  add("totalTokens", usage.total_tokens ?? gemini.totalTokenCount);
  add("seed", data.seed);
  // Cost units are only known for the documented provider fields below.
  const cost = provider === "runware" ? numeric(data.cost) : undefined;
  if (cost !== undefined) result.push({ label: taskText("cost"), value: `USD ${cost.toFixed(6)}` });
  const credits = provider === "openrouter" ? numeric(usage.cost) : undefined;
  if (credits !== undefined) result.push({ label: taskText("credits"), value: credits.toFixed(6) });
  return result;
}

export function TaskUsage({
  task,
  result,
  compact = false,
}: {
  task: GenerationTask;
  result?: GenerationResult;
  compact?: boolean;
}) {
  const provider = combinationById(task.draft.combinationId).provider;
  const fields = usageFields(result ? result.metadata : task.metadata, provider);
  if (!fields.length) return null;
  return compact ? (
    <span className="task-usage-summary">{fields.map((field) => `${field.label} ${field.value}`).join(" · ")}</span>
  ) : (
    <dl className="metadata-grid task-usage">
      {fields.map((field) => (
        <div className="metadata-row" key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BatchUsage({ tasks }: { tasks: GenerationTask[] }) {
  const totals = new Map<string, number>();
  let known = 0;
  for (const task of tasks) {
    const provider = combinationById(task.draft.combinationId).provider;
    if (
      provider === "runware" &&
      task.results.length &&
      task.results.every((result) => numeric(result.metadata?.cost) !== undefined)
    ) {
      totals.set(
        "USD",
        (totals.get("USD") ?? 0) + task.results.reduce((sum, result) => sum + Number(result.metadata?.cost), 0),
      );
      if (task.status === "completed") known++;
    } else if (provider === "openrouter") {
      const cost = numeric(record(task.metadata?.usage).cost);
      if (cost !== undefined) {
        const unit = taskText("credits");
        totals.set(unit, (totals.get(unit) ?? 0) + cost);
        if (task.status === "completed") known++;
      }
    }
  }
  if (!totals.size) return null;
  return (
    <small className="task-usage-summary">
      {[...totals].map(([unit, total]) => `${unit} ${total.toFixed(6)}`).join(" · ")}
      {known < tasks.length ? ` · ${taskText("partialUsage")}` : ""}
    </small>
  );
}
