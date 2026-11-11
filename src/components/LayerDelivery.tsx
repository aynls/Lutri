import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { GenerationResult, GenerationTask } from "../domain/types";
import { execute } from "../services/generation";
import { c } from "../create/messages";

export function LayerDelivery({
  task,
  result,
  onError,
}: {
  task: GenerationTask;
  result: GenerationResult;
  onError: (error: unknown) => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const delivery = result.layerDelivery;
  if (!delivery) return null;
  const busy = retrying || ["queued", "submitting", "generating", "downloading"].includes(task.status);
  return (
    <div className="layer-delivery">
      <small role="status">
        {delivery.status === "completed"
          ? c("psdDelivered")
          : busy
            ? c("layerSaving")
            : result.assetId
              ? c("compositeSaved")
              : null}
      </small>
      {delivery.status === "completed" && delivery.psdPath && (
        <button onClick={() => void revealItemInDir(delivery.psdPath!).catch(onError)}>{c("openPsdLocation")}</button>
      )}
      {delivery.error && <p className="error-text">{delivery.error}</p>}
      {delivery.status !== "completed" && (
        <button
          disabled={busy}
          onClick={() => {
            setRetrying(true);
            void execute(task.id)
              .catch(onError)
              .finally(() => setRetrying(false));
          }}
        >
          {c("retryLayerSave")}
        </button>
      )}
    </div>
  );
}
