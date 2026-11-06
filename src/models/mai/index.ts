import { ParameterFields } from "../../create/components/Fields";
import { adv, aspect, commonRatios, count, format, height, toggle, width } from "../fields";
import { fal, openRouter } from "../requests";
import { dimensionErrors, request, validateFields, values } from "../shared";
import type { FieldDefinition, ModelCombination, ProviderId } from "../types";
function make(version: "2.5" | "2.6", provider: ProviderId): ModelCombination {
  const grounding = toggle("web_grounding", ["Web search", "联网搜索", "ウェブ検索"]);
  const fields: FieldDefinition[] =
    provider === "azure"
      ? [
          { ...width(768, 3072), visible: (d) => !d.references.length && !d.parameters.auto_aspect_ratio },
          { ...height(768, 3072), visible: (d) => !d.references.length && !d.parameters.auto_aspect_ratio },
          ...(version === "2.6"
            ? [toggle("auto_aspect_ratio", ["Automatic aspect ratio", "自动宽高比", "自動アスペクト比"]), grounding]
            : []),
        ]
      : [
          aspect(commonRatios),
          ...(provider === "fal"
            ? [
                count("num_images", 4),
                format(),
                adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
              ]
            : version === "2.6"
              ? [grounding]
              : []),
        ];
  return {
    id: `mai-image-${version}:${provider}`,
    model: `mai-image-${version}`,
    family: "MAI",
    label: `MAI Image ${version}`,
    provider,
    protocol: provider === "fal" ? "fal" : "images",
    maxReferences: provider === "azure" ? 5 : version === "2.5" ? 1 : 5,
    fields,
    inputPolicy: provider === "azure" ? { mediaTypes: ["image/jpeg", "image/png"] } : undefined,
    groups: [
      { id: "frame", fields: ["aspect_ratio", "auto_aspect_ratio", "width", "height"] },
      { id: "generation", fields: ["web_grounding", "num_images"] },
      { id: "output", fields: ["output_format", "sync_mode"], collapsed: true },
    ],
    Form: ParameterFields,
    docs: ["doc/model/MAI/MAI-Image.md"],
    outputCount: (p) => Number(p.num_images ?? 1),
    validate: (draft) => [
      ...validateFields(fields, draft),
      ...dimensionErrors(values(fields, draft), 0, version === "2.5" ? 1048576 : 2359296),
    ],
    compile: (context) => {
      const p = values(fields, context.draft);
      if (provider === "openrouter") {
        if (p.web_grounding !== undefined) {
          p.provider = { options: { azure: { web_grounding: p.web_grounding } } };
          delete p.web_grounding;
        }
        return openRouter(`microsoft/mai-image-${version}`, p, context);
      }
      if (provider === "fal") return fal(`microsoft/mai-image-2.5${context.images.length ? "/edit" : ""}`, p, context);
      if (!context.configuration.endpoint || !context.configuration.deployment)
        throw new Error("Microsoft Foundry: endpoint + deployment");
      const compiled = request(
        "azure",
        `${context.configuration.endpoint.replace(/\/$/, "")}/mai/v1/images/${context.images.length ? "edits" : "generations"}`,
        { ...p, model: context.configuration.deployment, prompt: context.prompt },
      );
      if (context.images.length) {
        delete compiled.body;
        compiled.multipart = [
          { name: "model", text: context.configuration.deployment },
          { name: "prompt", text: context.prompt },
          ...context.images.map((dataUrl) => ({ name: "image", dataUrl })),
        ];
      }
      return compiled;
    },
  };
}
export const maiCombinations = [
  make("2.5", "azure"),
  make("2.6", "azure"),
  make("2.5", "openrouter"),
  make("2.6", "openrouter"),
  make("2.5", "fal"),
];
