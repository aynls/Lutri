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

端点记录未单独列出 `safety_tolerance` 的取值范围或默认值。Lutri 按用户实测结果提供“默认”和 0–4 整数下拉选项，并校验该范围；选择“默认”时省略该字段，由上游使用默认值 2。0 最严格，实际可用等级受 BFL 账户和路由限制，未获批准的等级会返回 422；另见 [BFL 文档](flux-3-Image-Klein-BFL.md)。

非流式返回图片位于 `data[].b64_json`。提示词中的图片顺序与 `input_references` 数组顺序对应。
