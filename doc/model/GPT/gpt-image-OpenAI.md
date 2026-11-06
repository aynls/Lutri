# GPT Image — OpenAI

核对日期：2026-11-06。来源：[图片生成](https://developers.openai.com/api/reference/resources/images/methods/generate)、[图片编辑](https://developers.openai.com/api/reference/resources/images/methods/edit)、[图片生成指南](https://developers.openai.com/api/docs/guides/image-generation)。

使用 OpenAI API 密钥和 Bearer 认证。无参考图时以 JSON 请求 `POST https://api.openai.com/v1/images/generations`；有参考图时请求 `POST https://api.openai.com/v1/images/edits`，按顺序传入 `images: [{image_url: data URL}]`。蒙版通过 `mask.image_url` 提交，作用于第一张图片，透明区域表示编辑区域。

Lutri 的“生成／编辑／自动”是创作意图，仍然使用 Images API，不使用 Responses API。生成模式有参考图时也走 edits，并在最终提示词中说明图片仅用于参考创作；编辑模式明确原图并将其排到发送序列第一位，其余图片作为参考。此区别由提示词表达，不发送 `action` 字段。自动模式沿用原有输入驱动行为，不追加模式指令。生成模式保留但不允许提交蒙版，需移除蒙版或切回编辑。

模型为 `gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`、`gpt-image-2.6-flare` 和 `gpt-image-2.6-sunburst`。提示词最多 32000 字符，参考图最多 16 张。界面提供标准尺寸、质量、背景、数量、PNG/JPEG/WebP 格式、压缩质量和审核设置；2.6 另提供 `complexity`。透明背景使用 PNG 或 WebP。图像响应中的 `b64_json` 按响应的 `output_format` 解码。

OpenAI 还提供其他尺寸、流式响应以及 2.6 的 SVG、GIF 等能力；当前组合未暴露这些选项。
