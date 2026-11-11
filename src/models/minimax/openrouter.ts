import { count, format, text, toggle } from "../fields";
import { openRouter } from "../requests";
import { values } from "../shared";
import type { FieldDefinition } from "../types";
import { minimax } from "./shared";

const fields: FieldDefinition[] = [
  { ...text("size", ["Image size", "图片尺寸", "画像サイズ"]), default: "2048x2048" },
  count("n", 10),
  format("output_format", ["png", "jpeg", "webp"]),
  {
    ...toggle("enable_prompt_expansion", ["Prompt optimization", "提示词优化", "プロンプト最適化"]),
    visible: (draft) => !draft.references.length,
  },
];

export const minimaxOpenRouter = (highspeed: boolean) =>
  minimax(highspeed, {
    provider: "openrouter",
    protocol: "images",
    fields,
    outputCount: (p) => Number(p.n ?? 1),
    compile: (context) => {
      const p = values(fields, context.draft);
      if (typeof p.enable_prompt_expansion === "boolean")
        p.provider = { options: { minimax: { disable_prompt_enhanced: !p.enable_prompt_expansion } } };
      delete p.enable_prompt_expansion;
      return openRouter(
        `minimax/minimax-h3-image${highspeed ? "-highspeed" : ""}`,
        { size: "2048x2048", ...p },
        context,
      );
    },
  });
