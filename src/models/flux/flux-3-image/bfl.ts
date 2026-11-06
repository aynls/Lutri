import { safety, grounding, version, user, promptWithRegions, nativeResolutions } from "../shared";
import { ParameterFields } from "../../../create/components/Fields";
import { aspect, fluxRatios, height, resolution, width } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  aspect(fluxRatios),
  resolution([...nativeResolutions, "match_input"]),
  width(256, 6256),
  height(256, 6256),
  safety(7),
  grounding(),
  version(),
  user(),
];

export const combination: ModelCombination = {
  id: "flux-3-image:bfl",
  family: "FLUX",
  model: "flux-3-image",
  label: "FLUX 3 Image",
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
  docs: ["doc/model/FLUX/flux-3-image/"],
  outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
  initialRecovery: undefined,
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    errors.push(...dimensionErrors(draft.parameters, 0, draft.references.length ? 4194304 : 16822272));
    if (draft.parameters.resolution === "match_input" && !draft.references.length)
      errors.push("match_input: references ≥ 1");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const images = context.images;
    return request("bfl", "https://api.bfl.ai/v1/flux-3-image", {
      ...p,
      prompt: promptWithRegions(context),
      ...(images.length ? { images } : {}),
    });
  },
};
