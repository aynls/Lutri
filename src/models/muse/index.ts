import { ParameterFields } from "../../create/components/Fields";
import { adv, count, format, resolution, select, text, toggle } from "../fields";
import { fal, runware, take } from "../requests";
import { request, validateFields, values } from "../shared";
import type { ModelCombination, ProviderId } from "../types";
function make(provider: ProviderId): ModelCombination {
  const sizes = [
    "1600x1600",
    "1920x1280",
    "1280x1920",
    "1792x1344",
    "1344x1792",
    "2048x1152",
    "1152x2048",
    "2352x1008",
  ];
  const fields =
    provider === "runware"
      ? [
          select("size", ["Image size", "图片尺寸", "画像サイズ"], sizes),
          resolution(["2K"]),
          count("numberResults", 20),
          format("outputFormat", ["JPG", "PNG", "WEBP"]),
          toggle("webSearch", ["Web search", "联网搜索", "ウェブ検索"]),
          toggle("imageSearch", ["Image search", "图片搜索", "画像検索"]),
          toggle("shell", ["Code execution", "代码执行", "コード実行"]),
          select("thinkingLevel", ["Thinking level", "思考强度", "思考レベル"], ["high", "low"]),
          select("moderation", ["Moderation", "审核", "モデレーション"], ["auto", "low"]),
        ]
      : [
          text(provider === "fal" ? "aspect_ratio" : "size", ["Image size", "图片尺寸", "画像サイズ"]),
          count(provider === "fal" ? "num_images" : "n", 10),
          format(),
          ...(provider === "fal"
            ? [adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"]))]
            : [
                adv(select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"])),
                adv(toggle("stream", ["Stream", "流式传输", "ストリーミング"])),
              ]),
        ];
  return {
    id: `muse-image:${provider}`,
    model: "muse-image",
    family: "Muse",
    label: "Muse Image",
    provider,
    protocol: provider === "fal" || provider === "runware" ? provider : "images",
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
    initialRecovery: provider === "runware" ? (id) => ({ remoteId: id }) : undefined,
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      if (provider === "runware" && draft.parameters.resolution && (!draft.references.length || draft.parameters.size))
        errors.push("resolution: references, no size");
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft);
      if (provider === "fal")
        return fal(`meta/muse-image/${context.images.length ? "edit" : "text-to-image"}`, p, context);
      if (provider === "runware") {
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
      }
      return request("meta", `https://api.meta.ai/v1/images/${context.images.length ? "edits" : "generations"}`, {
        ...p,
        model: "muse-image-1.0",
        prompt: context.prompt,
        ...(context.images.length ? { images: context.images.map((image_url) => ({ image_url })) } : {}),
      });
    },
  };
}
export const museCombinations = (["meta", "fal", "runware"] as const).map(make);
