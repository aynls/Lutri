import { ParameterFields } from "../../../create/components/Fields";
import { count, height, seed, select, toggle, width } from "../../fields";
import { runware, take } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const expand = toggle("prompt_extend", ["Expand prompt", "扩展提示词", "プロンプト拡張"]);
const mode = {
  ...select("prompt_extend_mode", ["Expansion mode", "扩写模式", "拡張モード"], ["direct", "agent"]),
  visible: (d: Parameters<typeof values>[1]) => d.parameters.prompt_extend !== false && !d.references.length,
};
const fields: FieldDefinition[] = [
  width(192, 4096),
  height(192, 4096),
  count("numberResults", 20),
  seed(),
  expand,
  mode,
  {
    ...toggle("enable_thinking", ["Thinking", "思考", "思考"]),
    visible: (d: Parameters<typeof values>[1]) => d.parameters.prompt_extend !== false,
  },
];
export const combination: ModelCombination = {
  id: "qwen-image-2.1-turbo:runware",
  family: "Qwen",
  model: "qwen-image-2.1-turbo",
  label: "Qwen Image 2.1-turbo",
  provider: "runware",
  protocol: "runware",
  maxReferences: 10,
  fields,
  inputPolicy: undefined,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height", "size", "image_size"] },
    {
      id: "generation",
      fields: [
        "seed",
        "n",
        "num_images",
        "numberResults",
        "prompt_extend",
        "prompt_extend_mode",
        "enable_prompt_expansion",
        "enable_thinking",
      ],
    },
    { id: "output", fields: ["output_format", "watermark", "sync_mode"], collapsed: true },
    { id: "advanced", fields: ["negative_prompt", "enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Qwen/qwen-image/"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters, 262144, 4194304, 8)];
    if (draft.prompt.length < 2 || draft.prompt.length > 3000) errors.push("prompt: 2–3000");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    if (typeof p.size === "string") p.size = p.size.replace(/\s*[x×]\s*/g, "*");
    return runware(
      "alibaba:qwen-image@2.1-turbo",
      p,
      context,
      take(p, {
        prompt_extend: "promptExtend",
        prompt_extend_mode: "promptExtendMode",
        enable_thinking: "thinking",
      }),
    );
  },
};
