import { count, format, height, resolution, toggle, width } from "../fields";
import { runware, take } from "../requests";
import { values } from "../shared";
import type { FieldDefinition } from "../types";
import { minimax } from "./shared";

const fields: FieldDefinition[] = [
  { ...width(468, 7745), default: 2048 },
  { ...height(468, 7745), default: 2048 },
  resolution(["1K", "2K", "4K"]),
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
  {
    ...toggle("promptOptimizer", ["Prompt optimization", "提示词优化", "プロンプト最適化"]),
    visible: (draft) => !draft.references.length,
  },
];

export const minimaxRunware = (highspeed: boolean) =>
  minimax(highspeed, {
    provider: "runware",
    protocol: "runware",
    fields,
    inputPolicy: { minEdge: 128, maxEdge: 8192, maxRatio: 4, maxBytes: 64 * 1024 * 1024 },
    initialRecovery: (id) => ({ remoteId: id }),
    outputCount: (p) => Number(p.numberResults ?? 1),
    compile: (context) => {
      const p = values(fields, context.draft);
      if (p.width === undefined && p.height === undefined && p.resolution === undefined) p.resolution = "2K";
      const settings = take(p, { promptOptimizer: "promptOptimizer" });
      return runware(`minimax:h3@image${highspeed ? "-highspeed" : ""}`, p, context, settings);
    },
  });
