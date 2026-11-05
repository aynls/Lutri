import type { GenerationDraft, Json } from "../../domain/types";
import { compilePrompt } from "../../domain/references";
import { t } from "../../i18n";
import type { ModelCombination } from "../../models/types";

export function RequestPreview({
  combination,
  draft,
  configuration,
}: {
  combination: ModelCombination;
  draft: GenerationDraft;
  configuration: { endpoint?: string; deployment?: string };
}) {
  let url = "",
    body: Json | undefined,
    error = "";
  try {
    const compiled = combination.compile({
      draft,
      prompt: compilePrompt(draft, draft.references),
      images: draft.references.map((_, index) => `<image ${index + 1}>`),
      mask: draft.mask ? "<mask>" : undefined,
      taskId: "<task>",
      configuration,
    });
    url = `${compiled.method} ${compiled.url}`;
    body = compiled.multipart
      ? compiled.multipart.map((part) => ({
          name: part.name,
          ...(part.text !== undefined ? { text: part.text } : {}),
          ...(part.dataUrl !== undefined ? { data: "<image>" } : {}),
          ...(part.fileName !== undefined ? { fileName: part.fileName } : {}),
        }))
      : compiled.body;
  } catch (exception) {
    error = String(exception);
  }
  return (
    <details className="request-preview">
      <summary>{t("requestPreview")}</summary>
      {error ? (
        <p className="muted">{error}</p>
      ) : (
        <pre>
          {url}
          {"\n\n"}
          {JSON.stringify(body, null, 2)}
        </pre>
      )}
    </details>
  );
}
