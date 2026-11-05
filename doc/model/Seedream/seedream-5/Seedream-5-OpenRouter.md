# Seedream 5.0 API（OpenRouter）

```http
POST https://openrouter.ai/api/v1/images
Authorization: Bearer OPENROUTER_API_KEY
Content-Type: application/json
```

`prompt` 和 `model` 必填，可使用 `input_references` 传有序参考图，每项为 `{"type":"image_url","image_url":{"url":"https://example.com/a.png"}}`。成功响应的 `data[]` 包含 `b64_json` 图片数据和可能的 `media_type`。

| 模型 ID | `resolution` | `n` | 参考图 |
| --- | --- | --- | --- |
| `bytedance-seed/seedream-5-0-pro` | `1K`、`2K` | 1 | 0–14 |
| `bytedance-seed/seedream-5-0-lite` | `2K`、`4K` | 1–4 | 0–14 |
| `bytedance-seed/seedream-5-0-flash` | `1K`、`2K` | 1 | 0–14 |

三者均支持 `seed` 和 `aspect_ratio`，不支持流式，端点未列出可透传的供应商参数。`aspect_ratio` 支持 `1:1`、`1:2`、`2:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`9:19.5`、`19.5:9`、`9:20`、`20:9`、`9:21`、`21:9`、`auto`。

```bash
curl 'https://openrouter.ai/api/v1/images' -H "Authorization: Bearer $OPENROUTER_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"bytedance-seed/seedream-5-0-pro","prompt":"A watercolor coastal town","resolution":"2K","aspect_ratio":"4:3","n":1}'
```

来源：[Pro 端点](https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-0-pro/endpoints)、[Lite 端点](https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-0-lite/endpoints)、[Flash 端点](https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-0-flash/endpoints)、[Image API](https://openrouter.ai/blog/announcements/image-api/)。
