import { seedream5ProCombinations } from "./seedream-5-pro";
import { seedream5FlashCombinations } from "./seedream-5-flash";
import { seedream5LiteCombinations } from "./seedream-5-lite";
import { withLayerDelivery } from "./layers";
import { seedream55Combinations } from "./seedream-5.5";

export const seedreamCombinations = [
  ...seedream5ProCombinations,
  ...seedream5FlashCombinations,
  ...seedream5LiteCombinations,
  ...seedream55Combinations,
].map(withLayerDelivery);
