# GPT Image 2.5 API（OpenRouter）

来源：[Flare 端点能力](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2.5-flare/endpoints)、[Sunburst 端点能力](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2.5-sunburst/endpoints)、[Image API](https://openrouter.ai/blog/tutorials/image-generation/)。

## 请求

`POST https://openrouter.ai/api/v1/images`，使用 `Authorization: Bearer OPENROUTER_API_KEY`，JSON 请求体；`model` 分别为 `openai/gpt-image-2.5-flare` 和 `openai/gpt-image-2.5-sunburst`。两者当前端点公布相同参数。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `prompt` | string | 必填。 |
| `input_references` | 数组 | 0–16 张参考图，每项例如 `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`。 |
| `aspect_ratio` | string | `1:1`、`3:2`、`2:3`、`4:3`、`3:4`、`16:9`、`9:16`、`21:9`、`auto`。 |
| `quality` | string | `auto`、`low`、`medium`、`high`、`xhigh`、`max`。 |
| `background` | string | `auto`、`transparent`、`opaque`。 |
| `n` | integer | 1–10。 |
| `output_compression` | integer | 0–100。 |
| `provider.options.openai.moderation` | string | OpenAI 的内容审核参数，属于供应商透传字段。 |
| `stream` | boolean | 端点声明支持流式输出。 |

端点能力未列出蒙版和自定义像素尺寸。非流式图片返回 `data[].b64_json`；流式输出使用 SSE。

```json
{"model":"openai/gpt-image-2.5-flare","prompt":"A ceramic cup on a table","aspect_ratio":"1:1","quality":"high","n":1}
```
