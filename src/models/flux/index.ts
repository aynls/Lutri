import { ParameterFields } from "../../create/components/Fields";
import type { Json } from "../../domain/types";
import {
  adv,
  aspect,
  count,
  fluxRatios,
  format,
  height,
  number,
  resolution,
  seed,
  text,
  toggle,
  width,
} from "../fields";
import { dimensionErrors, request, validateFields, values } from "../shared";
import { imageSize } from "../requests";
import type { CompileContext, FieldDefinition, ModelCombination, ProviderId } from "../types";

const safety = (max: number) => number("safety_tolerance", ["Safety tolerance", "审核容忍度", "安全許容度"], 0, max);
const grounding = () => toggle("grounding", ["Web search", "联网搜索", "ウェブ検索"]);
const version = () => adv(text("version", ["Version", "版本", "バージョン"]));
const user = () => adv(text("user", ["User identifier", "用户标识", "ユーザー識別子"], 256));

function promptWithRegions(context: CompileContext): string {
  if (!context.draft.regions.length) return context.prompt;
  const regions = context.draft.regions.map((region) =>
    context.images.length
      ? {
          id: region.id,
          desc: region.description,
          from: region.referenceId
            ? `ref_image_${context.draft.references.findIndex((reference) => reference.id === region.referenceId)}`
            : null,
          src_bbox: region.source ?? null,
          tgt_bbox: region.target ?? null,
        }
      : { id: region.id, desc: region.description, bbox: region.target },
  );
  return `${context.prompt}\n${JSON.stringify(regions)}`;
}

function make(provider: ProviderId, klein: boolean): ModelCombination {
  const model = klein ? "flux-3-image-klein" : "flux-3-image";
  const nativeResolutions = ["768sq", "1k", "1.5k", "2k", "4k"];
  let fields: FieldDefinition[];
  if (provider === "bfl")
    fields = [
      aspect(fluxRatios),
      resolution(klein ? nativeResolutions : [...nativeResolutions, "match_input"]),
      width(klein ? 64 : 256, 6256),
      height(klein ? 64 : 256, 6256),
      safety(7),
      ...(klein
        ? [
            seed(4294967295),
            format("output_format", ["jpeg", "png"]),
            number("steps", ["Steps", "步数", "ステップ"], 1, 16),
          ]
        : [grounding(), version()]),
      user(),
    ];
  else if (provider === "openrouter")
    fields = [
      aspect(fluxRatios),
      resolution(["768", "1K", "1.5K", "2K", "4K"]),
      safety(7),
      ...(klein
        ? [
            seed(4294967295),
            format("output_format", ["jpeg", "png"]),
            number("steps", ["Steps", "步数", "ステップ"], 1, 16),
          ]
        : [grounding(), version()]),
    ];
  else if (provider === "comfy")
    fields = [aspect(fluxRatios), resolution(nativeResolutions), grounding(), safety(4), version()];
  else if (provider === "fal")
    fields = klein
      ? [
          text("image_size", ["Image size", "图片尺寸", "画像サイズ"]),
          seed(),
          toggle("enable_prompt_expansion", ["Expand prompt", "扩展提示词", "プロンプト拡張"]),
          count("num_images", 4),
          adv(toggle("enable_safety_checker", ["Safety checker", "安全检查", "安全チェック"])),
          format(),
          adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
        ]
      : [
          aspect(fluxRatios.filter((v) => v !== "9:21")),
          resolution(nativeResolutions),
          toggle("enable_prompt_expansion", ["Expand prompt", "扩展提示词", "プロンプト拡張"]),
          safety(4),
          format("output_format", ["jpeg", "png"]),
          adv(toggle("sync_mode", ["Inline result", "内嵌结果", "インライン結果"])),
          version(),
        ];
  else
    fields = [
      width(klein ? 128 : 256, klein ? 4096 : 6256, klein ? 16 : 1),
      height(klein ? 128 : 256, klein ? 4096 : 6256, klein ? 16 : 1),
      resolution(["0.75K", "1K", "2K", "4K"]),
      count("numberResults", 20),
      format("outputFormat", ["JPG", "PNG", "WEBP"]),
      adv(number("outputQuality", ["Compression quality", "压缩质量", "圧縮品質"], 20, 99)),
      ...(klein ? [seed(), number("steps", ["Steps", "步数", "ステップ"], 1, 50)] : [grounding(), safety(4)]),
    ];
  return {
    id: `${model}:${provider}`,
    family: "FLUX",
    model,
    label: klein ? "FLUX 3 Image Klein" : "FLUX 3 Image",
    provider,
    protocol: provider === "bfl" || provider === "fal" || provider === "runware" ? provider : "images",
    maxReferences: klein && provider === "runware" ? 4 : 10,
    regions: provider === "runware" ? "runware" : klein && provider === "fal" ? "fal" : "prompt",
    fields,
    Form: ParameterFields,
    docs: [`doc/model/FLUX/${model}/`],
    outputCount: (p) => Number(p.num_images ?? p.numberResults ?? 1),
    initialRecovery: provider === "runware" ? (taskId) => ({ remoteId: taskId }) : undefined,
    validate: (draft) => {
      const errors = validateFields(fields, draft);
      errors.push(
        ...dimensionErrors(
          draft.parameters,
          0,
          provider === "bfl" && !klein && draft.references.length ? 4194304 : 16822272,
        ),
      );
      if (draft.parameters.resolution === "match_input" && !draft.references.length)
        errors.push("match_input: references ≥ 1");
      if (provider === "runware" && !draft.references.length && !draft.regions.length) errors.push("boundingBoxes ≥ 1");
      if (provider === "runware" && draft.parameters.resolution && (draft.parameters.width || draft.parameters.height))
        errors.push("resolution / width + height");
      return errors;
    },
    compile: (context) => {
      const p = values(fields, context.draft);
      const images = context.images;
      if (provider === "bfl" || provider === "comfy")
        return request(
          provider,
          provider === "bfl" ? `https://api.bfl.ai/v1/${model}` : `https://api.comfy.org/v2/models/bfl/${model}`,
          { ...p, prompt: promptWithRegions(context), ...(images.length ? { images } : {}) },
        );
      if (provider === "openrouter") {
        const passthrough: Record<string, Json> = {};
        for (const key of klein ? ["safety_tolerance", "steps"] : ["safety_tolerance", "grounding", "version"]) {
          if (p[key] !== undefined) {
            passthrough[key] = p[key];
            delete p[key];
          }
        }
        return request(provider, "https://openrouter.ai/api/v1/images", {
          ...p,
          model: `black-forest-labs/${model}`,
          prompt: promptWithRegions(context),
          ...(images.length
            ? { input_references: images.map((url) => ({ type: "image_url", image_url: { url } })) }
            : {}),
          ...(Object.keys(passthrough).length ? { provider: { options: { "black-forest-labs": passthrough } } } : {}),
        });
      }
      if (provider === "fal") {
        if (klein) {
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
        }
        return request(
          provider,
          `https://queue.fal.run/blackforestlabs/flux-3/${klein ? "klein/" : ""}${images.length ? "edit-image" : "text-to-image"}`,
          {
            ...p,
            prompt: klein ? context.prompt : promptWithRegions(context),
            ...(images.length ? { image_urls: images } : {}),
          },
        );
      }
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
      return request(provider, "https://api.runware.ai/v1", [
        {
          ...p,
          taskType: "imageInference",
          taskUUID: context.taskId,
          model: klein ? "bfl:flux@3-image-klein" : "bfl:flux@3-image",
          positivePrompt: context.prompt,
          settings,
          ...(images.length ? { inputs: { referenceImages: images } } : {}),
          outputType: "URL",
          deliveryMethod: "async",
        },
      ]);
    },
  };
}

export const fluxCombinations = [
  make("bfl", false),
  make("fal", false),
  make("openrouter", false),
  make("comfy", false),
  make("runware", false),
  make("bfl", true),
  make("fal", true),
  make("openrouter", true),
  make("runware", true),
];
