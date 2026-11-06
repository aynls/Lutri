# GPT Image 2.6 — Runware

核对日期：2026-11-06。

来源：[Flare API](https://runware.ai/docs/models/openai-gpt-image-2-6-flare)、[Sunburst API](https://runware.ai/docs/models/openai-gpt-image-2-6-sunburst)。

`POST https://api.runware.ai/v1`，Bearer 鉴权，JSON 数组。使用 `taskType: imageInference`、本地任务 UUID、`outputType: URL`、`deliveryMethod: async`、`includeCost: true`。复用现有 getResponse 恢复流程。

| 字段 | 约束 |
| --- | --- |
| `model` | `openai:gpt-image@2.6-flare` / `openai:gpt-image@2.6-sunburst` |
| `positivePrompt` | 2–32000 字符 |
| `inputs.referenceImages` | 最多 16 张，顺序保留 |
| `inputs.maskImage` | 白色区域编辑；与首张参考图同尺寸，绑定首张参考图 |
| `width` / `height` | 同时指定或同时省略；16–3840，16 的倍数；655360–8294400 像素，宽高比 1:3–3:1 |
| `numberResults` | 1–20；Lutri 的 SVG 路径限制为 1 |
| `outputFormat` | JPG、PNG、WEBP、SVG；不开放 GIF |
| `outputQuality` | 20–99；SVG 时隐藏并省略 |
| `settings.quality` | auto、low、medium、high、xhigh、max |
| `settings.thinkingLevel` | low、medium、high；未指定时供应商默认 high |
| `settings.background` | auto、opaque、transparent；transparent 必须显式选择 PNG / WEBP |
| `settings.moderation` | auto、low |
| `settings.svg.model` | 见下表 |
| `settings.svg.thinkingLevel` | 与转写模型对应，见下表 |

## SVG 转写

| 模型 | 推理强度 |
| --- | --- |
| `openai:gpt@5.4-mini`（默认）、`openai:gpt@5.4`、`openai:gpt@5.5` | none、low、medium、high、xhigh |
| `openai:gpt@5.6-terra`、`openai:gpt@6-luna` | none、low、medium、high、xhigh、max |
| `openai:gpt@6-astra` | low、medium、high、xhigh、max |

SVG 不允许参考图或蒙版。Lutri 按 OpenAI SVG 单张限制设置每请求一张；Runware 通用数量范围仍为 1–20，尚无实际请求验证其 SVG 批量语义。SVG 设置仅在 SVG 输出时发送，切回位图不会泄漏这些参数。

返回 `imageUUID`、`imageURL`、可选 cost；原始文件由现有资产流程保存，文件内容决定真实格式。

供应商另有 `inputs.markupImage`（透明 PNG 标注，与首图同尺寸，不能与 maskImage 同用），本次未开放。也未开放平台托管功能 webhookURL、uploadEndpoint、TTL、水印及额外安全扫描；结果由 Lutri 自行轮询和保存。GIF 按用户要求排除。
