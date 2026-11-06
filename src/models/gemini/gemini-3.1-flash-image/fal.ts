import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, count, format, json, resolution, select, text, toggle, seed, number } from "../../fields";
import { fal } from "../../requests";
import { dimensionErrors, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];
const sizes = ["0.5K", "1K", "2K", "4K"];
const web = toggle("enable_web_search", ["Web search", "联网搜索", "ウェブ検索"]);
const thinking = select("thinking_level", ["Thinking level", "思考强度", "思考レベル"], ["minimal", "high"]);
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
  toggle("enable_image_search", ["Image search", "图片搜索", "画像検索"]),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
  adv(json("history", ["Conversation", "会话", "会話"])),
  seed(),
  adv({ ...number("temperature", ["Temperature", "温度", "温度"], 0, 2, 0.01), integer: false }),
  adv({ ...number("top_p", ["Top P", "Top P", "Top P"], 0, 1, 0.01), integer: false }),
  adv(number("max_output_tokens", ["Output token limit", "输出令牌上限", "出力トークン上限"], 1, 65536)),
  adv(json("context", ["Context", "上下文", "コンテキスト"])),
  adv(toggle("return_history", ["Return conversation", "返回会话", "会話を返す"])),
];

export const combination: ModelCombination = {
  id: "gemini-3.1-flash-image:fal",
  family: "Nano Banana",
  model: "gemini-3.1-flash-image",
  label: "Nano Banana 2",
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
    return fal(`fal-ai/nano-banana-2${context.images.length ? "/edit" : ""}`, p, context);
  },
};
