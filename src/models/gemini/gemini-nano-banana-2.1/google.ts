import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, format, resolution, select, text, toggle } from "../../fields";
import { inlineData } from "../../requests";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];
const sizes = ["1K", "2K", "4K"];
const web = toggle("enable_web_search", ["Web search", "联网搜索", "ウェブ検索"]);
const thinking = select("thinking_level", ["Thinking level", "思考强度", "思考レベル"], ["minimal", "medium", "high"]);
const fields: FieldDefinition[] = [
  aspect(ratios),
  resolution(sizes),
  format("mime_type", ["image/png", "image/jpeg"]),
  web,
  thinking,
  adv(text("previous_interaction_id", ["Previous interaction", "上一轮交互", "前の対話"])),
];

export const combination: ModelCombination = {
  id: "gemini-nano-banana-2.1:google",
  family: "Nano Banana",
  model: "gemini-nano-banana-2.1",
  label: "Nano Banana 2.1",
  provider: "google",
  protocol: "interactions",
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
    const compiled = request("google", "https://generativelanguage.googleapis.com/v1beta/interactions", {
      model: "gemini-nano-banana-2.1",
      input: [
        { type: "text", text: context.prompt },
        ...context.images.map((image) => {
          const data = inlineData(image);
          return { type: "image", mime_type: data.mimeType, data: data.data };
        }),
      ],
      response_format: {
        type: "image",
        ...(p.aspect_ratio ? { aspect_ratio: p.aspect_ratio } : {}),
        ...(p.resolution ? { image_size: p.resolution } : {}),
        ...(p.mime_type ? { mime_type: p.mime_type } : {}),
      },
      ...(p.enable_web_search ? { tools: [{ type: "google_search" }] } : {}),
      ...(p.thinking_level ? { generation_config: { thinking_level: p.thinking_level } } : {}),
      ...(p.previous_interaction_id ? { previous_interaction_id: p.previous_interaction_id } : {}),
    });
    compiled.headers = { "Api-Revision": "2026-05-20" };
    return compiled;
  },
};
