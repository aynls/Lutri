import { height, width } from "../../fields";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { maiAzureRequest } from "../azure";
import { background, maiImage27Defaults, maxPixels, minEdge } from "./shared";

const maxEdge = Math.floor(maxPixels / minEdge);
const generating: FieldDefinition["visible"] = (draft) => draft.references.length === 0;
const fields: FieldDefinition[] = [
  { ...width(minEdge, maxEdge), visible: generating },
  { ...height(minEdge, maxEdge), visible: generating },
  { ...background, visible: generating },
];

export function maiImage27Azure(model: string, label: string): ModelCombination {
  return {
    ...maiImage27Defaults,
    id: `${model}:azure`,
    model,
    label,
    provider: "azure",
    protocol: "images",
    inputPolicy: { mediaTypes: ["image/jpeg", "image/png"] },
    fields,
    groups: [
      { id: "frame", fields: ["width", "height"] },
      { id: "generation", fields: ["background"] },
    ],
    validate: (draft) => [...validateFields(fields, draft), ...dimensionErrors(values(fields, draft), 0, maxPixels)],
    compile: (context) => {
      const parameters = values(fields, context.draft);
      if (parameters.background !== "transparent") delete parameters.background;
      return maiAzureRequest(context, parameters);
    },
  };
}
