import { ParameterFields } from "../../../create/components/Fields";
import { adv, count, format, seed, text, toggle } from "../../fields";
import { dimensionErrors, request, validateFields, values } from "../../shared";
import { imageSize } from "../../requests";
import type { FieldDefinition, ModelCombination } from "../../types";

const fields: FieldDefinition[] = [
  text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
  seed(),
  toggle("enable_prompt_expansion", ["Expand prompt", "扩展提示词", "プロンプト拡張"]),
  count("num_images", 4),
  adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
  format(),
  adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
];

export const combination: ModelCombination = {
  id: "flux-3-image-klein:fal",
  family: "FLUX",
  model: "flux-3-image-klein",
  label: "FLUX 3 Image Klein",
  provider: "fal",
  protocol: "fal",
  creationControl: "prompt",
  maxReferences: 10,
  regions: "fal",
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
    imageSize(p);
    const box = (rectangle: number[]) => ({
      x_min: rectangle[1] / 1000,
      y_min: rectangle[0] / 1000,
      x_max: rectangle[3] / 1000,
      y_max: rectangle[2] / 1000,
    });
    if (context.draft.regions.length)
      p.bounding_boxes = context.draft.regions.map((region) => ({
        label: region.id,
        description: region.description,
        ...(region.referenceId
          ? {
              source_image_index: context.draft.references.findIndex(
                (reference) => reference.id === region.referenceId,
              ),
              ...(region.source ? { source_box: box(region.source) } : {}),
              ...(region.target ? { target_box: box(region.target) } : {}),
            }
          : region.target
            ? { box: box(region.target) }
            : {}),
      }));
    return request(
      "fal",
      `https://queue.fal.run/blackforestlabs/flux-3/klein/${images.length ? "edit-image" : "text-to-image"}`,
      {
        ...p,
        prompt: context.prompt,
        ...(images.length ? { image_urls: images } : {}),
      },
    );
  },
};
