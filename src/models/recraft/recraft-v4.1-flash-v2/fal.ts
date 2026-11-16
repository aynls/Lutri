import { text, toggle } from "../../fields";
import { fal, imageSize } from "../../requests";
import { values } from "../../shared";
import type { ModelCombination } from "../../types";
import { falVectorSizeErrors } from "../vector";
import { colorFields, flashV2, flashV2Errors } from "./shared";

const fields = [
  text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
  ...colorFields,
  toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"]),
];

export const recraftV41FlashV2Fal: ModelCombination = {
  ...flashV2,
  id: `${flashV2.model}:fal`,
  provider: "fal",
  protocol: "fal",
  fields,
  groups: [
    { id: "frame", fields: ["image_size"] },
    { id: "style", fields: ["colors", "background_color"], collapsed: true },
    { id: "advanced", fields: ["enable_safety_checker"], collapsed: true },
  ],
  outputCount: () => 1,
  validate: (draft) => [...flashV2Errors(fields, draft, "fal"), ...falVectorSizeErrors(draft.parameters.image_size)],
  compile: (context) => {
    const p = values(fields, context.draft);
    imageSize(p);
    return fal("recraft/v4.1/flash/v2/text-to-image", p, context);
  },
};
