import type { GenerationDraft, ImageReference } from "./types";

const referenceToken = /\[\[ref:([^\]]+)\]\]/g;

export function displayPrompt(draft: GenerationDraft): string {
  return draft.prompt.replace(referenceToken, (_, id: string) => {
    const reference = draft.references.find((entry) => entry.id === id);
    return reference ? `［${reference.name}］` : "［?］";
  });
}

export function insertReference(reference: ImageReference): string {
  return `[[ref:${reference.id}]]`;
}

export function missingPromptReferences(draft: GenerationDraft): string[] {
  const ids = new Set(draft.references.map((r) => r.id));
  return [...draft.prompt.matchAll(referenceToken)].map((m) => m[1]).filter((id) => !ids.has(id));
}

/** Resolve stable tokens only after unavailable inputs have been removed. */
export function compilePrompt(draft: GenerationDraft, references: ImageReference[]): string {
  return draft.prompt.replace(referenceToken, (_, id: string) => {
    const index = references.findIndex((reference) => reference.id === id);
    return index < 0 ? `[missing reference: ${id}]` : `Image ${index + 1}`;
  });
}

export function removeReference(draft: GenerationDraft, id: string): GenerationDraft {
  return {
    ...draft,
    references: draft.references.filter((reference) => reference.id !== id),
    regions: draft.regions.filter((region) => region.referenceId !== id),
    mask: draft.mask?.referenceId === id ? undefined : draft.mask,
  };
}
