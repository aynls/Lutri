import { label, localize } from "../../../i18n";
import { adv, format, resolution, select, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";
import { background, maiImage27Defaults, maxPixels, minEdge } from "./shared";

const presets = {
  square_hd: label("1:1", "1:1", "1:1"),
  landscape_4_3: label("4:3", "4:3", "4:3"),
  portrait_4_3: label("3:4", "3:4", "3:4"),
  landscape_3_2: label("3:2", "3:2", "3:2"),
  portrait_3_2: label("2:3", "2:3", "2:3"),
  landscape_16_9: label("16:9", "16:9", "16:9"),
  portrait_16_9: label("9:16", "9:16", "9:16"),
};
const presetOptions = Object.keys(presets);
const fields: FieldDefinition[] = [
  {
    ...select("image_size", ["Size preset", "尺寸预设", "サイズプリセット"], ["auto", ...presetOptions, "custom"]),
    optionLabels: {
      auto: label("Auto", "自动", "自動"),
      ...presets,
      custom: label("Custom", "自定义", "カスタム"),
    },
  },
  {
    key: "size",
    kind: "size",
    label: label("Width × height", "宽 × 高", "幅 × 高さ"),
    visible: (draft) => draft.parameters.image_size === "custom",
  },
  {
    ...resolution(["1K", "2K"]),
    visible: (draft) => presetOptions.includes(String(draft.parameters.image_size)),
  },
  background,
  format(),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
];

export function maiImage27Fal(model: string, label: string, path: string): ModelCombination {
  return {
    ...maiImage27Defaults,
    id: `${model}:fal`,
    model,
    label,
    provider: "fal",
    protocol: "fal",
    fields,
    groups: [
      { id: "frame", fields: ["image_size", "size", "resolution"] },
      { id: "generation", fields: ["background"] },
      { id: "output", fields: ["output_format", "sync_mode"], collapsed: true },
    ],
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      const parameters = draft.parameters;
      if (parameters.image_size === "custom") {
        const dimensions = { image_size: parameters.size };
        imageSize(dimensions);
        const parsed = dimensions.image_size;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) errors.push(localize(sizeRequired));
        else {
          const { width, height } = parsed;
          if (
            typeof width !== "number" ||
            typeof height !== "number" ||
            width < minEdge ||
            height < minEdge ||
            width * height > maxPixels
          )
            errors.push(localize(sizeLimits));
        }
      }
      if (parameters.background === "transparent" && parameters.output_format === "jpeg")
        errors.push(localize(transparentFormat));
      return errors;
    },
    compile: (context) => {
      const parameters = values(fields, context.draft);
      if (parameters.image_size === "custom") {
        parameters.image_size = parameters.size;
        delete parameters.size;
        imageSize(parameters);
      } else if (parameters.image_size === "auto") delete parameters.image_size;
      return fal(`${path}/${context.images.length ? "edit" : "text-to-image"}`, parameters, context);
    },
  };
}

const sizeRequired = label("Enter width × height", "请输入宽 × 高", "幅 × 高さを入力してください");
const sizeLimits = label(
  "Each side must be at least 768 px, with at most 4,194,304 pixels total",
  "每边至少 768 像素，总像素最多 4,194,304",
  "各辺は 768 ピクセル以上、総画素数は 4,194,304 以下です",
);
const transparentFormat = label(
  "Transparent background requires PNG or WebP",
  "透明背景需使用 PNG 或 WebP",
  "透明背景には PNG または WebP が必要です",
);
