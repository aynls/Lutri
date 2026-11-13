# Qwen Image API（OpenRouter）

```http
POST https://openrouter.ai/api/v1/images
Authorization: Bearer OPENROUTER_API_KEY
Content-Type: application/json
```

`prompt` 为必填文本。Qwen Image 3 和 3 Pro 使用 `qwen/qwen-image-3` 和 `qwen/qwen-image-3-pro`，最多接收 3 张参考图。Qwen Image 2.1 Pro 和 Turbo 使用 `qwen/qwen-image-2.1-pro` 和 `qwen/qwen-image-2.1-turbo`，最多接收 4 张参考图。

各模型支持 `resolution`（`1K`、`2K`）、`aspect_ratio`、`n`（1–6）和 `seed`。`input_references` 按提示词引用顺序传入，每项格式为 `{"type":"image_url","image_url":{"url":"https://example.com/a.png"}}`。端点不支持流式，未列出可透传的供应商参数。

允许的宽高比为 `1:1`、`1:2`、`1:4`、`2:1`、`2:3`、`3:2`、`3:4`、`4:1`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`。结果的 `data[]` 返回 `b64_json` 和可能的 `media_type`。按实际返回类型保存图像。

Pro 的模型页面称最多支持 4 张参考图，端点数据列出的上限为 3 张。

```bash
curl 'https://openrouter.ai/api/v1/images' -H "Authorization: Bearer $OPENROUTER_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen/qwen-image-3","prompt":"A watercolor landscape","resolution":"1K","aspect_ratio":"4:3","n":1}'
```

来源：[3.0 模型端点](https://openrouter.ai/api/v1/images/models/qwen/qwen-image-3/endpoints)、[3.0 Pro 模型端点](https://openrouter.ai/api/v1/images/models/qwen/qwen-image-3-pro/endpoints)、[3.0 Pro 模型页面](https://openrouter.ai/qwen/qwen-image-3-pro)、[Image API 说明](https://openrouter.ai/blog/announcements/image-api/)。
