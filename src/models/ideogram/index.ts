import { ParameterFields } from "../../create/components/Fields";
import { adv, count, json, seed, select, text, toggle } from "../fields";
import { runware, take } from "../requests";
import { request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination, ProviderId } from "../types";
function make(version: "4.0" | "4.5", provider: ProviderId): ModelCombination {
  const editing = version === "4.5";
  const quality = select("quality", ["Quality", "质量", "品質"], ["very_low", "low", "medium", "high"]);
  const magic = {
    ...select("magic_prompt", ["Magic prompt", "提示词增强", "プロンプト強化"], ["auto", "on", "off"]),
    visible: (d: Parameters<typeof values>[1]) =>
      d.parameters.edit_mode !== "precise" && !(provider === "runware" && d.references.length),
  };
  const fields: FieldDefinition[] = [
    ...(editing
      ? [
          {
            ...select("edit_mode", ["Edit mode", "编辑方式", "編集モード"], ["generate", "precise"]),
            visible: (d: Parameters<typeof values>[1]) => d.references.length > 0 && provider !== "runware",
          },
          quality,
          {
            ...text("context_window", ["Context window", "上下文区域", "コンテキスト領域"]),
            advanced: true,
            visible: (d: Parameters<typeof values>[1]) => d.parameters.edit_mode === "precise",
          },
        ]
      : [
          select(
            "rendering_speed",
            ["Rendering speed", "渲染速度", "描画速度"],
            provider === "ideogram" ? ["turbo", "default", "quality"] : ["TURBO", "DEFAULT", "QUALITY"],
          ),
          ...(provider !== "ideogram"
            ? [adv(json("structured_prompt", ["Structured prompt", "结构化提示词", "構造化プロンプト"]))]
            : []),
        ]),
    {
      ...text("size", ["Image size", "图片尺寸", "画像サイズ"]),
      visible: (d: Parameters<typeof values>[1]) => !d.mask && d.parameters.edit_mode !== "precise",
    },
    ...(provider !== "comfy" || editing
      ? [magic, seed(), count(provider === "runware" ? "numberResults" : "num_images", provider === "runware" ? 20 : 8)]
      : []),
    ...(provider === "comfy"
      ? [adv(toggle("enable_copyright_detection", ["Copyright detection", "版权检测", "著作権チェック"]))]
      : []),
  ];
  return {
    id: `ideogram-${version}:${provider}`,
    model: `ideogram-${version}`,
    family: "Ideogram",
    label: `Ideogram ${version}`,
    provider,
    protocol: provider === "runware" ? "runware" : provider === "ideogram" ? "ideogram" : "images",
    maxReferences: editing ? 5 : 0,
    mask: editing ? (provider === "runware" ? "white" : "black") : undefined,
    fields,
    inputPolicy:
      provider === "comfy"
        ? (draft) => ({
            maxBytes:
              draft.parameters.context_window && draft.parameters.edit_mode === "precise"
                ? 50_000_000
                : 25 * 1024 * 1024,
            totalBytes:
              (draft.parameters.context_window && draft.parameters.edit_mode === "precise" ? 128 : 64) * 1024 * 1024,
            mediaTypes: ["image/png", "image/webp", "image/jpeg"],
          })
        : undefined,
    primaryReference: editing,
    promptLimit: { max: 10000 },
    groups: [
      { id: "frame", fields: ["size"] },
      {
        id: "generation",
        fields: ["edit_mode", "quality", "rendering_speed", "magic_prompt", "seed", "num_images", "numberResults"],
      },
      {
        id: "advanced",
        fields: ["context_window", "structured_prompt", "enable_copyright_detection"],
        collapsed: true,
      },
    ],
    Form: ParameterFields,
    docs: ["doc/model/Ideogram/Ideogram-4.md"],
    outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
    initialRecovery: provider === "runware" ? (id) => ({ remoteId: id }) : undefined,
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      if (draft.prompt.length > 10000) errors.push("prompt ≤ 10000");
      if (provider === "ideogram" && draft.mask && draft.parameters.edit_mode !== "precise")
        errors.push("mask: precise edit");
      if (draft.parameters.quality === "very_low" && !draft.references.length) errors.push("very_low: references ≥ 1");
      if (draft.mask && draft.references.length > 4) errors.push("mask: references ≤ 4");
      if (draft.parameters.context_window === "auto" && !draft.mask) errors.push("context_window auto: mask");
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft),
        precise = p.edit_mode === "precise" && context.images.length > 0;
      delete p.edit_mode;
      if (provider === "runware") {
        if (p.size) {
          const [width, height] = String(p.size).split("x").map(Number);
          p.width = width;
          p.height = height;
          delete p.size;
        }
        const settings = take(p, {
          quality: "quality",
          magic_prompt: "magicPrompt",
          rendering_speed: "renderingSpeed",
          structured_prompt: "structuredPrompt",
        });
        const compiled = runware(editing ? "ideogram:4.5@0" : "ideogram:4@0", p, context, settings);
        if (settings.structuredPrompt && Array.isArray(compiled.body))
          delete (compiled.body[0] as Record<string, unknown>).positivePrompt;
        return compiled;
      }
      if (provider === "comfy") {
        const structured = p.structured_prompt;
        delete p.structured_prompt;
        if (!editing && p.size) {
          p.resolution = p.size;
          delete p.size;
        }
        const compiled = request(
          provider,
          `https://api.comfy.org/v2/models/ideogram/${editing ? "ideogram-4-5" : "ideogram-v4"}`,
          {
            ...p,
            ...(editing
              ? { prompt: context.prompt }
              : structured
                ? { json_prompt: structured }
                : { text_prompt: context.prompt }),
            ...(context.images.length
              ? precise
                ? { image: context.images[0], reference_images: context.images.slice(1) }
                : { images: context.images }
              : {}),
            ...(context.mask ? { mask: context.mask } : {}),
          },
        );
        compiled.authHeader = "X-API-Key";
        compiled.authPrefix = "";
        return compiled;
      }
      if (p.size) {
        p.resolution = p.size;
        delete p.size;
      }
      const compiled = request(
        "ideogram",
        `https://api.ideogram.ai/v2/image/${precise ? "precise-edit" : "generate"}/${editing ? "ideogram-4-5" : "ideogram-4"}`,
        { ...p, prompt: context.prompt, async: true },
      );
      if (context.images.length) {
        delete compiled.body;
        compiled.multipart = [
          { name: "prompt", text: context.prompt },
          { name: "async", text: "true" },
          ...Object.entries(p).map(([name, value]) => ({
            name,
            text: typeof value === "string" ? value : JSON.stringify(value),
          })),
          ...context.images.map((dataUrl, index) => ({
            name: precise ? (index === 0 ? "image" : "reference_images") : "images",
            dataUrl,
          })),
          ...(context.mask ? [{ name: "mask", dataUrl: context.mask }] : []),
        ];
      }
      return compiled;
    },
  };
}
export const ideogramCombinations = (["4.0", "4.5"] as const).flatMap((version) =>
  (["ideogram", "runware", "comfy"] as const).map((provider) => make(version, provider)),
);
