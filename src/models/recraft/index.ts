import { recraftV41Combinations } from "./recraft-v4.1";
import { recraftV41ProCombinations } from "./recraft-v4.1-pro";
import { recraftV41UtilityCombinations } from "./recraft-v4.1-utility";
import { recraftV41UtilityProCombinations } from "./recraft-v4.1-utility-pro";
import { recraftV4StylesCombinations } from "./recraft-v4-styles";
import { recraftV4StylesProCombinations } from "./recraft-v4-styles-pro";

export const recraftCombinations = [
  ...recraftV41Combinations,
  ...recraftV41ProCombinations,
  ...recraftV41UtilityCombinations,
  ...recraftV41UtilityProCombinations,
  ...recraftV4StylesCombinations,
  ...recraftV4StylesProCombinations,
];
