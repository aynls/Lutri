# GPT Image 2.6 — Runware

核对日期：2026-11-07。已核对 Flare、Sunburst 的官方参数及依赖约束，未发起生图请求。

来源：[Flare API](https://runware.ai/docs/models/openai-gpt-image-2-6-flare)、[Sunburst API](https://runware.ai/docs/models/openai-gpt-image-2-6-sunburst)。

`POST https://api.runware.ai/v1`，Bearer 鉴权，JSON 数组。使用 `taskType: imageInference`、本地任务 UUID、`outputType: URL`、`deliveryMethod: async`、`includeCost: true`。复用现有 getResponse 恢复流程。

| 字段 | 约束 |
| --- | --- |
| `model` | `openai:gpt-image@2.6-flare` / `openai:gpt-image@2.6-sunburst` |
| `positivePrompt` | 2–32000 字符 |
| `inputs.referenceImages` | 最多 16 张，顺序保留 |
| `inputs.maskImage` | 白色区域编辑；与首张参考图同尺寸，绑定首张参考图 |
| `width` / `height` | 同时指定或同时省略；16–3840，16 的倍数；655360–8294400 像素，宽高比 1:3–3:1 |
| `numberResults` | 1–20，默认 1；文档未声明 SVG 专属单张限制 |
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

SVG 不允许参考图或蒙版。数量按 Runware 自身公布的 1–20 范围校验，不套用 OpenAI 直连或 fal 的单张限制；SVG 批量行为尚未通过实际请求验证。SVG 设置仅在 SVG 输出时发送，切回位图不会泄漏这些参数。未指定转写模型时，推理强度按默认的 `openai:gpt@5.4-mini` 校验。透明背景仅允许 PNG / WEBP，因此不能与 SVG 同用。

返回 `imageUUID`、`imageURL`、可选 cost；原始文件由现有资产流程保存，文件内容决定真实格式。

## 批量结果与恢复

按 [Task Polling](https://runware.ai/docs/models-api/task-polling) 和 [Errors](https://runware.ai/docs/models-api/errors) 核对，共用 Runware 适配器处理初始提交响应及 `getResponse` 快照。每次只接收当前 `taskUUID` 的结果；成功图片按 `imageUUID` 去重并逐张保存，有 `processing` 时继续查询，不用首张成功或本地预期数量判定整批完成。HTTP 成功响应中的 `errors[]` 也会被处理；查询本身的错误不会伪装成某张图片生成失败。

错误对象未保证提供单张图片 ID，因此按完整快照核对错误内容及重复次数，不把数组下标当作跨轮询的身份。不同错误重排不重复累加，同样的错误发生多次仍保留对应数量。错误更新涉及结果序号变化时，任务结果与瀑布流索引一并保存，已有成功图片的卡片保持关联。

轮询中断或超时进入“结果获取失败”，保留任务标识、已有结果和未完成标记；重试继续查询原任务，不补发生成请求。下载失败仅重试未保存的结果；后续快照提供新地址时更新下载地址。SVG 原文件、缩略图和实际媒体类型通过统一资产链路保存。以上为实现语义，尚未进行付费批量生成验证。

供应商另有 `inputs.markupImage`（透明 PNG 标注，与首图同尺寸，不能与 maskImage 同用），本次未开放。也未开放平台托管功能 webhookURL、uploadEndpoint、TTL、水印及额外安全扫描；结果由 Lutri 自行轮询和保存。GIF 按用户要求排除。
