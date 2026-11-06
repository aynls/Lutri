const dimensions = [
  [1024, 1024],
  [1536, 768],
  [768, 1536],
  [1280, 832],
  [832, 1280],
  [1216, 896],
  [896, 1216],
  [1152, 896],
  [896, 1152],
  [832, 1344],
  [1280, 896],
  [896, 1280],
  [1344, 768],
  [768, 1344],
];

export const sizes = dimensions.map((pair) => pair.join("x"));
export const proSizes = dimensions.map((pair) => pair.map((value) => value * 2).join("x"));
