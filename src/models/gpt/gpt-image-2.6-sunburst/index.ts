import { gptImage26SunburstOpenRouter } from "./openrouter";
import { gptImage26SunburstRunware } from "./runware";
import { openAICombination } from "../openai";

export const gptImage26SunburstCombinations = [
  openAICombination("gpt-image-2.6-sunburst", "GPT Image 2.6 Sunburst", true),
  gptImage26SunburstOpenRouter,
  gptImage26SunburstRunware,
];
