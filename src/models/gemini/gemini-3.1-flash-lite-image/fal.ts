import { ParameterFields } from "../../../create/components/Fields";
import { c } from "../../../create/messages";
import { adv, aspect, count, format, seed, select, text, toggle } from "../../fields";
import { fal } from "../../requests";
import { validateFields, values } from "../../shared";
import type { ModelCombination } from "../../types";

const ratios = [
  "auto",
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
  "1:4",
  "4:1",
  "1:8",
  "8:1",
];
const fields = [
  aspect(ratios),
  select("thinking_level", ["Thinking level", "思考强度", "思考レベル"], ["minimal", "high"]),
  count("num_images", 4),
  seed(),
  format(),
  toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"]),
  toggle("limit_generations", ["Limit generations", "限制生成数量", "生成数を制限"]),
  select("safety_tolerance", ["Safety tolerance", "审核容忍度", "安全許容度"], ["1", "2", "3", "4", "5", "6"]),
  adv(text("system_prompt", ["System instruction", "系统指令", "システム指示"], 50000)),
];

export const combination: ModelCombination = {
  id: "gemini-3.1-flash-lite-image:fal",
  family: "Nano Banana",
  model: "gemini-3.1-flash-lite-image",
  label: "Nano Banana 2 Lite",
  provider: "fal",
  protocol: "fal",
  creationControl: "prompt",
  maxReferences: 14,
  promptLimit: { min: 3, max: 50000 },
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio"] },
    { id: "generation", fields: ["thinking_level", "num_images", "seed"] },
    { id: "output", fields: ["output_format", "sync_mode", "limit_generations"], collapsed: true },
    { id: "advanced", fields: ["safety_tolerance", "system_prompt"], collapsed: true },
  ],
  Form: ParameterFields,
  documentationPath: "doc/model/Gemini/Nano-Banana-API.md",
  outputCount: (p) => (typeof p.num_images === "number" ? p.num_images : 1),
  validate: (draft) => [
    ...validateFields(fields, draft),
    ...(draft.prompt.trim().length < 3 ? [`${c("promptLimit")}: 3–50000`] : []),
  ],
  compile: (context) =>
    fal(`google/nano-banana-2-lite${context.images.length ? "/edit" : ""}`, values(fields, context.draft), context),
};
