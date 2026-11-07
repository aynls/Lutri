import type { CreationMode, GenerationDraft } from "../domain/types";
import { combinationById } from "../models";
import { initialDraft } from "../models/shared";
import { getState, saveCreation, flushWrites } from "../services/store";
import { native } from "../services/native";
import { batchCombinations, transferDraft, validateBatchDraft } from "./capabilities";
import { b } from "./messages";

export async function switchCreationMode(mode: CreationMode) {
  const { draft, creation } = getState();
  if (mode === creation.mode) return;
  let next: GenerationDraft;
  if (mode === "batch" && creation.editing && creation.batch) next = creation.batch;
  else if (mode === "regular") {
    const saved = creation.regular ?? draft;
    next = { ...saved, prompt: draft.prompt, references: draft.references };
  } else {
    const current = combinationById(draft.combinationId);
    const configured = new Map(
      await Promise.all(
        ["google", "openai"].map(
          async (provider) => [provider, await native<boolean>("credential_present", { provider })] as const,
        ),
      ),
    );
    const recent = creation.batch && combinationById(creation.batch.combinationId);
    const target = current.batch
      ? current
      : (batchCombinations.find((entry) => entry.model === current.model && configured.get(entry.provider)) ??
        (recent?.batch && configured.get(recent.provider) ? recent : undefined) ??
        batchCombinations.find((entry) => configured.get(entry.provider)) ??
        batchCombinations[0]);
    next = transferDraft(draft, target, creation.batch?.combinationId === target.id ? creation.batch : undefined);
  }
  await saveCreation(next, { ...creation, mode, [creation.mode]: structuredClone(draft) });
}

export async function addBatchItem() {
  await flushWrites();
  const { draft, creation } = getState();
  const errors = validateBatchDraft(draft);
  if (errors.length) throw new Error(errors.join("\n"));
  const copy = structuredClone(draft);
  // Output preferences are owned by the submission, never by individual configurations.
  delete copy.outputDirectory;
  delete copy.saveToGallery;
  if (creation.editing) {
    const id = creation.editing.id;
    await saveCreation(creation.editing.returnDraft, {
      ...creation,
      editing: undefined,
      items: creation.items.map((item) => (item.id === id ? { id, draft: copy } : item)),
    });
  } else
    await saveCreation(draft, { ...creation, items: [...creation.items, { id: crypto.randomUUID(), draft: copy }] });
}

export async function editBatchItem(id: string) {
  const { draft, creation } = getState();
  if (creation.editing) throw new Error(b("pendingEdit"));
  const item = creation.items.find((entry) => entry.id === id);
  if (item)
    await saveCreation(structuredClone(item.draft), {
      ...creation,
      editing: { id, returnDraft: structuredClone(draft) },
    });
}

export function cancelBatchEdit() {
  const { creation } = getState();
  if (creation.editing) return saveCreation(creation.editing.returnDraft, { ...creation, editing: undefined });
}

export function removeBatchItem(id: string) {
  const { draft, creation } = getState();
  return saveCreation(creation.editing?.id === id ? creation.editing.returnDraft : draft, {
    ...creation,
    items: creation.items.filter((item) => item.id !== id),
    editing: creation.editing?.id === id ? undefined : creation.editing,
  });
}

export function copyBatchItem(id: string) {
  const { draft, creation } = getState();
  const item = creation.items.find((entry) => entry.id === id);
  if (item)
    return saveCreation(draft, {
      ...creation,
      items: [...creation.items, { id: crypto.randomUUID(), draft: structuredClone(item.draft) }],
    });
}

export async function appendBatchDrafts(drafts: GenerationDraft[]) {
  const { draft, creation } = getState();
  const editor =
    creation.mode === "batch" ? draft : (creation.batch ?? initialDraft(combinationById(drafts[0].combinationId)));
  await saveCreation(editor, {
    ...creation,
    mode: "batch",
    regular: creation.mode === "regular" ? draft : creation.regular,
    items: [...creation.items, ...drafts.map((value) => ({ id: crypto.randomUUID(), draft: structuredClone(value) }))],
  });
}
