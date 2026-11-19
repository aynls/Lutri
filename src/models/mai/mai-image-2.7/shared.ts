import { ParameterFields } from "../../../create/components/Fields";
import { label } from "../../../i18n";
import { select } from "../../fields";
import type { FieldDefinition, ModelCombination } from "../../types";

export const minEdge = 768;
export const maxPixels = 2048 ** 2;

export const background: FieldDefinition = {
  ...select("background", ["Background", "背景", "背景"], ["opaque", "transparent"]),
  optionLabels: {
    opaque: label("Opaque", "不透明", "不透明"),
    transparent: label("Transparent", "透明", "透明"),
  },
};

export const maiImage27Defaults = {
  family: "MAI",
  creationControl: "prompt",
  maxReferences: 5,
  Form: ParameterFields,
  documentationPath: "doc/model/MAI/MAI-Image-2.7.md",
  outputCount: () => 1,
} satisfies Partial<ModelCombination>;
