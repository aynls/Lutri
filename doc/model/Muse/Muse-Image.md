# Muse Image API

## Meta

单次生成使用 `POST https://api.meta.ai/v1/images/generations`，`Authorization: Bearer MODEL_API_KEY`，JSON 请求包含 `model: "muse-image-1.0"` 和 `prompt`。`n` 为 1–10，默认 1；`size` 为 `宽x高`，只指定比例，不保证输出为该像素尺寸；`response_format` 默认 `b64_json`，也可选 `url`；`output_format` 默认 `webp`，也可选 `png`、`jpeg`。结果在 `data` 数组中。

编辑使用 `/v1/images/edits`。可通过 multipart 的 `image` 上传，也可使用 JSON `images` 数组，每项包含 `image_url`（公开 URL 或 data URL）或 `file_id`。对话式接口 `/v1/responses` 可通过 `previous_response_id` 继续修改。

JSON 编辑示例（替换图片地址）：

```bash
curl -X POST 'https://api.meta.ai/v1/images/edits' \
  -H "Authorization: Bearer $MODEL_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"muse-image-1.0","prompt":"Add a hat","images":[{"image_url":"https://example.com/input.png"}],"n":1}'
```

单次接口也支持 `stream: true`：生成完成事件为 `image_generation.completed`，编辑为 `image_edit.completed`；事件中的 `b64_json` 提供最终图片。URL 返回的是临时签名链接，应及时保存。

## fal

文字生成和编辑分别使用 `POST https://queue.fal.run/meta/muse-image/text-to-image` 与 `POST https://queue.fal.run/meta/muse-image/edit`，通过 `Authorization: Key FAL_KEY` 鉴权。`prompt` 必填，编辑还需 `image_urls`，包含 1–10 个 HTTP(S) URL 或 data URL。

`aspect_ratio` 接受 `width:height`，范围 1:16 至 16:1；仅比例有效，输出约 2.5 MP。`num_images` 默认 1，`output_format` 可选 `jpeg`、`png`、`webp`，默认 `webp`；`sync_mode` 为 true 时返回 data URI 且不保存至请求历史。提交后通过队列返回的状态及结果 URL 获取结果，图片位于 `images`。

```bash
curl -X POST 'https://queue.fal.run/meta/muse-image/edit' \
  -H "Authorization: Key $FAL_KEY" -H 'Content-Type: application/json' \
  -d '{"prompt":"Add a hat","image_urls":["https://example.com/input.png"],"aspect_ratio":"1:1","output_format":"webp"}'
```

输出 `images[].url` 是图片地址，可能附带 `content_type`、`width`、`height` 等信息。URL 输入需可由 fal 访问。

## Runware

使用 `imageInference` 任务，模型为 `meta:muse@image`，每个任务需要唯一 UUID v4 的 `taskUUID`。`positivePrompt` 必填；`width` 与 `height` 配对，默认值均为 1600；`resolution` 可为 `2K`。`outputType` 可为 `URL`、`base64Data`、`dataURI`，响应对应 `imageURL`、`imageBase64Data` 或 `imageDataURI`。

`inputs.referenceImages` 支持 1–10 张 UUID、URL、data URI 或 Base64；`positivePrompt` 为 1–200000 字符。明确指定宽高时必须一起提供，并从以下组合选择：1600×1600、1920×1280、1280×1920、1792×1344、1344×1792、2048×1152、1152×2048、2352×1008。各档约 2.5 MP，主要改变画幅。`resolution: "2K"` 需要参考图且不能与宽高同时使用，输出比例跟随参考图。

`settings.webSearch`、`settings.imageSearch`、`settings.shell` 均默认为 true；`settings.thinkingLevel` 为 `high` 或 `low`，默认 `high`；`settings.moderation` 为 `auto` 或 `low`。

```json
[{"taskType":"imageInference","taskUUID":"00000000-0000-4000-8000-000000000001","model":"meta:muse@image","positivePrompt":"A ceramic vase","width":1600,"height":1600,"outputType":"URL","outputFormat":"WEBP","settings":{"webSearch":false,"imageSearch":false,"shell":false}}]
```

成功结果在 `data` 数组中，以 `taskUUID` 关联任务。默认同步；如果请求转为异步或返回 `processing`，应按 [Runware 任务查询文档](https://runware.ai/docs/en/task-polling)获取结果。

## 参考来源

- [Meta：Muse Image](https://dev.meta.ai/docs/image-generation)
- [fal：生成](https://fal.ai/models/meta/muse-image/text-to-image/api)、[编辑](https://fal.ai/models/meta/muse-image/edit/api)
- [Runware：Muse Image](https://runware.ai/docs/models/meta-muse-image)
