import { fluxCombinations } from "./flux";
import { gptCombinations } from "./gpt";
import { qwenCombinations } from "./qwen";
import { seedreamCombinations } from "./seedream";
import { geminiCombinations } from "./gemini";
import { grokCombinations } from "./grok";
import { maiCombinations } from "./mai";
import { museCombinations } from "./muse";
import { recraftCombinations } from "./recraft";
import { ideogramCombinations } from "./ideogram";
import { withCreationControl } from "./creation";
export const combinations = [
  ...fluxCombinations,
  ...gptCombinations,
  ...qwenCombinations,
  ...seedreamCombinations,
  ...geminiCombinations,
  ...grokCombinations,
  ...maiCombinations,
  ...museCombinations,
  ...recraftCombinations,
  ...ideogramCombinations,
].map(withCreationControl);
export function combinationById(id: string) {
  const combination = combinations.find((entry) => entry.id === id);
  if (!combination) throw new Error(`Unknown model–provider combination: ${id}`);
  return combination;
}
