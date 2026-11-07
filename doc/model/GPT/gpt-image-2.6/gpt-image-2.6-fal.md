# GPT Image 2.6 — fal

核对日期：2026-11-07。已读取 Flare、Sunburst 的生成与编辑 OpenAPI Schema；未发起生图请求。

来源：[Flare 生成](https://fal.ai/models/openai/gpt-image-2.6/flare/text-to-image/api)、[Flare 编辑](https://fal.ai/models/openai/gpt-image-2.6/flare/edit/api)、[Sunburst 生成](https://fal.ai/models/openai/gpt-image-2.6/sunburst/text-to-image/api)、[Sunburst 编辑](https://fal.ai/models/openai/gpt-image-2.6/sunburst/edit/api)。机器可读 Schema 位于 `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id={endpoint_id}`。

## 请求

通过 `POST https://queue.fal.run/{endpoint_id}` 提交，使用现有 fal 凭据与 `Authorization: Key …`。

| 模型 | 无参考图 | 有参考图 |
| --- | --- | --- |
| Flare | `openai/gpt-image-2.6/flare/text-to-image` | `openai/gpt-image-2.6/flare/edit` |
| Sunburst | `openai/gpt-image-2.6/sunburst/text-to-image` | `openai/gpt-image-2.6/sunburst/edit` |

Lutri 的“生成／编辑／自动”表达创作意图；有参考图时仍使用 edit 接口。编辑原图按绑定 ID 排在第一位，蒙版对应该图。

| 字段 | 契约与默认值 |
| --- | --- |
| `prompt` | 必填，1–32000 字符；长度检查包含创作意图与图片引用展开后的提示词。 |
| `image_urls` | 编辑接口必填，最多 16 张；接受 HTTPS URL 或 Base64 data URI。 |
| `mask_url` | 编辑蒙版，白色修改、黑色保留。 |
| `image_size` | 预设名、auto 或 `{width,height}`；生成默认 landscape_4_3，编辑默认 auto。Lutri 将 `宽x高` 转为对象。 |
| `quality` | auto、low、medium、high、xhigh、max；默认 high。 |
| `reasoning_effort` | low、medium、high；默认 high；对应 OpenAI complexity，界面统一称为“复杂度”。 |
| `background` | auto、transparent、opaque；默认 auto。 |
| `num_images` | 1–10，默认 1；SVG 必须为 1。 |
| `output_format` | Lutri 提供 jpeg、png、webp、svg，默认 png；SVG 仅在无图片输入的生成接口可用。 |
| `output_compression` | 0–100；仅显式选择 JPEG/WebP 时显示和发送。 |
| `svg_model` | gpt-6-astra、gpt-5.5、gpt-5.4、gpt-5.6-terra、gpt-6-luna；默认 gpt-6-astra；仅纯文字 SVG 生成显示和发送。 |
| `sync_mode` | 默认 false；true 表示返回 data URI，不是切换为同步 HTTP 协议。 |
| `enable_safety_checker` | 默认 true；允许关闭与否由 fal 账户权限决定。 |

尺寸预设为 square_hd、square、portrait_4_3、portrait_16_9、landscape_4_3、landscape_16_9、auto。具体尺寸的每边须为 16 的倍数，最长边不超过 3840，比例不超过 3:1，总像素 655360–8294400。未填写的可选字段省略，由 fal 应用默认值。

GIF 与 frame_count、frame_duration_ms 按项目范围不开放。markup_image_url 标注引导编辑暂未接入，不以普通参考图或蒙版冒充。SVG 不接受参考图、蒙版和多图数量；fal 未提供独立 SVG 推理强度字段。

## 响应

沿用 fal 队列提交、状态查询与结果恢复流程。完成结果在 `images[]`，读取 url 和 content_type；sync_mode 的 data URI 由现有下载保存流程处理。SVG 沿用原文件保存与 PNG 缩略图生成能力。
