import { count, format, height, toggle, width } from "../fields";
import { fal } from "../requests";
import { values } from "../shared";
import type { FieldDefinition } from "../types";
import { minimax } from "./shared";

const fields: FieldDefinition[] = [
  { ...width(468, 7745), default: 2048 },
  { ...height(468, 7745), default: 2048 },
  count("num_images", 10),
  format("output_format", ["png", "jpeg", "webp"]),
  {
    ...toggle("enable_prompt_expansion", ["Prompt optimization", "提示词优化", "プロンプト最適化"]),
    visible: (draft) => !draft.references.length,
  },
];

export const minimaxFal = (highspeed: boolean) =>
  minimax(highspeed, {
    provider: "fal",
    protocol: "fal",
    fields,
    inputPolicy: { minEdge: 128, maxEdge: 8192 },
    outputCount: (p) => Number(p.num_images ?? 1),
    compile: (context) => {
      const p = values(fields, context.draft);
      p.image_size = p.width && p.height ? { width: p.width, height: p.height } : { width: 2048, height: 2048 };
      delete p.width;
      delete p.height;
      return fal(
        `minimax/h3-image/${highspeed ? "highspeed/" : ""}${context.images.length ? "edit" : "text-to-image"}`,
        p,
        context,
      );
    },
  });
