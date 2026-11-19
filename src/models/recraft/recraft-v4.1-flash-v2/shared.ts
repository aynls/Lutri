import { ParameterFields } from "../../../create/components/Fields";
import type { GenerationDraft } from "../../../domain/types";
import { adv, json } from "../../fields";
import { validateFields } from "../../shared";
import type { FieldDefinition } from "../../types";
import { vectorColorErrors, vectorPromptErrors } from "../vector";

export const flashV2 = {
  model: "recraft-v4.1-flash-v2",
  family: "Recraft",
  label: "Recraft V4.1 Flash V2",
  maxReferences: 0,
  promptLimit: { min: 1, max: 10000 },
  Form: ParameterFields,
  documentationPath: "doc/model/Recraft/Recraft-V4.1-Flash-V2.md",
};

export const colorFields = [
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
];

export function flashV2Errors(fields: FieldDefinition[], draft: GenerationDraft, colorFormat: "recraft" | "fal") {
  return [
    ...validateFields(fields, draft),
    ...vectorPromptErrors(draft),
    ...vectorColorErrors(draft.parameters, colorFormat),
  ];
}
