# GPT Image — OpenAI

核对日期：2026-11-07。来源：[图片生成](https://developers.openai.com/api/reference/resources/images/methods/generate)、[图片编辑](https://developers.openai.com/api/reference/resources/images/methods/edit)、[图片生成指南](https://developers.openai.com/api/docs/guides/image-generation)、[官方尺寸与成本计算器](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)。已核对自定义尺寸及 SVG 请求、返回契约，未发起生图请求。

使用 OpenAI API 密钥和 Bearer 认证。无参考图时以 JSON 请求 `POST https://api.openai.com/v1/images/generations`；有参考图时请求 `POST https://api.openai.com/v1/images/edits`，按顺序传入 `images: [{image_url: data URL}]`。蒙版通过 `mask.image_url` 提交，作用于第一张图片，透明区域表示编辑区域。

Lutri 的“生成／编辑／自动”是创作意图，仍然使用 Images API，不使用 Responses API。生成模式有参考图时也走 edits，并在最终提示词中说明图片仅用于参考创作；编辑模式明确原图并将其排到发送序列第一位，其余图片作为参考。此区别由提示词表达，不发送 `action` 字段。自动模式沿用原有输入驱动行为，不追加模式指令。生成模式保留但不允许提交蒙版，需移除蒙版或切回编辑。

模型为 `gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`、`gpt-image-2.6-flare` 和 `gpt-image-2.6-sunburst`。提示词最多 32000 字符，参考图最多 16 张。界面提供自动尺寸、常用尺寸预设、自定义宽高、质量、背景、数量、PNG/JPEG/WebP 格式、压缩质量和审核设置；2.6 另提供 `complexity`。透明背景使用 PNG 或 WebP。图像响应中的 `b64_json` 按响应的 `output_format` 解码。

## 自定义尺寸

2.5、2.6 的 Flare 和 Sunburst 共用 `size` 参数与校验，生成和编辑均发送 `"WIDTHxHEIGHT"`，例如 `"1536x864"`。选择自动尺寸时省略 `size`，也接受显式 `"auto"`。宽高必须同时填写，均为正整数且为 16 的倍数；每边不超过 3840 像素，长短边之比不超过 3，总像素为 655360–8294400（含边界）。界面和 MCP 提交共用校验，不接受格式错误或仅填写一边的尺寸。

约束沿用官方 GPT Image 2.5 尺寸规则。官方计算器已明确列出 GPT Image 2.6 Sunburst / Flare，并采用相同的宽高与像素校验；生成、编辑 API 的尺寸说明尚未在模型名单中补列 2.6。按用户要求，2.6 与 2.5 同步开放；尚未通过实际请求验证。官方将高于 `2560x1440` 的分辨率标为实验性。

## GPT Image 2.6 SVG

Flare、Sunburst 均提供 `output_format: "svg"`，仅走 generations，不能附带参考图或蒙版；`n` 必须为 1。SVG 不发送 `output_compression`，不支持编辑、流式、部分图片或 `prompt_rewriter`。透明背景参数仅用于 PNG / WebP，SVG 配合 `background: transparent` 时阻止提交。2.5 的格式选项不变。

| 界面参数 | 请求字段 | 规则 |
| --- | --- | --- |
| `svg_model` | `svg.model` | 可选的 SVG 转写模型 ID；官方定义为非空字符串，未公布固定枚举，因此使用文本输入，不借用 fal 或 Runware 的列表。 |
| `svg_thinking` | `svg.reasoning.effort` | none、minimal、low、medium、high、xhigh、max；指定时必须同时填写转写模型，具体可用强度由该模型决定。 |

自选转写模型需要账户具备 SVG model selection 权限。两个字段都留空时完全省略 `svg` 对象，使用供应商默认行为；仅填写模型时省略 reasoning，使用模型默认强度。字段只在 SVG 输出时显示和发送，切回位图保留草稿值但不发送。`complexity` 和 `quality` 控制中间参考图，与 SVG 转写推理强度独立。

返回 `data[].b64_json`，Base64 解码后是 SVG XML。结果类型先由响应的 `output_format` 解析，再以保存时识别的文件内容为准；保留 SVG 原文件，生成 PNG 缩略图并回填历史格式。响应的 `svg_usage` 与 `usage` 分别保留在任务元数据中。

当前 OpenAI 组合未开放流式响应与 GIF。
