# GPT Image 2.6 — OpenRouter

核对日期：2026-11-07。重新读取 Flare、Sunburst 的实时端点 JSON；未发起生图请求。

来源：[Flare 端点](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2.6-flare/endpoints)、[Sunburst 端点](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2.6-sunburst/endpoints)、[Image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)。本次实际读取两个端点 JSON，均返回下列能力。

`POST https://openrouter.ai/api/v1/images`，JSON，使用现有 OpenRouter Bearer 凭据。`model` 为 `openai/gpt-image-2.6-flare` 或 `openai/gpt-image-2.6-sunburst`。

| 字段 | 约束 |
| --- | --- |
| `prompt` | 文字提示词 |
| `input_references` | 最多 16 张；按顺序传入 `{type: "image_url", image_url: {url}}` |
| `aspect_ratio` | auto、1:1、3:2、2:3、4:3、3:4、16:9、9:16、21:9 |
| `quality` | auto、low、medium、high、xhigh、max |
| `background` | auto、transparent、opaque |
| `n` | 1–10 |
| `output_format` | Lutri 开放 png、jpeg、webp；端点还列出 gif，按产品要求排除 |
| `output_compression` | 0–100，仅显式 JPEG / WebP 时发送 |
| `provider.options.openai.complexity` | low、medium、high；必须放在供应商透传对象中 |
| `provider.options.openai.moderation` | auto、low |
| `stream` | 支持 SSE |

透明背景不能搭配 JPEG；省略格式时采用供应商默认 PNG。两个端点的 output_format 均只声明 png、jpeg、webp、gif，供应商透传白名单仅有 moderation、complexity，未声明 SVG 或转写参数，因此不开放 SVG，不透传 OpenAI 的 svg 对象。通用 Image API 文档包含 size 和 markup，但当前模型端点未列出，Lutri 不据此推断支持。

模型展示页与通用文档关于 GIF 的说明存在更新差异，本次以实际端点能力为准；Lutri 无论如何不开放 GIF。

非流式返回 `data[].b64_json` / `media_type`；流式使用已有的 completed 事件处理。仅完整结果进入保存流程。没有远程查询标识时，提交状态未知不自动重发。
