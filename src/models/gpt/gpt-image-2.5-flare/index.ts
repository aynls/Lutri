import { gptImage25FlareOpenRouter } from "./openrouter";
import { gptImage25FlareFal } from "./fal";
import { gptImage25FlareRunware } from "./runware";
import { gptImage25FlareComfy } from "./comfy";
import { openAICombination } from "../openai";

export const gptImage25FlareCombinations = [
  openAICombination("gpt-image-2.5-flare", "GPT Image 2.5 Flare", false),
  gptImage25FlareOpenRouter,
  gptImage25FlareFal,
  gptImage25FlareRunware,
  gptImage25FlareComfy,
];
