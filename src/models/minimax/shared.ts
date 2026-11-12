import { ParameterFields } from "../../create/components/Fields";
import { dimensionErrors, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

export const minimaxModelId = (highspeed: boolean) => `minimax-h3-image${highspeed ? "-highspeed" : ""}`;

export function minimax(
  highspeed: boolean,
  adapter: Pick<ModelCombination, "provider" | "protocol" | "compile" | "outputCount"> &
    Partial<ModelCombination> & { fields: FieldDefinition[] },
): ModelCombination {
  const model = minimaxModelId(highspeed);
  return {
    id: `${model}:${adapter.provider}`,
    model,
    family: "MiniMax",
    label: `MiniMax H3-Image${highspeed ? " HighSpeed" : ""}`,
    maxReferences: 16,
    promptLimit: { min: 1, max: 32000 },
    Form: ParameterFields,
    docs: ["doc/model/MiniMax/H3-Image.md"],
    groups: [
      { id: "frame", fields: ["width", "height", "size", "resolution", "aspect_ratio", "area"] },
      { id: "generation", fields: ["numberResults", "num_images", "n"] },
      { id: "output", fields: ["outputFormat", "output_format", "output_compression"], collapsed: true },
      { id: "advanced", fields: ["promptOptimizer", "enable_prompt_expansion"], collapsed: true },
    ],
    validate: (draft) => {
      const p = values(adapter.fields, draft);
      const errors = [...validateFields(adapter.fields, draft), ...dimensionErrors(p, 655360, 20000000, 3)];
      if (draft.prompt.length < 1 || draft.prompt.length > 32000) errors.push("prompt: 1–32000");
      if (typeof p.size === "string") {
        if (!/^\d+x\d+$/.test(p.size)) errors.push("size: width x height");
        else if (p.size.split("x").some((side) => Number(side) < 468 || Number(side) > 7745))
          errors.push("size: 468–7745");
      }
      if (p.resolution && (p.width !== undefined || p.height !== undefined)) errors.push("resolution / width + height");
      if (p.promptOptimizer === false && (!p.width || !p.height)) errors.push("promptOptimizer: width + height");
      return errors;
    },
    ...adapter,
  };
}
