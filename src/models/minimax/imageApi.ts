import { c } from "../../create/messages";
import { compilePrompt } from "../../domain/references";
import type { GenerationDraft } from "../../domain/types";
import { label, localize } from "../../i18n";
import { commonRatios, count, format, number, select, text, toggle } from "../fields";
import { dimensionErrors, validateFields, values } from "../shared";
import type { CompileContext, FieldDefinition, ModelCombination } from "../types";

const automaticSize = ({ parameters }: GenerationDraft) => !parameters.size || parameters.size === "auto";
const aspectRatio = label("Aspect ratio", "宽高比", "アスペクト比");
const fixedFrameRequired = label(
  "Set a size or aspect ratio to disable prompt optimization",
  "关闭提示词优化需指定尺寸或宽高比",
  "プロンプト最適化を無効にするにはサイズかアスペクト比を指定してください",
);

const fields: FieldDefinition[] = [
  { ...text("size", ["Image size", "图片尺寸", "画像サイズ"]), min: 468, max: 7745 },
  {
    key: "aspect_ratio",
    kind: "text",
    label: aspectRatio,
    suggestions: [...commonRatios, "21:9", "9:21", "3:1", "1:3"],
    optionLabels: { auto: label("Auto", "自动", "自動") },
    visible: automaticSize,
  },
  {
    ...select("area", ["Resolution", "分辨率", "解像度"], ["1K", "2K", "4K"]),
    default: "2K",
    allowDefault: false,
    visible: automaticSize,
  },
  count("n", 10),
  format(),
  {
    ...number("output_compression", ["Compression quality", "压缩质量", "圧縮品質"], 0, 100),
    visible: (draft) => draft.parameters.output_format !== "png",
  },
  {
    ...toggle("enable_prompt_expansion", ["Prompt optimization", "提示词优化", "プロンプト最適化"]),
    visible: (draft) => !draft.references.length,
  },
];

function validate(draft: GenerationDraft): string[] {
  const p = values(fields, draft);
  const errors = validateFields(fields, draft);
  const promptLength = [...compilePrompt(draft, draft.references).trim()].length;
  if (promptLength < 1 || promptLength > 32000) errors.push(`${c("promptLimit")}: 1–32000`);

  if (!automaticSize(draft)) {
    if (typeof p.size !== "string" || !/^\d+x\d+$/.test(p.size)) errors.push(`${c("invalidDimensions")}: W × H`);
    else errors.push(...dimensionErrors(p, 655360, 20000000, 3));
  } else if (p.aspect_ratio && p.aspect_ratio !== "auto") {
    const ratio = typeof p.aspect_ratio === "string" ? /^(\d{1,3}):(\d{1,3})$/.exec(p.aspect_ratio) : null;
    const width = Number(ratio?.[1]);
    const height = Number(ratio?.[2]);
    if (
      !ratio ||
      width < 1 ||
      height < 1 ||
      width > 300 ||
      height > 300 ||
      Math.max(width / height, height / width) > 3
    )
      errors.push(`${localize(aspectRatio)}: 1:3–3:1 (1–300)`);
  } else if (p.enable_prompt_expansion === false) {
    errors.push(localize(fixedFrameRequired));
  }
  return errors;
}

export const imageApi: Pick<ModelCombination, "protocol" | "fields" | "inputPolicy" | "outputCount" | "validate"> = {
  protocol: "images",
  fields,
  inputPolicy: {
    minEdge: 128,
    maxEdge: 8192,
    maxRatio: 4,
    mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  },
  outputCount: (p) => Number(p.n ?? 1),
  validate,
};

export function imageBody(context: CompileContext) {
  const { enable_prompt_expansion, ...parameters } = values(fields, context.draft);
  return {
    ...parameters,
    prompt: context.prompt,
    ...(context.images.length
      ? { images: context.images.map((image_url) => ({ image_url })) }
      : typeof enable_prompt_expansion === "boolean"
        ? { disable_prompt_enhanced: !enable_prompt_expansion }
        : {}),
  };
}
