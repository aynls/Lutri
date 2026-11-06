import { ParameterFields } from "../../create/components/Fields";
import { count, format, resolution, select, toggle } from "../fields";
import { runware, take } from "../requests";
import { validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

const fields: FieldDefinition[] = [
  select(
    "size",
    ["Image size", "图片尺寸", "画像サイズ"],
    ["1600x1600", "1920x1280", "1280x1920", "1792x1344", "1344x1792", "2048x1152", "1152x2048", "2352x1008"],
  ),
  resolution(["2K"]),
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
  toggle("webSearch", ["Web search", "联网搜索", "ウェブ検索"]),
  toggle("imageSearch", ["Image search", "图片搜索", "画像検索"]),
  toggle("shell", ["Code execution", "代码执行", "コード実行"]),
  select("thinkingLevel", ["Thinking level", "思考强度", "思考レベル"], ["high", "low"]),
  select("moderation", ["Moderation", "审核", "モデレーション"], ["auto", "low"]),
];

export const museImageRunware: ModelCombination = {
  id: "muse-image:runware",
  model: "muse-image",
  family: "Muse",
  label: "Muse Image",
  provider: "runware",
  protocol: "runware",
  maxReferences: 10,
  fields,
  groups: [
    { id: "frame", fields: ["size", "aspect_ratio", "resolution"] },
    {
      id: "generation",
      fields: ["webSearch", "imageSearch", "shell", "thinkingLevel", "n", "num_images", "numberResults"],
    },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "response_format", "stream", "sync_mode"],
      collapsed: true,
    },
    { id: "advanced", fields: ["moderation"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Muse/Muse-Image.md"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    if (draft.parameters.resolution && (!draft.references.length || draft.parameters.size))
      errors.push("resolution: references, no size");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    if (p.size) {
      const [width, height] = String(p.size).split("x").map(Number);
      p.width = width;
      p.height = height;
      delete p.size;
    }
    return runware(
      "meta:muse@image",
      p,
      context,
      take(p, {
        webSearch: "webSearch",
        imageSearch: "imageSearch",
        shell: "shell",
        thinkingLevel: "thinkingLevel",
        moderation: "moderation",
      }),
    );
  },
};
