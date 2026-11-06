import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, count, format, json, resolution, select, text, toggle } from "../../fields";
import { fal } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];
const sizes = ["1K", "2K", "4K"];
const web = toggle("enable_web_search", ["Web search", "联网搜索", "ウェブ検索"]);
const thinking = select("thinking_level", ["Thinking level", "思考强度", "思考レベル"], ["minimal", "medium", "high"]);
const fields: FieldDefinition[] = [
  aspect(["auto", ...ratios]),
  resolution(sizes),
  count("num_images", 4),
  format(),
  select("safety_tolerance", ["Safety tolerance", "审核容忍度", "安全許容度"], ["1", "2", "3", "4", "5", "6"]),
  adv(text("system_prompt", ["System instruction", "系统指令", "システム指示"])),
  adv(toggle("limit_generations", ["Limit generations", "限制生成数量", "生成数を制限"])),
  thinking,
  web,
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
  adv(json("history", ["Conversation", "会话", "会話"])),
  adv(json("context", ["Context", "上下文", "コンテキスト"])),
  adv(toggle("return_history", ["Return conversation", "返回会话", "会話を返す"])),
];

export const combination: ModelCombination = {
  id: "gemini-nano-banana-2.1:fal",
  family: "Nano Banana",
  model: "gemini-nano-banana-2.1",
  label: "Nano Banana 2.1",
  provider: "fal",
  protocol: "fal",
  maxReferences: 14,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height"] },
    {
      id: "generation",
      fields: ["thinking_level", "enable_web_search", "enable_image_search", "seed", "num_images", "numberResults"],
    },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "mime_type", "sync_mode", "limit_generations", "return_history"],
      collapsed: true,
    },
    {
      id: "advanced",
      fields: [
        "safety_tolerance",
        "system_prompt",
        "temperature",
        "top_p",
        "max_output_tokens",
        "history",
        "context",
        "previous_interaction_id",
        "uploadImagesToStorage",
      ],
      collapsed: true,
    },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Gemini/Nano-Banana-API.md"],
  outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters)];
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    return fal(`google/nano-banana-2.1${context.images.length ? "/edit" : ""}`, p, context);
  },
};
