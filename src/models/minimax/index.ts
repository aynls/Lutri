import { minimaxFal } from "./fal";
import { minimaxOpenRouter } from "./openrouter";
import { minimaxRunware } from "./runware";

export const minimaxCombinations = [false, true].flatMap((highspeed) => [
  minimaxRunware(highspeed),
  minimaxFal(highspeed),
  minimaxOpenRouter(highspeed),
]);
