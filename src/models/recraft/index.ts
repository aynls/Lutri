import { ParameterFields } from "../../create/components/Fields";
import { count, format, json, select, text, toggle, seed } from "../fields";
import { fal, imageSize, runware, take } from "../requests";
import { request, validateFields, values } from "../shared";
import type { ModelCombination, ProviderId } from "../types";
const variants = [
  { id: "v4.1", native: "recraftv4_1", runware: "recraft:v4.1@0", fal: "fal-ai/recraft/v4.1" },
  { id: "v4.1-pro", native: "recraftv4_1_pro", runware: "recraft:v4.1-pro@0", fal: "fal-ai/recraft/v4.1/pro" },
  {
    id: "v4.1-utility",
    native: "recraftv4_1_utility",
    runware: "recraft:v4.1-utility@0",
    fal: "fal-ai/recraft/v4.1/utility",
  },
  {
    id: "v4.1-utility-pro",
    native: "recraftv4_1_utility_pro",
    runware: "recraft:v4.1-utility-pro@0",
    fal: "fal-ai/recraft/v4.1/utility/pro",
  },
  { id: "v4-styles", native: "recraftv4_styles", runware: "recraft:v4@styles", fal: "recraft/v4/style" },
  {
    id: "v4-styles-pro",
    native: "recraftv4_styles_pro",
    runware: "recraft:v4@styles-pro",
    fal: "recraft/v4/style/pro",
  },
];
function make(variant: (typeof variants)[number], provider: ProviderId): ModelCombination {
  const styles = variant.id.includes("styles"),
    pro = variant.id.endsWith("pro");
  const sizes = [
    [1024, 1024],
    [1536, 768],
    [768, 1536],
    [1280, 832],
    [832, 1280],
    [1216, 896],
    [896, 1216],
    [1152, 896],
    [896, 1152],
    [832, 1344],
    [1280, 896],
    [896, 1280],
    [1344, 768],
    [768, 1344],
  ].map((pair) => pair.map((value) => value * (pro ? 2 : 1)).join("x"));
  const fields = [
    provider === "runware"
      ? select("size", ["Image size", "图片尺寸", "画像サイズ"], sizes)
      : text(provider === "fal" ? "image_size" : "size", ["Image size", "图片尺寸", "画像サイズ"]),
    ...(provider !== "fal"
      ? [count(provider === "runware" ? "numberResults" : "n", provider === "runware" ? 20 : 6)]
      : []),
    json("colors", ["Palette", "配色", "パレット"]),
    json("background_color", ["Background color", "背景色", "背景色"]),
    ...(styles || provider === "recraft"
      ? [
          text("style_id", ["Style ID", "风格 ID", "スタイル ID"]),
          select("style_match", ["Style matching", "风格匹配", "スタイル適合"], ["precise", "flexible"]),
        ]
      : []),
    ...(provider === "fal"
      ? [toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])]
      : provider === "runware"
        ? [format("outputFormat", ["JPG", "PNG", "WEBP"])]
        : [
            seed(4294967295, "random_seed"),
            format("image_format", ["webp", "png"]),
            select("response_format", ["Response format", "返回格式", "応答形式"], ["url", "b64_json"]),
          ]),
  ];
  return {
    id: `recraft-${variant.id}:${provider}`,
    model: `recraft-${variant.id}`,
    family: "Recraft",
    label: `Recraft ${variant.id.replace(/-/g, " ")}`,
    provider,
    protocol: provider === "fal" || provider === "runware" ? provider : "images",
    maxReferences: styles ? 10 : provider === "recraft" ? 1 : 0,
    fields,
    Form: ParameterFields,
    docs: ["doc/model/Recraft/Recraft-V4.md"],
    outputCount: (p) => Number(p.n ?? p.numberResults ?? 1),
    initialRecovery: provider === "runware" ? (id) => ({ remoteId: id }) : undefined,
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      if (draft.prompt.length > 10000) errors.push("prompt ≤ 10000");
      if (provider === "runware" && !styles && !draft.parameters.size) errors.push("size");
      if (styles && !draft.references.length && !draft.parameters.style_id) errors.push("style_id / references");
      if (provider === "runware" && styles && draft.references.length && draft.parameters.style_id)
        errors.push("style_id / references");
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft);
      if (provider === "fal") {
        imageSize(p);
        return fal(`${variant.fal}/text-to-image`, p, context);
      }
      if (provider === "runware") {
        if (p.size) {
          const [width, height] = String(p.size).split("x").map(Number);
          p.width = width;
          p.height = height;
          delete p.size;
        }
        const settings = take(p, { style_match: "styleMatch", colors: "colors", background_color: "backgroundColor" }),
          inputs = take(p, { style_id: "styleId" });
        return runware(variant.runware, p, context, settings, inputs);
      }
      const controls = take(p, { colors: "colors", background_color: "background_color" });
      if (context.images.length && !styles) {
        const compiled = request("recraft", "https://external.api.recraft.ai/v1/images/imageToImage", null);
        delete compiled.body;
        compiled.multipart = [
          { name: "image", dataUrl: context.images[0] },
          { name: "model", text: variant.native },
          { name: "prompt", text: context.prompt },
          ...(Object.keys(controls).length ? [{ name: "controls", text: JSON.stringify(controls) }] : []),
          ...Object.entries(p).map(([name, value]) => ({
            name,
            text: typeof value === "string" ? value : JSON.stringify(value),
          })),
        ];
        return compiled;
      }
      return request("recraft", "https://external.api.recraft.ai/v1/images/generations", {
        ...p,
        model: variant.native,
        prompt: context.prompt,
        ...(Object.keys(controls).length ? { controls } : {}),
        ...(context.images.length ? { style_reference_urls: context.images } : {}),
      });
    },
  };
}
export const recraftCombinations = variants.flatMap((variant) =>
  (["recraft", "runware", "fal"] as const).map((provider) => make(variant, provider)),
);
