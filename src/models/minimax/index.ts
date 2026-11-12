import { minimaxComfy } from "./comfy";
import { minimaxFal } from "./fal";
import { minimaxOfficial } from "./official";
import { minimaxOpenRouter } from "./openrouter";
import { minimaxRunware } from "./runware";

export const minimaxCombinations = [false, true].flatMap((highspeed) => [
  minimaxRunware(highspeed),
  minimaxFal(highspeed),
  minimaxOpenRouter(highspeed),
  minimaxComfy(highspeed),
  minimaxOfficial(highspeed),
]);
