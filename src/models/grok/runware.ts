import { ParameterFields } from "../../create/components/Fields";
import { adv, count, format, height, number, resolution, select, width } from "../fields";
import { runware, take } from "../requests";
import { dimensionErrors, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination } from "../types";

const quality = select("quality", ["Quality", "质量", "品質"], ["low", "medium"]);
const fields: FieldDefinition[] = [
  width(256, 4096),
  height(256, 4096),
  resolution(["1K", "2K"]),
  quality,
  count("numberResults", 20),
  format("outputFormat", ["JPG", "PNG", "WEBP"]),
  adv(number("outputQuality", ["Compression quality", "压缩质量", "圧縮品質"], 20, 99)),
];
export const combination: ModelCombination = {
  id: "grok-imagine-image-2.0:runware",
  model: "grok-imagine-image-2.0",
  family: "Grok",
  label: "Grok Imagine Image 2.0",
  provider: "runware",
  protocol: "runware",
  maxReferences: 5,
  fields,
  groups: [
    { id: "frame", fields: ["aspect_ratio", "resolution", "width", "height"] },
    { id: "generation", fields: ["quality", "n", "num_images", "numberResults"] },
    {
      id: "output",
      fields: ["output_format", "outputFormat", "outputQuality", "response_format", "sync_mode"],
      collapsed: true,
    },
  ],
  Form: ParameterFields,
  docs: ["doc/model/Grok/Grok-Imagine-Image-2.0-API.md"],
  outputCount: (p) => Number(p.n ?? p.num_images ?? p.numberResults ?? 1),
  initialRecovery: (id) => ({ remoteId: id }),
  validate: (draft) => {
    const errors = [...validateFields(fields, draft), ...dimensionErrors(draft.parameters)];
    if (draft.parameters.resolution && (!draft.references.length || draft.parameters.width || draft.parameters.height))
      errors.push("resolution: references, no width / height");
    return errors;
  },
  compile: (context) => {
    const p = values(fields, context.draft);
    return runware("xai:grok-imagine@image-2.0", p, context, take(p, { quality: "quality" }));
  },
};
