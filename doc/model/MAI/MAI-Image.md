# MAI Image API

Lutri 通过 OpenRouter 接入 MAI Image 2.5 和 2.6，并通过 fal 接入 2.5。

2.7 与 2.7 Flash 的参数见 [MAI Image 2.7 API](MAI-Image-2.7.md)。

## OpenRouter

模型 ID 为 `microsoft/mai-image-2.5` 和 `microsoft/mai-image-2.6`。使用 `POST https://openrouter.ai/api/v1/images`，通过 Bearer API Key 鉴权。`aspect_ratio` 可为 `auto`、`1:1`、`4:3`、`3:4`、`16:9`、`9:16`、`3:2`、`2:3`，`n` 固定为 1。2.5 最多使用 1 张参考图，2.6 最多使用 5 张。OpenRouter 的 `provider.options.azure.web_grounding` 可为 2.6 启用联网搜索。两款模型均使用非流式响应。

2.6 的请求示例：

```json
{"model":"microsoft/mai-image-2.6","prompt":"A blue ceramic vase","aspect_ratio":"4:3","n":1,"provider":{"options":{"azure":{"web_grounding":true}}}}
```

编辑参考图使用 `input_references`，每项例如 `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`。响应的图片位于 `data[].b64_json`。

## fal

2.5 的文字生成端点为 `POST https://queue.fal.run/microsoft/mai-image-2.5`，编辑端点为 `POST https://queue.fal.run/microsoft/mai-image-2.5/edit`；使用 `Authorization: Key FAL_KEY`。`prompt` 必填；`num_images` 默认 1；`aspect_ratio` 默认 `auto`，也接受 `1:1`、`4:3`、`3:4`、`16:9`、`9:16`、`3:2`、`2:3`；`output_format` 为 `jpeg`、`png`、`webp`，默认 `png`。`sync_mode` 为 true 时以 data URI 返回且不保存至请求历史。编辑时 `image_urls` 必填，只能包含一张可公开访问的 HTTP(S) URL 或 data URI。

```bash
curl -X POST 'https://queue.fal.run/microsoft/mai-image-2.5/edit' \
  -H "Authorization: Key $FAL_KEY" -H 'Content-Type: application/json' \
  -d '{"prompt":"Add a blue hat","image_urls":["https://example.com/input.png"],"aspect_ratio":"auto","output_format":"png"}'
```

队列返回请求 ID、状态和结果 URL；完成后读取结果的 `images[].url`，并及时下载。输出还包含 `description`，文件元数据可能包含宽高、类型和大小。

## 参考来源

- [OpenRouter 图像生成](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenRouter：2.5 端点发现](https://openrouter.ai/api/v1/images/models/microsoft/mai-image-2.5/endpoints)、[2.6 端点发现](https://openrouter.ai/api/v1/images/models/microsoft/mai-image-2.6/endpoints)
- [fal：MAI Image 2.5](https://fal.ai/models/microsoft/mai-image-2.5/api)
- [fal：MAI Image 2.5 编辑](https://fal.ai/models/microsoft/mai-image-2.5/edit/api)
