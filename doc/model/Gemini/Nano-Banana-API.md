# Nano Banana 图像 API

本文介绍 Nano Banana 2 Lite、2.1、2 和 Pro 的图像生成与编辑接口。

## Google Gemini API

2 Lite、2.1、2 和 Pro 的模型 ID 分别为 `gemini-3.1-flash-lite-image`、`gemini-nano-banana-2.1`、`gemini-3.1-flash-image`、`gemini-3-pro-image`。以下使用 Interactions API；`generateContent` 使用不同的请求体。

```http
POST https://generativelanguage.googleapis.com/v1beta/interactions
x-goog-api-key: GEMINI_API_KEY
Api-Revision: 2026-05-20
Content-Type: application/json
```

```json
{
  "model": "gemini-nano-banana-2.1",
  "input": [{"type":"text","text":"A red panda reading in a garden"}],
  "response_format": {"type":"image","aspect_ratio":"16:9","image_size":"2K"}
}
```

`input` 可包含按顺序排列的文本和图片，例如 `{"type":"image","mime_type":"image/png","data":"BASE64_DATA"}`；图片编辑与文字生成使用相同接口。`response_format` 可指定图片的 `aspect_ratio`、`image_size` 和 `mime_type`。`previous_interaction_id` 可继续一轮交互；联网工具使用 `tools: [{"type":"google_search"}]`，图片搜索的支持范围依模型而异。

2 Lite 只提供 1K，不针对多参考图和连续编辑优化；2.1 和 Pro 支持 1K、2K、4K，2 另外支持 0.5K。生成的图片带有 SynthID 水印。响应可以交错包含文字与图片，SDK 的 `output_image` 只取最后一张；处理完整交错输出需遍历响应步骤。

2.1、2 和 Pro 可混合最多 14 张参考图；其中 2.1 和 2 的高保真建议为最多 10 个物体和 4 个人物，Pro 分别为 6 个物体、5 个人物、3 张风格参考图。Gemini 3 图片模型默认 1K，分辨率档位的 `K` 必须大写。2.1 可通过 `generation_config.thinking_level` 控制思考强度。

来源：[图像生成](https://ai.google.dev/gemini-api/docs/image-generation)、[2 Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image)、[2.1](https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1)、[2](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image)、[Pro](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image)。

## OpenRouter Image API

```http
POST https://openrouter.ai/api/v1/images
Authorization: Bearer OPENROUTER_API_KEY
Content-Type: application/json
```

| 版本 | `model` | `resolution` | 最大参考图 |
| --- | --- | --- | --- |
| 2 Lite | `google/gemini-3.1-flash-lite-image` | `1K` | 14 |
| 2.1 | `google/gemini-nano-banana-2.1` | `1K`, `2K`, `4K` | 14 |
| 2 | `google/gemini-3.1-flash-image` | `512`, `1K`, `2K`, `4K` | 14 |
| Pro | `google/gemini-3-pro-image` | `1K`, `2K`, `4K` | 14 |

请求包含 `model`、`prompt`，可选 `resolution`、`aspect_ratio`、`n` 和 `input_references`；当前列出的端点 `n` 仅为 1。参考图每项为 `{"type":"image_url","image_url":{"url":"https://example.com/image.png"}}`，也可以使用 data URL。成功响应从 `data[].b64_json` 取图片，格式由 `media_type` 指定。

四款均支持 `1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`21:9`；2 Lite、2.1、2 还支持 `1:4`、`4:1`、`1:8`、`8:1`。端点未列出 `auto` 和默认值。

```json
{"model":"google/gemini-nano-banana-2.1","prompt":"Turn the reference into a watercolor","resolution":"2K","aspect_ratio":"1:1","input_references":[{"type":"image_url","image_url":{"url":"https://example.com/image.png"}}]}
```

来源：[Image API](https://openrouter.ai/blog/announcements/image-api/)、端点：[2 Lite](https://openrouter.ai/api/v1/images/models/google/gemini-3.1-flash-lite-image/endpoints)、[2.1](https://openrouter.ai/api/v1/images/models/google/gemini-nano-banana-2.1/endpoints)、[2](https://openrouter.ai/api/v1/images/models/google/gemini-3.1-flash-image/endpoints)、[Pro](https://openrouter.ai/api/v1/images/models/google/gemini-3-pro-image/endpoints)。

## Comfy Router

2.1、2 和 Pro 的模型路径分别为 `vertexai/gemini-nano-banana-2.1`、`vertexai/gemini-3.1-flash-image`、`vertexai/gemini-3-pro-image`。Comfy Router 是云端服务。

```http
POST https://api.comfy.org/v2/models/vertexai/gemini-3.1-flash-image
Authorization: Bearer COMFY_API_KEY
Content-Type: application/json
```

```json
{"contents":[{"role":"user","parts":[{"text":"A red panda in a garden"}]}],"generationConfig":{"responseModalities":["IMAGE"],"imageConfig":{"aspectRatio":"1:1","imageSize":"1K"}}}
```

`contents` 必填，图片可用 `parts[].inlineData` 的 `mimeType` 和 Base64 `data`。`generationConfig.imageConfig` 可设置比例、分辨率和输出格式。默认响应中的图片位于 `candidates[].content.parts[].inlineData`。启用 `uploadImagesToStorage` 后，图片也可能以 `fileData.fileUri` 返回；两种形式可同时出现。返回地址的有效期依来源而变；安全拦截可能导致响应中没有图片。

来源：[2.1 schema](https://docs.comfy.org/router-schemas/vertexai/gemini-nano-banana-2.1.json)、[2 schema](https://docs.comfy.org/router-schemas/vertexai/gemini-3.1-flash-image.json)、[Pro schema](https://docs.comfy.org/router-schemas/vertexai/gemini-3-pro-image.json)。

## Runware

| 版本 | `model` | 官方模型页 |
| --- | --- | --- |
| 2 Lite | `google:nano-banana@2-lite` | [文档](https://runware.ai/docs/models/google-nano-banana-2-lite) |
| 2.1 | `google:nano-banana@2.1` | [文档](https://runware.ai/docs/models/google-nano-banana-2-1) |
| 2 | `google:4@3` | [文档](https://runware.ai/docs/models/google-nano-banana-2) |
| Pro | `google:4@2` | [文档](https://runware.ai/docs/models/google-nano-banana-pro) |

HTTP 请求发送至 `https://api.runware.ai/v1`，使用 `Authorization: Bearer RUNWARE_API_KEY`；请求体是任务数组。每个任务使用 `taskType: "imageInference"`、唯一 UUID v4 `taskUUID`、`model` 和 `positivePrompt`。输出尺寸使用成对的 `width` / `height`，可用尺寸见对应模型页。参考图通过 `inputs.referenceImages` 提供，四款模型均最多 14 张。`outputType` 可为 `URL`、`base64Data`、`dataURI`。成功结果以 `taskUUID` 关联。

2.1 的 `positivePrompt` 长度为 3–45000；`width` 和 `height` 必须同时设置，`resolution` 不能和宽高并用，使用 `resolution` 时必须提供参考图片。图片可为 UUID、URL、data URI 或 Base64。输出默认 `URL`。若 `deliveryMethod` 为 `async`，发送 `taskType: "getResponse"` 和同一个 `taskUUID` 查询；同步请求超过 120 秒仍在处理也应使用同样方式查询，而非重新生成。结果与错误分别见 `data` 和 `errors`。

```json
[{"taskType":"imageInference","taskUUID":"00000000-0000-4000-8000-000000000001","model":"google:nano-banana@2.1","positivePrompt":"A red panda in a garden","width":1024,"height":1024,"outputType":"URL"}]
```

来源：[Runware API](https://runware.ai/docs/models-api/introduction)、[任务查询](https://runware.ai/docs/models-api/task-polling)。

## fal

fal 将文生图和编辑分成两个端点。2.1 使用 `google/nano-banana-2.1` 和 `google/nano-banana-2.1/edit`；2 使用 `fal-ai/nano-banana-2` 和 `fal-ai/nano-banana-2/edit`；Pro 使用 `fal-ai/nano-banana-pro` 和 `fal-ai/nano-banana-pro/edit`。

使用 `@fal-ai/client` 设置 `FAL_KEY` 后可调用 `fal.subscribe(model, { input: {...} })`；长任务可用 `fal.queue.submit`、`status` 和 `result`。`prompt` 必填，编辑使用有序 `image_urls`，接受可访问 URL 或 Base64 data URI。2 的编辑端点将 `image_urls` 和 `context` 中图片合计限制为 14 张；2.1 最多 14 张。结果的 `images` 数组包含图片 URL；`sync_mode` 可返回 data URI，但结果不会保存在请求历史中。

| 字段 | fal 语义 |
| --- | --- |
| `num_images` | 生成数量，默认 1。 |
| `resolution` | 默认 `1K`；2.1 和 Pro 为 `1K`、`2K`、`4K`，2 还可用 `0.5K`。 |
| `aspect_ratio` | 2 和 2.1 默认 `auto`；Pro 文生图默认 `1:1`、编辑默认 `auto`。端点列出的可选比例包括常用比例及 `4:1`、`1:4`、`8:1`、`1:8`。 |
| `output_format` | `jpeg`、`png`、`webp`，默认 `png`。 |
| `safety_tolerance` | 字符串 `1` 至 `6`，默认 `4`。 |
| `system_prompt` | 可选系统指令，默认空字符串。 |
| `limit_generations` | 实验性限制输出，默认 true，可能影响生成质量。 |
| `thinking_level` | 2 为 `minimal` 或 `high`，默认 `minimal`；2.1 为 `minimal`、`medium`、`high`，默认 `medium`；Pro 只支持 `high`。 |
| `enable_web_search` | 是否联网搜索；2 还公开 `enable_image_search`。 |

2 和 Pro 的 `history` / `context` 可以承载原生会话、图片及文档，`return_history` 可返回后续复用的会话。继续会话时需保留原始 parts 和 thought signature。响应还可能包含 `description`、`conversations`、`grounding_metadata`。2.1 编辑的 `image_urls` 在提供视频或 PDF 时可省略。

2026-11-05 核对补充：2 的 fal Schema 还列有 `temperature`、`top_p`、`max_output_tokens` 和 `seed`；省略时保留供应商默认值。Comfy 的图片输出格式路径为 `generationConfig.imageConfig.imageOutputOptions.mimeType`，思考等级路径为 `generationConfig.thinkingConfig.thinkingLevel`，枚举采用大写。Google Interactions 的完整图片输出位于 `steps` 中 `type: model_output` 的 `content` 数组；图片块使用 `data` 与 `mime_type`。实现应逐张读取，不能只取 SDK 的最后一张便捷结果。

```javascript
import { fal } from "@fal-ai/client";
const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
  input: { prompt: "Make this a watercolor", image_urls: ["https://example.com/image.png"], resolution: "1K" }
});
console.log(result.data.images);
```

来源：[2.1 生成](https://fal.ai/models/google/nano-banana-2.1/api)、[2.1 编辑](https://fal.ai/models/google/nano-banana-2.1/edit/api)、[2 生成](https://fal.ai/models/fal-ai/nano-banana-2/api)、[2 编辑](https://fal.ai/models/fal-ai/nano-banana-2/edit/api)、[Pro 生成](https://fal.ai/models/fal-ai/nano-banana-pro/api)、[Pro 编辑](https://fal.ai/models/fal-ai/nano-banana-pro/edit/api)。
