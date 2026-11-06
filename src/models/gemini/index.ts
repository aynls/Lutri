import { combinations as gemini31FlashLiteImageCombinations } from "./gemini-3.1-flash-lite-image";
import { combinations as geminiNanoBanana21Combinations } from "./gemini-nano-banana-2.1";
import { combinations as gemini31FlashImageCombinations } from "./gemini-3.1-flash-image";
import { combinations as gemini3ProImageCombinations } from "./gemini-3-pro-image";

export const geminiCombinations = [
  ...gemini31FlashLiteImageCombinations,
  ...geminiNanoBanana21Combinations,
  ...gemini31FlashImageCombinations,
  ...gemini3ProImageCombinations,
];
