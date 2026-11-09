import type { GenerationTask } from "../domain/types";
import { parameterAssetIds } from "../services/parameterAssets";

export type RelatedHistoryScope = { assetId: string; nonce: string };

export function taskUsesAsset(task: GenerationTask, assetId: string): boolean {
  return (
    task.results.some((result) => result.assetId === assetId) ||
    task.draft.references.some((reference) => reference.assetId === assetId) ||
    task.draft.mask?.assetId === assetId ||
    parameterAssetIds(task.draft.parameters).includes(assetId)
  );
}
