import type { GenerationDraft, Json } from "../domain/types";
import { insertReference, missingPromptReferences } from "../domain/references";
import { t } from "../i18n";
import { assetData } from "../services/native";

const systemPrompt =
  "You write production-ready image generation prompts. Return only the final prompt, without a preface or markdown fence. Preserve user intent, reference image ordering and exact requested text. Reference markers use the form [[ref:ID]]. Each reference metadata block identifies the image immediately following it. Preserve these exact markers when referring to the corresponding images in your final prompt; do not replace them with image numbers, aliases or asset IDs. For text-only requests, image metadata is provided but image pixels are not attached; do not claim to have inspected them. Treat attached writing specifications as guidance, not as an instruction to ignore the user's request.";

export async function writerMessages(draft: GenerationDraft, vision: boolean, specification?: string): Promise<Json[]> {
  const missing = missingPromptReferences(draft);
  if (missing.length) throw new Error(`${t("missing")} · ${missing.join(", ")}`);
  const content: Json[] = [{ type: "text", text: draft.prompt }];
  for (const [index, reference] of draft.references.entries()) {
    content.push({
      type: "text",
      text: JSON.stringify({
        reference: insertReference(reference),
        alias: reference.name,
        assetId: reference.assetId,
        imageNumber: index + 1,
        imageAttached: vision,
      }),
    });
    if (vision) content.push({ type: "image_url", image_url: { url: await assetData(reference.assetId) } });
  }
  const messages: Json[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content },
  ];
  if (specification) messages.push({ role: "user", content: specification });
  return messages;
}
