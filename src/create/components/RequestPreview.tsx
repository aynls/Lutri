import type { GenerationDraft, Json } from "../../domain/types";
import { compilePrompt } from "../../domain/references";
import { t } from "../../i18n";
import type { ModelCombination } from "../../models/types";
import { getState } from "../../services/store";
import { preparedDimensions } from "../prepareInputs";
import { RememberedDetails } from "./RememberedDetails";
import { orderedCreationDraft } from "../../models/creation";
import { compileBatchRequest } from "../../batch/capabilities";

export function RequestPreview({
  combination,
  draft,
  configuration,
  batch = false,
}: {
  combination: ModelCombination;
  draft: GenerationDraft;
  configuration: { endpoint?: string; deployment?: string };
  batch?: boolean;
}) {
  let url = "",
    body: Json | undefined,
    error = "";
  try {
    draft = orderedCreationDraft(draft, combination);
    const context = {
      draft,
      prompt: compilePrompt(draft, draft.references),
      images: draft.references.map((reference, index) => {
        const asset = getState().gallery.find((entry) => entry.asset.id === reference.assetId)?.asset;
        const size = asset ? preparedDimensions(asset.width, asset.height, draft, combination) : undefined;
        return `<image ${index + 1}${size ? ` · ${size.width} × ${size.height}` : ""}>`;
      }),
      mask: draft.mask ? "<mask>" : undefined,
      taskId: "<task>",
      configuration,
    };
    const compiled = combination.compile(context);
    url = `${compiled.method} ${compiled.url}`;
    body = compiled.multipart
      ? compiled.multipart.map((part) => ({
          name: part.name,
          ...(part.text !== undefined ? { text: part.text } : {}),
          ...(part.dataUrl !== undefined ? { data: "<image>" } : {}),
          ...(part.fileName !== undefined ? { fileName: part.fileName } : {}),
        }))
      : compiled.body;
    if (batch) {
      const preview = compileBatchRequest(combination, context);
      url = `Batch · ${preview.endpoint}`;
      body = preview.body as Json;
    }
  } catch (exception) {
    error = String(exception);
  }
  return (
    <RememberedDetails name={`${combination.id}.preview`} title={t("requestPreview")} className="request-preview">
      {error ? (
        <p className="muted">{error}</p>
      ) : (
        <pre>
          {url}
          {"\n\n"}
          {JSON.stringify(body, null, 2)}
        </pre>
      )}
    </RememberedDetails>
  );
}
