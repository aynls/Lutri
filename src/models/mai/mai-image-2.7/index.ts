import { maiImage27Azure } from "./azure";
import { maiImage27Fal } from "./fal";
import { maiImage27OpenRouter } from "./openrouter";

const variants = [
  { model: "mai-image-2.7", label: "MAI Image 2.7", falPath: "microsoft/mai-image-2.7" },
  { model: "mai-image-2.7-flash", label: "MAI Image 2.7 Flash", falPath: "microsoft/mai-image-2.7/flash" },
];

export const maiImage27Combinations = variants.flatMap(({ model, label, falPath }) => [
  maiImage27Azure(model, label),
  maiImage27OpenRouter(model, label),
  maiImage27Fal(model, label, falPath),
]);
