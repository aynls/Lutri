# Grok Imagine Image 2.0 API

本文介绍 Grok Imagine Image 2.0 的图像生成与编辑接口。

## xAI 官方接口

```http
POST https://api.x.ai/v1/images/generations
Authorization: Bearer XAI_API_KEY
Content-Type: application/json
```

编辑使用 `POST https://api.x.ai/v1/images/edits`。两个接口均使用 JSON，模型为 `grok-imagine-image-2.0`。

| 字段 | 说明 |
| --- | --- |
| `model` | 模型 ID。 |
| `prompt` | 描述生成或编辑目标。 |
| `n` | 生成张数，生成接口为 1–10，默认 1。 |
| `aspect_ratio` | 如 `1:1`、`16:9`、`21:9`、`5:2` 或 `auto`；完整枚举见官方文档。 |
| `resolution` | `1k` 或 `2k`。 |
| `quality` | `low`、`medium` 或 `auto`；默认 `auto`，目前生成选 low、编辑选 medium，服务可能调整。 |
| `response_format` | `url` 或 `b64_json`，默认为 URL；URL 有效期有限。 |
| `image` / `images` | 编辑时单图使用 `image`，多图使用 `images`，最多 5 张；每项包含 `url` 和 `type: "image_url"`，URL 可为公开地址或 data URI。 |

```json
{"model":"grok-imagine-image-2.0","prompt":"Turn this into a pencil sketch","image":{"url":"https://example.com/image.png","type":"image_url"},"resolution":"2k","response_format":"b64_json"}
```

从响应 `data[]` 中读取 `url` 或 `b64_json`；安全拦截可能导致响应中没有图片。来源：[生成](https://docs.x.ai/developers/model-capabilities/images/generation)、[编辑](https://docs.x.ai/developers/model-capabilities/images/editing)、[多图编辑](https://docs.x.ai/developers/model-capabilities/images/multi-image-editing)。

## OpenRouter

```http
POST https://openrouter.ai/api/v1/images
Authorization: Bearer OPENROUTER_API_KEY
Content-Type: application/json
```

`model` 为 `x-ai/grok-imagine-image-2.0`，提供 `prompt`，可选 `resolution`（`1K`、`2K`）、`aspect_ratio`、`quality`（`low`、`medium`）、`n`、`input_references`。当前端点仅允许 `n: 1`、最多 3 张参考图，比例为 `1:1`、`3:4`、`4:3`、`9:16`、`16:9`、`2:3`、`3:2`、`9:19.5`、`19.5:9`、`9:20`、`20:9`、`1:2`、`2:1`、`auto`。参考图项为 `{"type":"image_url","image_url":{"url":"https://example.com/image.png"}}`。当前端点未公布透传参数和流式支持，输出从 `data[].b64_json` 读取。来源：[模型端点记录](https://openrouter.ai/api/v1/images/models/x-ai/grok-imagine-image-2.0/endpoints)、[Image API](https://openrouter.ai/blog/announcements/image-api/)。

```json
{"model":"x-ai/grok-imagine-image-2.0","prompt":"A watercolor lighthouse","resolution":"1K","aspect_ratio":"1:1","quality":"medium","n":1}
```

## Runware

```http
POST https://api.runware.ai/v1
Authorization: Bearer RUNWARE_API_KEY
Content-Type: application/json
```

请求体为任务数组，每个任务包含 `taskType: "imageInference"`、唯一 UUID v4 `taskUUID`、`model: "xai:grok-imagine@image-2.0"` 和 `positivePrompt`。提示词长度为 1–64000。参考图放在 `inputs.referenceImages`，官方页面目前标明 1–5 项，支持 UUID、URL、data URI 和 Base64。可成对指定 `width` / `height`；也可以使用参考图和 `resolution`，但 `resolution` 不可与宽高并用。`settings.quality` 为 `low` 或 `medium`，默认 `medium`；`outputFormat` 默认 `JPG`，`outputQuality` 为 20–99、默认 95。具体尺寸组合与响应字段见模型页。`outputType` 可为 `URL`、`base64Data` 或 `dataURI`，根据任务 ID 关联结果；异步模式需使用任务查询协议。来源：[Runware 模型规范](https://runware.ai/docs/models/xai-grok-imagine-image-2-0)。

```json
[{"taskType":"imageInference","taskUUID":"00000000-0000-4000-8000-000000000001","model":"xai:grok-imagine@image-2.0","positivePrompt":"A watercolor lighthouse","width":1024,"height":1024}]
```

## Comfy Router

```http
POST https://api.comfy.org/v2/models/xai/grok-imagine-image-2.0
Authorization: Bearer COMFY_API_KEY
Content-Type: application/json
```

该路由是同步文生图，`prompt` 必填；`n` 为 1–10，默认 1；`resolution` 为 `1k` 或 `2k`；`aspect_ratio` 默认 `auto`，枚举见 schema。`quality` 支持 `low`、`medium`、`auto`；共享 schema 还列出 `high`，但未确认该模型支持此值。`response_format` 接受 `url` 或 `b64_json`，Comfy 会转成 URL 输出。成功结果在 `data[].url` 和 `mime_type`；转存失败的单张图片可能仍为上游短期 URL。安全拦截可返回 `block_reason` 而没有图片。该路由没有图片输入字段。来源：[Comfy Router schema](https://docs.comfy.org/router-schemas/xai/grok-imagine-image-2.0.json)。

```json
{"prompt":"A watercolor lighthouse","n":1,"aspect_ratio":"1:1","resolution":"1k","quality":"medium"}
```

## fal

生成使用 `xai/grok-imagine-image/v2.0/text-to-image`，编辑使用 `xai/grok-imagine-image/v2.0/edit`。设置 `FAL_KEY` 后可用 `@fal-ai/client` 的 `fal.subscribe` 或 `fal.queue.submit/status/result`；文件输入接受公开 URL 或 Base64 data URI。

| 字段 | 说明 |
| --- | --- |
| `prompt` | 必填，描述生成或编辑。 |
| `image_urls` | 编辑图片数组，最多 5 张，顺序应与提示词一致。 |
| `num_images` | 输出数量，默认 1。 |
| `aspect_ratio` | 默认生成 `1:1`、编辑 `auto`；支持 `21:9`、`5:2` 等，完整值见端点文档。 |
| `resolution` | `1k`、`1.5k`、`2k`；默认 `1k`。 |
| `output_format` | `jpeg`、`png`、`webp`；默认 `jpeg`。 |
| `quality` | `low`、`medium`、`auto`；默认 `medium`。 |
| `sync_mode` | 为 true 时返回 data URI，输出不保存在请求历史。 |

结果的 `images[]` 含图片 URL。来源：[生成](https://fal.ai/models/xai/grok-imagine-image/v2.0/text-to-image/api)、[编辑](https://fal.ai/models/xai/grok-imagine-image/v2.0/edit/api)。

```javascript
import { fal } from "@fal-ai/client";
const result = await fal.subscribe("xai/grok-imagine-image/v2.0/edit", {
  input: { prompt: "Make this a watercolor", image_urls: ["https://example.com/image.png"], resolution: "1k" }
});
console.log(result.data.images);
```
