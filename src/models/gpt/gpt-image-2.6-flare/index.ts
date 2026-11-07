import { gptImage26FlareOpenRouter } from "./openrouter";
import { gptImage26FlareFal } from "./fal";
import { gptImage26FlareRunware } from "./runware";
import { gptImage26FlareComfy } from "./comfy";
import { openAICombination } from "../openai";

export const gptImage26FlareCombinations = [
  openAICombination("gpt-image-2.6-flare", "GPT Image 2.6 Flare", true),
  gptImage26FlareOpenRouter,
  gptImage26FlareFal,
  gptImage26FlareRunware,
  gptImage26FlareComfy,
];
