import { recraftV41Combinations } from "./recraft-v4.1";
import { recraftV41ProCombinations } from "./recraft-v4.1-pro";
import { recraftV41UtilityCombinations } from "./recraft-v4.1-utility";
import { recraftV41UtilityProCombinations } from "./recraft-v4.1-utility-pro";
import { recraftV4StylesCombinations } from "./recraft-v4-styles";
import { recraftV4StylesProCombinations } from "./recraft-v4-styles-pro";
import { recraftV4VectorCombinations } from "./recraft-v4-vector";
import { recraftV4ProVectorCombinations } from "./recraft-v4-pro-vector";
import { recraftV41VectorCombinations } from "./recraft-v4.1-vector";
import { recraftV41ProVectorCombinations } from "./recraft-v4.1-pro-vector";
import { recraftV4StylesVectorCombinations } from "./recraft-v4-styles-vector";
import { recraftV4StylesProVectorCombinations } from "./recraft-v4-styles-pro-vector";
import { recraftOpenRouter } from "./openrouter";

export const recraftCombinations = [
  recraftV41Combinations,
  recraftV41ProCombinations,
  recraftV41UtilityCombinations,
  recraftV41UtilityProCombinations,
  recraftV4StylesCombinations,
  recraftV4StylesProCombinations,
  recraftV4VectorCombinations,
  recraftV4ProVectorCombinations,
  recraftV41VectorCombinations,
  recraftV41ProVectorCombinations,
  recraftV4StylesVectorCombinations,
  recraftV4StylesProVectorCombinations,
].flatMap((combinations) => [
  ...combinations,
  ...combinations.filter(({ provider }) => provider === "recraft").map(recraftOpenRouter),
]);
