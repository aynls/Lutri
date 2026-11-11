import type { GenerationDraft } from "../../domain/types";
import { select } from "../fields";
import { validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

export function withLayerDelivery(combination: ModelCombination): ModelCombination {
  if (combination.layerDecomposition || !combination.fields.some((field) => field.key === "layer_decomposition"))
    return combination;
  const runware = combination.provider === "runware";
  const flash = combination.model === "seedream-5-flash";
  const normalOnly = new Set([
    "width",
    "height",
    "resolution",
    "size",
    "background",
    "numberResults",
    "enhance_prompt_mode",
  ]);
  const fields: FieldDefinition[] = combination.fields.map((field) => {
    if (runware && ["width", "height"].includes(field.key)) field = { ...field, min: 256, max: 16383, default: 2048 };
    if (runware && field.key === "resolution") field = { ...field, options: ["1K", "2K"], visible: () => !flash };
    if (["outputFormat", "output_format"].includes(field.key))
      return {
        ...field,
        visible: (draft) => !!draft.parameters.layer_decomposition || draft.parameters.background !== "transparent",
      };
    return normalOnly.has(field.key)
      ? {
          ...field,
          visible: (draft) => !draft.parameters.layer_decomposition && (!field.visible || field.visible(draft)),
        }
      : field;
  });
  fields.push({
    ...select(
      "layer_resolution",
      ["Layer resolution", "图层分辨率", "レイヤー解像度"],
      runware ? (flash ? ["1K", "1.5K", "2K"] : ["1K", "2K"]) : ["auto", "1K", "1.5K", "2K"],
    ),
    visible: (draft) => draft.parameters.layer_decomposition === true,
  });
  const activeDraft = (draft: GenerationDraft): GenerationDraft => {
    const parameters = values(fields, draft);
    if (parameters.layer_decomposition) {
      if (runware) {
        if (parameters.layer_resolution) parameters.resolution = parameters.layer_resolution;
      } else parameters.size = parameters.layer_resolution ?? "auto";
    } else if (parameters.background === "transparent") {
      parameters[combination.provider === "runware" ? "outputFormat" : "output_format"] =
        combination.provider === "runware" ? "PNG" : "png";
    }
    delete parameters.layer_resolution;
    return { ...draft, parameters };
  };
  return {
    ...combination,
    layerDecomposition: { maxLayers: 16 },
    fields,
    groups: combination.groups?.map((group) =>
      group.id === "generation" ? { ...group, fields: [...group.fields, "layer_resolution"] } : group,
    ),
    outputCount: (p) => (p.layer_decomposition ? 1 : combination.outputCount(p)),
    validate: (draft) => {
      const active = activeDraft(draft);
      const errors = [...validateFields(fields, draft), ...combination.validate(active)];
      const p = active.parameters;
      if (runware && p.resolution && (p.width !== undefined || p.height !== undefined))
        errors.push("resolution / width + height");
      if (runware && !draft.references.length && !p.resolution && (!p.width || !p.height))
        errors.push("width + height");
      if (p.background === "transparent" && draft.references.length !== 1) errors.push("background: references = 1");
      return errors;
    },
    compile: (context) => combination.compile({ ...context, draft: activeDraft(context.draft) }),
  };
}
