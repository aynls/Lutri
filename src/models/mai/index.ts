import { maiImage25Azure, maiImage25OpenRouter, maiImage25Fal } from "./mai-image-2.5";
import { maiImage26Azure, maiImage26OpenRouter } from "./mai-image-2.6";
import { maiImage27Combinations } from "./mai-image-2.7";

export const maiCombinations = [
  maiImage25Azure,
  maiImage26Azure,
  maiImage25OpenRouter,
  maiImage26OpenRouter,
  maiImage25Fal,
  ...maiImage27Combinations,
];
