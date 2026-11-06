import type { GenerationDraft, Json } from "../domain/types";
import { compilePrompt } from "../domain/references";
import { c } from "../create/messages";
import type { ModelCombination } from "./types";

export const creationMode = (draft: GenerationDraft) => draft.creationMode ?? "auto";

export function editTargetId(draft: GenerationDraft, combination: ModelCombination): string | undefined {
  if (!combination.creationControl) return combination.primaryReference ? draft.references[0]?.id : undefined;
  if (creationMode(draft) === "generate") return undefined;
  return creationMode(draft) === "edit" ? draft.editTargetId : draft.references[0]?.id;
}

/** Providers bind masks and source-image semantics to the first transmitted image. */
export function orderedCreationDraft(draft: GenerationDraft, combination: ModelCombination): GenerationDraft {
  const target = editTargetId(draft, combination);
  const source = draft.references.find((reference) => reference.id === target);
  return source && draft.references[0] !== source
    ? { ...draft, references: [source, ...draft.references.filter((reference) => reference.id !== target)] }
    : draft;
}

export function creationPrompt(
  draft: GenerationDraft,
  prompt: string,
  control?: ModelCombination["creationControl"],
): string {
  if (!draft.references.length || creationMode(draft) === "auto") return prompt;
  if (control === "style" && creationMode(draft) === "generate") return prompt;
  const instruction =
    creationMode(draft) === "generate"
      ? "Create a new image using the supplied images only as visual references. No input image is designated as the canvas to edit. Follow the requested subjects, style and composition below."
      : "Edit Image 1 as the source image. Use any other input images as references. Preserve the source image except for the changes requested below.";
  return `${instruction}\n\n${prompt}`;
}

export function validateCreation(draft: GenerationDraft, combination: ModelCombination): string[] {
  const errors: string[] = [];
  if (!combination.creationControl) {
    if (draft.creationMode !== undefined || draft.editTargetId !== undefined) errors.push(c("unsupportedCreationMode"));
    return errors;
  }
  const mode = creationMode(draft);
  if (!["auto", "generate", "edit"].includes(mode)) errors.push(c("creationMode"));
  if (mode === "edit" && (!draft.editTargetId || !draft.references.some((ref) => ref.id === draft.editTargetId)))
    errors.push(c("chooseEditTarget"));
  if (mode === "generate" && draft.mask) errors.push(c("maskNeedsEdit"));
  if (draft.mask && draft.mask.referenceId !== editTargetId(draft, combination)) errors.push(c("maskTargetMismatch"));
  if (combination.creationControl === "style") {
    const editing = mode !== "generate" && (mode === "edit" || draft.references.length > 0);
    if (editing && draft.references.length !== 1) errors.push(c("singleEditImage"));
    if (!editing && draft.references.length && draft.parameters.style_id) errors.push(c("styleInputConflict"));
    if (editing && (draft.parameters.style_id || draft.parameters.style_match)) errors.push(c("styleNeedsGenerate"));
  }
  if (combination.creationControl === "context") {
    const context = draft.parameters.context;
    if (context !== undefined && !Array.isArray(context)) errors.push(c("invalidImageContext"));
    const contextImages = Array.isArray(context)
      ? context.filter((part) => part && typeof part === "object" && !Array.isArray(part) && part.type === "image")
          .length
      : 0;
    if (draft.references.length + contextImages > combination.maxReferences) errors.push(c("tooMany"));
  }
  if (
    combination.promptLimit &&
    creationPrompt(draft, compilePrompt(draft, draft.references), combination.creationControl).length >
      combination.promptLimit.max
  )
    errors.push(`${c("promptLimit")}: ≤ ${combination.promptLimit.max}`);
  return errors;
}

/** Shared intent handling; each combination retains its own native request compiler. */
export function withCreationControl(combination: ModelCombination): ModelCombination {
  if (!combination.creationControl) return combination;
  return {
    ...combination,
    compile(context) {
      const errors = validateCreation(context.draft, combination);
      if (errors.length) throw new Error(errors.join("\n"));
      const draft = orderedCreationDraft(context.draft, combination);
      const images = draft.references.map(
        (reference) => context.images[context.draft.references.findIndex((ref) => ref.id === reference.id)],
      );
      const prompt = creationPrompt(draft, compilePrompt(draft, draft.references), combination.creationControl);
      if (combination.creationControl === "context" && creationMode(draft) === "generate") {
        const previous = (draft.parameters.context ?? []) as Json[];
        return combination.compile({
          ...context,
          draft: {
            ...draft,
            parameters: {
              ...draft.parameters,
              context: [...images.map((image_url) => ({ type: "image", image_url })), ...previous],
            },
          },
          images: [],
          prompt,
        });
      }
      return combination.compile({ ...context, draft, images, prompt });
    },
  };
}
