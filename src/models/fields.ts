import { label } from "../i18n";
import type { FieldDefinition } from "./types";

export const select = (key: string, names: [string, string, string], options: readonly string[]): FieldDefinition => ({
  key,
  label: label(...names),
  kind: "select",
  options,
});
export const number = (
  key: string,
  names: [string, string, string],
  min: number,
  max: number,
  step = 1,
): FieldDefinition => ({ key, label: label(...names), kind: "number", min, max, step });
export const toggle = (key: string, names: [string, string, string]): FieldDefinition => ({
  key,
  label: label(...names),
  kind: "toggle",
});
export const text = (key: string, names: [string, string, string], maxLength?: number): FieldDefinition => ({
  key,
  label: label(...names),
  kind: "text",
  maxLength,
});
export const adv = (field: FieldDefinition): FieldDefinition => ({ ...field, advanced: true });
export const json = (key: string, names: [string, string, string]): FieldDefinition => ({
  key,
  label: label(...names),
  kind: "json",
});
export const aspect = (values: readonly string[]) =>
  select("aspect_ratio", ["Aspect ratio", "宽高比", "アスペクト比"], values);
export const resolution = (values: readonly string[]) =>
  select("resolution", ["Resolution", "分辨率", "解像度"], values);
export const count = (key: string, max: number) =>
  number(key, ["Images per request", "单次生成数量", "リクエストごとの画像数"], 1, max);
export const seed = (max = 2147483647, key = "seed"): FieldDefinition => ({
  key,
  label: label("Seed", "种子", "シード"),
  kind: "seed",
  min: 0,
  max,
});
export const format = (key = "output_format", values = ["jpeg", "png", "webp"]): FieldDefinition => ({
  ...select(key, ["Format", "格式", "形式"], values),
  advanced: true,
});
export const width = (min: number, max: number, step = 1) => number("width", ["Width", "宽度", "幅"], min, max, step);
export const height = (min: number, max: number, step = 1) =>
  number("height", ["Height", "高度", "高さ"], min, max, step);
export const commonRatios = ["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
export const fluxRatios = [
  "auto",
  "21:9",
  "2:1",
  "16:9",
  "3:2",
  "7:5",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "5:7",
  "2:3",
  "9:16",
  "1:2",
  "9:21",
];
