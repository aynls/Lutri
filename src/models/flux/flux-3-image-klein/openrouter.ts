import { safety, promptWithRegions } from "../shared";
import { ParameterFields } from "../../../create/components/Fields";
import type { Json } from "../../../domain/types";
import { aspect, fluxRatios, format, number, resolution, seed } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  aspect(fluxRatios),
  resolution(["768", "1K", "1.5K", "2K", "4K"]),
  safety(4),
  seed(4294967295),
  format("output_format", ["jpeg", "png"]),
  number("steps", ["Steps", "步数", "ステップ"], 1, 16),
];

export const combination: ModelCombination = {
  id: "flux-3-image-klein:openrouter",
  family: "FLUX",
  model: "flux-3-image-klein",
  label: "FLUX 3 Image Klein",
  provider: "openrouter",
  protocol: "images",
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
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const images = context.images;
    const passthrough: Record<string, Json> = {};
    for (const key of ["safety_tolerance", "steps"]) {
      if (p[key] !== undefined) {
        passthrough[key] = p[key];
        delete p[key];
      }
    }
    return request("openrouter", "https://openrouter.ai/api/v1/images", {
      ...p,
      model: "black-forest-labs/flux-3-image-klein",
      prompt: promptWithRegions(context),
      ...(images.length ? { input_references: images.map((url) => ({ type: "image_url", image_url: { url } })) } : {}),
      ...(Object.keys(passthrough).length ? { provider: { options: { "black-forest-labs": passthrough } } } : {}),
    });
  },
};
