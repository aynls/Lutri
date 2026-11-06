import { gptImage25SunburstOpenRouter } from "./openrouter";
import { gptImage25SunburstFal } from "./fal";
import { gptImage25SunburstRunware } from "./runware";
import { gptImage25SunburstComfy } from "./comfy";
import { openAICombination } from "../openai";

export const gptImage25SunburstCombinations = [
  openAICombination("gpt-image-2.5-sunburst", "GPT Image 2.5 Sunburst", false),
  gptImage25SunburstOpenRouter,
  gptImage25SunburstFal,
  gptImage25SunburstRunware,
  gptImage25SunburstComfy,
];
