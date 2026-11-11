import { count, format, text } from "../fields";
import { openRouter } from "../requests";
import { values } from "../shared";
import type { FieldDefinition } from "../types";
import { minimax } from "./shared";

const fields: FieldDefinition[] = [
  { ...text("size", ["Image size", "图片尺寸", "画像サイズ"]), default: "2048x2048" },
  count("n", 10),
  format("output_format", ["png", "jpeg", "webp"]),
];

export const minimaxOpenRouter = (highspeed: boolean) =>
  minimax(highspeed, {
    provider: "openrouter",
    protocol: "images",
    fields,
    outputCount: (p) => Number(p.n ?? 1),
    compile: (context) =>
      openRouter(
        `minimax/minimax-h3-image${highspeed ? "-highspeed" : ""}`,
        { size: "2048x2048", ...values(fields, context.draft) },
        context,
      ),
  });
