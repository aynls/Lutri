import type { Json, Parameters } from "../../domain/types";
import { text, toggle } from "../fields";
import { imageSize } from "../requests";

const imagePresets = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"];
export const falSize = {
  ...text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
  suggestions: imagePresets,
};
export const falSafety = toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"]);
export const falSync = toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"]);

export function falImageSizeAllowed(
  size: Json | undefined,
  editing: boolean,
  dimensionsAllowed: (width: number, height: number) => boolean,
): boolean {
  if (size === undefined || size === null || size === "" || (editing && size === "auto")) return true;
  if (typeof size !== "string") return false;
  if (imagePresets.includes(size)) return true;
  const parameters: Parameters = { image_size: size };
  imageSize(parameters);
  const value = parameters.image_size;
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    dimensionsAllowed(value.width, value.height)
  );
}
