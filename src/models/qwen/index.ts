import { qwenImage30Combinations } from "./qwen-image-3.0";
import { qwenImage30ProCombinations } from "./qwen-image-3.0-pro";
import { qwenImage21ProCombinations } from "./qwen-image-2.1-pro";
import { qwenImage21TurboCombinations } from "./qwen-image-2.1-turbo";

export const qwenCombinations = [
  ...qwenImage30Combinations,
  ...qwenImage30ProCombinations,
  ...qwenImage21ProCombinations,
  ...qwenImage21TurboCombinations,
];
