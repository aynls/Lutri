import { safety, version, promptWithRegions, nativeResolutions } from "../shared";
import { ParameterFields } from "../../../create/components/Fields";
import { adv, aspect, fluxRatios, format, resolution, toggle } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  aspect(fluxRatios.filter((v) => v !== "9:21")),
  resolution(nativeResolutions),
  toggle("enable_prompt_expansion", ["Expand prompt", "扩展提示词", "プロンプト拡張"]),
  safety(4),
  format("output_format", ["jpeg", "png"]),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
  version(),
];

export const combination: ModelCombination = {
  id: "flux-3-image:fal",
  family: "FLUX",
  model: "flux-3-image",
  label: "FLUX 3 Image",
  provider: "fal",
  protocol: "fal",
  creationControl: "prompt",
  maxReferences: 10,
  regions: "prompt",
  fields,
  inputPolicy: { minEdge: 256, maxPixels: 4000000 },
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
    errors.push(...dimensionErrors(draft.parameters, 0, 16822272));
    if (draft.parameters.resolution === "match_input" && !draft.references.length)
      errors.push("match_input: references ≥ 1");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const images = context.images;
    return request(
      "fal",
      `https://queue.fal.run/blackforestlabs/flux-3/${images.length ? "edit-image" : "text-to-image"}`,
      {
        ...p,
        prompt: promptWithRegions(context),
        ...(images.length ? { image_urls: images } : {}),
      },
    );
  },
};
