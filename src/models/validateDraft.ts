import type { GenerationDraft } from "../domain/types";
import { combinationById } from ".";
import { t } from "../i18n";
import { c } from "../create/messages";

export function validateDraft(draft: GenerationDraft): string[] {
  const combination = combinationById(draft.combinationId);
  const errors = combination.validate(draft);
  const supported = new Set(combination.fields.map((field) => field.key));
  for (const key of Object.keys(draft.parameters))
    if (!supported.has(key)) errors.push(`Unsupported parameter: ${key}`);
  const references = new Set(draft.references.map((reference) => reference.id));
  if (references.size !== draft.references.length) errors.push("Reference IDs must be unique");
  if (draft.references.some((reference) => reference.purpose !== "reference")) errors.push(c("unsupportedPurpose"));
  if (
    draft.inputPreparation?.maxEdge !== undefined &&
    (!Number.isSafeInteger(draft.inputPreparation.maxEdge) ||
      draft.inputPreparation.maxEdge < 256 ||
      draft.inputPreparation.maxEdge > 8192)
  )
    errors.push(`${c("maxEdge")}: 256–8192`);
  if (!Number.isSafeInteger(draft.requestCount) || draft.requestCount < 1) errors.push(`${t("requestCount")} ≥ 1`);
  if (draft.references.length > combination.maxReferences)
    errors.push(`${t("references")} ≤ ${combination.maxReferences}`);
  if (draft.mask && !combination.mask) errors.push(t("unsupportedMask"));
  if (draft.mask && draft.references[0]?.id !== draft.mask.referenceId) errors.push(t("maskFirstReference"));
  if (draft.regions.length && !combination.regions) errors.push(t("unsupportedRegions"));
  const ids = new Set<string>();
  for (const region of draft.regions) {
    if (!/^[A-Za-z0-9_]+$/.test(region.id) || ids.has(region.id)) errors.push(t("regionNameError"));
    ids.add(region.id);
    if (region.referenceId && !references.has(region.referenceId)) errors.push(`${t("missing")}: ${region.id}`);
    if (region.source && !region.referenceId) errors.push(`${t("source")}: ${region.id}`);
    if (!region.target && !(region.source && region.referenceId)) errors.push(`${t("target")}: ${region.id}`);
    for (const rectangle of [region.source, region.target]) {
      if (
        rectangle &&
        (rectangle.length !== 4 ||
          rectangle.some((value) => !Number.isFinite(value) || value < 0 || value > 1000) ||
          rectangle[0] >= rectangle[2] ||
          rectangle[1] >= rectangle[3])
      )
        errors.push(`${t("regions")}: ${region.id}`);
    }
  }
  return [...new Set(errors)];
}
