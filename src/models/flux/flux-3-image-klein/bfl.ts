import { safety, user, promptWithRegions, nativeResolutions } from "../shared";
import { ParameterFields } from "../../../create/components/Fields";
import { aspect, fluxRatios, format, height, number, resolution, seed, width } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  aspect(fluxRatios),
  resolution(nativeResolutions),
  width(64, 6256),
  height(64, 6256),
  safety(7),
  seed(4294967295),
  format("output_format", ["jpeg", "png"]),
  number("steps", ["Steps", "步数", "ステップ"], 1, 16),
  user(),
];

export const combination: ModelCombination = {
  id: "flux-3-image-klein:bfl",
  family: "FLUX",
  model: "flux-3-image-klein",
  label: "FLUX 3 Image Klein",
  provider: "bfl",
  protocol: "bfl",
  maxReferences: 10,
  regions: "prompt",
  fields,
  inputPolicy: undefined,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height", "image_size"] },
    {
      id: "generation",
      fields: ["seed", "steps", "grounding", "enable_prompt_expansion", "num_images", "numberResults"],
    },
    { id: "output", fields: ["output_format", "outputFormat", "outputQuality", "sync_mode"], collapsed: true },
    { id: "advanced", fields: ["safety_tolerance", "enable_safety_checker", "version", "user"], collapsed: true },
  ],
  Form: ParameterFields,
  docs: ["doc/model/FLUX/flux-3-image-klein/"],
  outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    errors.push(...dimensionErrors(draft.parameters, 0, 16822272));
    if (draft.parameters.resolution === "match_input" && !draft.references.length)
      errors.push("match_input: references ≥ 1");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const images = context.images;
    return request("bfl", "https://api.bfl.ai/v1/flux-3-image-klein", {
      ...p,
      prompt: promptWithRegions(context),
      ...(images.length ? { images } : {}),
    });
  },
};
