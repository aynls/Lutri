import { ParameterFields } from "../../../create/components/Fields";
import { c } from "../../../create/messages";
import { compilePrompt } from "../../../domain/references";
import type { GenerationDraft, Json } from "../../../domain/types";
import { label, localize } from "../../../i18n";
import { count, json, seed, select, toggle } from "../../fields";
import { imageSize } from "../../requests";
import { request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { falImageSizeAllowed, falSafety, falSize, falSync } from "../falFields";

const generatedSizes = new Set([
  "1024x1024",
  "1024x3072",
  "1120x896",
  "1152x2944",
  "1152x864",
  "1248x3328",
  "1248x832",
  "1280x3072",
  "1280x720",
  "1280x800",
  "1296x3168",
  "1440x2560",
  "1440x2880",
  "1440x720",
  "1600x2560",
  "1664x2496",
  "1728x2304",
  "1792x2240",
  "2048x2048",
  "2240x1792",
  "2304x1728",
  "2496x1664",
  "2560x1440",
  "2560x1600",
  "2880x1440",
  "2944x1152",
  "3072x1024",
  "3072x1280",
  "3168x1296",
  "3328x1248",
  "720x1280",
  "720x1440",
  "800x1280",
  "832x1248",
  "864x1152",
  "896x1120",
]);
const maximumArea = 4194304;
const precise = (draft: GenerationDraft) => draft.parameters.edit_precision === "high";
const canSetImageSize = (draft: GenerationDraft) => !draft.mask && !precise(draft);

const fields: FieldDefinition[] = [
  { ...falSize, visible: canSetImageSize },
  {
    ...select("edit_precision", ["Edit mode", "编辑方式", "編集モード"], ["regular", "high"]),
    optionLabels: {
      regular: label("Standard edit", "常规编辑", "通常編集"),
      high: label("Precise edit", "精确编辑", "精密編集"),
    },
    visible: (draft) => draft.references.length > 0 || precise(draft),
  },
  select("quality", ["Quality", "质量", "品質"], ["very_low", "low", "medium", "high"]),
  {
    ...toggle("enable_prompt_expansion", ["Expand prompt", "扩展提示词", "プロンプト拡張"]),
    visible: (draft) => draft.references.length === 0,
  },
  seed(),
  count("num_images", 8),
  {
    ...select("context_window", ["Automatic region", "自动区域", "自動領域"], ["none", "auto"]),
    optionLabels: { none: label("Off", "关闭", "オフ"), auto: label("From mask", "根据蒙版", "マスクから") },
    default: "none",
    allowDefault: false,
    visible: precise,
  },
  {
    ...json("context_window_box", ["Context window box", "上下文区域坐标", "コンテキスト領域の座標"]),
    visible: precise,
  },
  falSafety,
  falSync,
];

function validRegionSize(width: number, height: number) {
  return (
    width >= 256 && height >= 256 && width * height <= maximumArea && Math.max(width / height, height / width) <= 6
  );
}

function validContextWindowBox(value: Json): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { x_min, y_min, x_max, y_max } = value;
  return (
    typeof x_min === "number" &&
    typeof y_min === "number" &&
    typeof x_max === "number" &&
    typeof y_max === "number" &&
    [x_min, y_min, x_max, y_max].every(Number.isSafeInteger) &&
    x_min >= 0 &&
    y_min >= 0 &&
    validRegionSize(x_max - x_min, y_max - y_min)
  );
}

export const ideogram45Fal: ModelCombination = {
  id: "ideogram-4.5:fal",
  model: "ideogram-4.5",
  family: "Ideogram",
  label: "Ideogram 4.5",
  provider: "fal",
  protocol: "fal",
  maxReferences: 5,
  primaryReference: true,
  mask: "black",
  promptLimit: { min: 1, max: 10000 },
  fields,
  groups: [
    { id: "frame", fields: ["image_size"] },
    { id: "generation", fields: ["edit_precision", "quality", "enable_prompt_expansion", "seed", "num_images"] },
    { id: "output", fields: ["sync_mode"], collapsed: true },
    { id: "advanced", fields: ["context_window", "context_window_box", "enable_safety_checker"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Ideogram/Ideogram-4.md"],
  outputCount: (p) => (typeof p.num_images === "number" ? p.num_images : 1),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    const editing = draft.references.length > 0;
    const { image_size, quality, context_window, context_window_box } = draft.parameters;
    if (!draft.prompt.trim() || compilePrompt(draft, draft.references).length > 10000)
      errors.push(`${c("promptLimit")}: 1–10000`);
    if (!editing && (precise(draft) || quality === "very_low")) errors.push(c("chooseEditTarget"));
    if (draft.mask && draft.references.length > 4) errors.push(c("tooMany"));
    if (precise(draft)) {
      if (context_window === "auto" && !draft.mask)
        errors.push(
          localize(label("Add a mask for the automatic region", "自动区域需要蒙版", "自動領域にはマスクが必要です")),
        );
      if (context_window_box != null && context_window_box !== "") {
        if (!validContextWindowBox(context_window_box)) errors.push(`context_window_box: ${c("invalidDimensions")}`);
        if (context_window === "auto")
          errors.push(
            localize(label("Choose one editing region", "请选择一种编辑区域", "編集領域を一つ選択してください")),
          );
      }
    }
    if (canSetImageSize(draft)) {
      const valid = falImageSizeAllowed(image_size, editing, (width, height) =>
        editing
          ? width % 32 === 0 && height % 32 === 0 && validRegionSize(width, height)
          : generatedSizes.has(`${width}x${height}`),
      );
      if (!valid) errors.push(`image_size: ${c("invalidDimensions")}`);
    }
    return errors;
  },
  compile: (context) => {
    const parameters = values(fields, context.draft);
    imageSize(parameters);
    const [source, ...references] = context.images;
    if (!source && (precise(context.draft) || parameters.quality === "very_low"))
      throw new Error(c("chooseEditTarget"));
    return request("fal", `https://queue.fal.run/ideogram/v4.5${source ? "/edit" : ""}`, {
      ...parameters,
      prompt: context.prompt,
      ...(source ? { image_url: source } : {}),
      ...(references.length ? { reference_image_urls: references } : {}),
      ...(context.mask ? { mask_url: context.mask } : {}),
    });
  },
};
