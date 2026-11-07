import { ParameterFields } from "../../../create/components/Fields";
import { adv, json, select } from "../../fields";
import { take } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { sizes } from "../sizes";
import { vectorColorErrors, vectorPromptErrors } from "../vector";

const fields: FieldDefinition[] = [
  {
    ...select("size", ["Image size", "图片尺寸", "画像サイズ"], sizes),
    default: "1024x1024",
    allowDefault: false,
  },
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
];

export const recraftV4VectorRunware: ModelCombination = {
  id: "recraft-v4-vector:runware",
  model: "recraft-v4-vector",
  family: "Recraft",
  label: "Recraft V4 Vector",
  provider: "runware",
  protocol: "runware",
  maxReferences: 0,
  primaryReference: false,

  fields,
  promptLimit: { min: 1, max: 10000 },
  groups: [
    { id: "frame", fields: ["size"] },
    { id: "style", fields: ["colors", "background_color"] },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Recraft/Recraft-Vector.md"],
  outputCount: () => 1,
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => [
    ...validateFields(fields, draft),
    ...vectorPromptErrors(draft),
    ...vectorColorErrors(draft.parameters, "runware"),
  ],
  compile: (context) => {
    const p = values(fields, context.draft);
    // Always send a model-valid size; the vectorize endpoint can reject omitted dimensions.
    const size = p.size ?? "1024x1024";
    if (typeof size !== "string" || !sizes.includes(size)) throw new Error(`size: ${sizes.join(", ")}`);
    [p.width, p.height] = size.split("x").map(Number);
    delete p.size;
    const settings = take(p, { colors: "colors", background_color: "backgroundColor" });

    return request("runware", "https://api.runware.ai/v1", [
      {
        ...p,
        taskType: "vectorize",
        taskUUID: context.taskId,
        model: "recraft:v4@vector",
        positivePrompt: context.prompt,
        outputFormat: "SVG",
        outputType: "URL",
        deliveryMethod: "async",
        includeCost: true,
        ...(Object.keys(settings).length ? { settings } : {}),
      },
    ]);
  },
};
