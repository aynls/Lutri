# FLUX 3 Image Klein API（OpenRouter）

来源：[模型页面](https://openrouter.ai/black-forest-labs/flux-3-image-klein/pricing)、[端点能力](https://openrouter.ai/api/v1/images/models/black-forest-labs/flux-3-image-klein/endpoints)。

`POST https://openrouter.ai/api/v1/images`，Bearer API Key，JSON 请求体。`model` 为 `black-forest-labs/flux-3-image-klein`，`prompt` 必填。

| 字段 | 说明 |
| --- | --- |
| `input_references` | 0–10 张，每项例如 `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`。 |
| `aspect_ratio` | `auto` 或 `21:9` 至 `9:21` 的模型支持比例。 |
| `resolution` | `768`、`1K`、`1.5K`、`2K`、`4K`。 |
| `output_format` | `jpeg`、`png`。 |
| `n` | 固定为 1。 |
| `seed` | 支持种子。 |
| `provider.options` | 按 `black-forest-labs` 上游标识透传 `safety_tolerance`、`steps`。 |

非流式返回图片位于 `data[].b64_json`。提示词中的图片顺序与 `input_references` 数组顺序对应。
