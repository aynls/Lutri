import { gptImage26FlareCombinations } from "./gpt-image-2.6-flare";
import { gptImage26SunburstCombinations } from "./gpt-image-2.6-sunburst";
import { gptImage25FlareCombinations } from "./gpt-image-2.5-flare";
import { gptImage25SunburstCombinations } from "./gpt-image-2.5-sunburst";

export const gptCombinations = [
  ...gptImage26FlareCombinations,
  ...gptImage26SunburstCombinations,
  ...gptImage25FlareCombinations,
  ...gptImage25SunburstCombinations,
];
