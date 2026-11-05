# GPT Image 2.5 API（Comfy Router）

来源：[Flare Schema](https://docs.comfy.org/router-schemas/openai/gpt-image-2.5-flare.json)、[Sunburst Schema](https://docs.comfy.org/router-schemas/openai/gpt-image-2.5-sunburst.json)。

## 请求

同步请求 `POST https://api.comfy.org/v2/models/openai/gpt-image-2.5-flare` 或 `.../gpt-image-2.5-sunburst`，使用 `Authorization: Bearer COMFY_API_KEY` 和 JSON。省略 `image` 为生成，提供 `image` 为编辑。

| 字段 | 说明 |
| --- | --- |
| `prompt` | 必填，生成或编辑描述。 |
| `image` | 编辑输入，单图或 1–16 张数组；接受 PNG、JPEG、WebP 的 data URI 或符合 Router 白名单的 HTTPS URL。每张最多 25 MiB，一次请求图片合计最多 64 MiB。 |
| `mask` | 编辑蒙版，PNG 且包含 alpha，解析后小于 4 MiB，尺寸与第一张图一致；完全透明处为编辑区域。无 `image` 时会被丢弃。 |
| `size` | 像素尺寸字符串，如 `1024x1024`，也可为 `auto`。 |
| `quality` | `auto`、`low`、`medium`、`high`、`xhigh`、`max`。 |
| `background` | `auto`、`transparent`、`opaque`。 |
| `n` | 1–10。 |
| `output_format` | `png`、`webp`、`jpeg`。 |
| `output_compression` | 0–100，仅 JPEG 或 WebP。 |
| `moderation` | `auto` 或 `low`。 |
| `user` | 最终用户标识。 |

此同步接口不提供部分图片流；`stream` 会被设为 false，建议省略。`partial_images` 在生成请求中只能为 0 或 null。

图片 URL 的主机必须在 Schema 中 `OpenAIImageRouterMedia` 的白名单内；也可使用带媒体类型的 Base64 data URI。

## 响应

OpenAI 直接提供时图片位于 `data[].b64_json`。文生图可自动回退到其他供应商，编辑不会自动回退。回退后的默认结果可能使用 `data[].url`，且可能没有 `usage` 等 OpenAI 专有字段；严格模式可能返回供应商原始结构。
