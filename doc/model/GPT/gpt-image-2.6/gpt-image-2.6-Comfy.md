# GPT Image 2.6 — Comfy Router

核对日期：2026-11-07。通过已配置的 Comfy 凭据只读查询，两个模型的目录条目与实时 OpenAPI Schema 均返回 HTTP 200；未发起生图请求。

来源：[模型发现](https://docs.comfy.org/development/comfy-router/discover-models)、[Schema 读取](https://docs.comfy.org/development/comfy-router/schemas)、[Flare 实时 Schema](https://api.comfy.org/v2/models/openai/gpt-image-2.6-flare/openapi.json)、[Sunburst 实时 Schema](https://api.comfy.org/v2/models/openai/gpt-image-2.6-sunburst/openapi.json)。实时地址需要认证。静态文档目录与 docs.comfy.org/router-schemas/ 当时尚未同步 2.6，不用其 404 判断线上模型是否存在。

## 请求

同步请求 `POST https://api.comfy.org/v2/models/openai/gpt-image-2.6-flare` 或 `.../gpt-image-2.6-sunburst`，JSON，沿用现有 Comfy Bearer 凭据；官方同样支持 X-API-Key。

省略 image 为生成，提供 image 为编辑。Router 按 URL 填充模型，不需要请求体 model。

| 字段 | 契约 |
| --- | --- |
| `prompt` | 必填，生成或编辑描述。 |
| `image` | 单图或 1–16 张数组；PNG、JPEG、WebP 的 data URI 或允许的 HTTPS URL。单图最多 25 MiB，合计最多 64 MiB。Lutri 通过现有输入准备流程发送 data URI。 |
| `mask` | 带 alpha 的 PNG，小于 4 MiB，尺寸与第一张图片相同；完全透明区域为编辑区域。无图片时 Router 丢弃此字段。 |
| `size` | 宽x高或 auto；Lutri 沿用 GPT Image 尺寸约束：每边为 16 的倍数、最长边 3840、比例不超过 3:1、总像素 655360–8294400。 |
| `quality` | auto、low、medium、high、xhigh、max。共享 Schema 还列出 standard、hd，但说明是旧 DALL·E 值，不在 Lutri 中提供。 |
| `background` | auto、transparent、opaque；透明背景不使用 JPEG。 |
| `n` | 1–10。 |
| `output_format` | png、webp、jpeg。 |
| `output_compression` | 0–100；仅显式选择 JPEG/WebP 时显示和发送。 |
| `moderation` | auto、low。 |
| `user` | 最终用户标识。 |

实时 Schema 明确拒绝 complexity、frame_count、frame_duration_ms，也不支持 SVG 或 GIF。Lutri 不声明这些字段，不将其他供应商的复杂度设置透传到 Comfy。未填写的可选字段省略，由供应商应用默认值。

不开放流式响应：Router 将 stream 设为 false；生成请求的 partial_images 只能为 0 或 null，Lutri 均省略。

## 响应与路由

两款 2.6 均为 OpenAI 单一来源，当前没有 2.5 的 fal、Runware、WaveSpeed 备选供应商回退。结果在 `data[].b64_json`，图片格式按响应 output_format 解码。沿用现有 Images 响应处理与资产保存流程。
