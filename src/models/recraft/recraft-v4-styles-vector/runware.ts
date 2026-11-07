import { ParameterFields } from "../../../create/components/Fields";
import { adv, json, select, text } from "../../fields";
import { take } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { sizes } from "../sizes";
import { vectorColorErrors, vectorPromptErrors, vectorStyleErrors } from "../vector";

const fields: FieldDefinition[] = [
  {
    ...select("size", ["Image size", "图片尺寸", "画像サイズ"], sizes),
    default: "1024x1024",
    allowDefault: false,
  },
  adv(json("colors", ["Palette", "配色", "パレット"])),
  adv(json("background_color", ["Background color", "背景色", "背景色"])),
  text("style_id", ["Style ID", "风格 ID", "スタイル ID"]),
  select("style_match", ["Style matching", "风格匹配", "スタイル適合"], ["precise", "flexible"]),
];

export const recraftV4StylesVectorRunware: ModelCombination = {
  id: "recraft-v4-styles-vector:runware",
  model: "recraft-v4-styles-vector",
  family: "Recraft",
  label: "Recraft V4 Styles Vector",
  provider: "runware",
  protocol: "runware",
  maxReferences: 10,
  primaryReference: false,
  inputPolicy: {
    minEdge: 256,
    maxBytes: 10_485_760,
    totalBytes: 67_108_864,
    mediaTypes: ["image/png", "image/jpeg", "image/webp"],
  },
  fields,
  promptLimit: { min: 1, max: 10000 },
  groups: [
    { id: "frame", fields: ["size"] },
    { id: "style", fields: ["style_id", "style_match", "colors", "background_color"] },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Recraft/Recraft-Vector.md"],
  outputCount: () => 1,
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => [
    ...validateFields(fields, draft),
    ...vectorPromptErrors(draft),
    ...vectorColorErrors(draft.parameters, "runware"),
    ...vectorStyleErrors(draft, { required: true, exclusive: true }),
  ],
  compile: (context) => {
    const p = values(fields, context.draft);
    // Always send a model-valid size; the vectorize endpoint can reject omitted dimensions.
    const size = p.size ?? "1024x1024";
    if (typeof size !== "string" || !sizes.includes(size)) throw new Error(`size: ${sizes.join(", ")}`);
    [p.width, p.height] = size.split("x").map(Number);
    delete p.size;
    const settings = take(p, { colors: "colors", background_color: "backgroundColor", style_match: "styleMatch" });
    const inputs = take(p, { style_id: "styleId" });
    if (typeof inputs.styleId === "string") inputs.styleId = inputs.styleId.trim();
    if (context.images.length) inputs.referenceImages = context.images;
    return request("runware", "https://api.runware.ai/v1", [
      {
        ...p,
        taskType: "vectorize",
        taskUUID: context.taskId,
        model: "recraft:v4@styles-vector",
        positivePrompt: context.prompt,
        outputFormat: "SVG",
        outputType: "URL",
        deliveryMethod: "async",
        includeCost: true,
        ...(Object.keys(settings).length ? { settings } : {}),
        inputs,
      },
    ]);
  },
};
