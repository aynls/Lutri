import { safety, grounding } from "../shared";
import { ParameterFields } from "../../../create/components/Fields";
import type { Json } from "../../../domain/types";
import { adv, count, format, height, number, resolution, width } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  width(256, 6256, 1),
  height(256, 6256, 1),
  resolution(["0.75K", "1K", "2K", "4K"]),
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
  adv(number("outputQuality", ["Compression quality", "压缩质量", "圧縮品質"], 20, 99)),
  grounding(),
  safety(4),
];

export const combination: ModelCombination = {
  id: "flux-3-image:runware",
  family: "FLUX",
  model: "flux-3-image",
  label: "FLUX 3 Image",
  provider: "runware",
  protocol: "runware",
  maxReferences: 10,
  regions: "runware",
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
  initialRecovery: (taskId) => ({ remoteId: taskId }),
  validate: (draft) => {
    const errors = validateFields(fields, draft);
    errors.push(...dimensionErrors(draft.parameters, 0, 16822272));
    if (draft.parameters.resolution && !draft.references.length) errors.push("resolution: references ≥ 1");
    if (!draft.references.length && !draft.regions.length) errors.push("boundingBoxes ≥ 1");
    for (const region of draft.regions)
      if (!region.description.trim()) errors.push(`boundingBoxes.description: ${region.id}`);
    if (draft.parameters.resolution && (draft.parameters.width || draft.parameters.height))
      errors.push("resolution / width + height");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    const images = context.images;
    const boxes = context.draft.regions.map((region) => ({
      id: region.id,
      description: region.description,
      ...(region.referenceId
        ? { referenceIndex: context.draft.references.findIndex((r) => r.id === region.referenceId) }
        : {}),
      ...(region.source ? { sourceBox: region.source } : {}),
      targetBox: region.target ?? null,
    }));
    const settings: Record<string, Json> = boxes.length ? { boundingBoxes: boxes } : {};
    if (p.safety_tolerance !== undefined) {
      settings.safetyTolerance = p.safety_tolerance;
      delete p.safety_tolerance;
    }
    if (p.grounding !== undefined) {
      settings.grounding = p.grounding;
      delete p.grounding;
    }
    return request("runware", "https://api.runware.ai/v1", [
      {
        ...p,
        taskType: "imageInference",
        taskUUID: context.taskId,
        includeCost: true,
        model: "bfl:flux@3-image",
        positivePrompt: context.prompt,
        settings,
        ...(images.length ? { inputs: { referenceImages: images } } : {}),
        outputType: "URL",
        deliveryMethod: "async",
      },
    ]);
  },
};
