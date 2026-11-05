# GPT Image 2.5 API（Runware）

来源：[Flare 模型 API](https://runware.ai/docs/models/openai-gpt-image-2-5-flare)、[Sunburst 模型 API](https://runware.ai/docs/models/openai-gpt-image-2-5-sunburst)。

## 请求

`POST https://api.runware.ai/v1`，使用 `Authorization: Bearer RUNWARE_API_KEY`，JSON 数组内是 `imageInference` 任务；使用 UUID 作为 `taskUUID`。模型分别为 `openai:gpt-image@2.5-flare` 和 `openai:gpt-image@2.5-sunburst`。

| 字段 | 说明 |
| --- | --- |
| `positivePrompt` | 必填，2–32000 字符。 |
| `inputs.referenceImages` | 1–16 张，UUID、URL、data URI 或 Base64。 |
| `inputs.maskImage` | 编辑蒙版，必须同时提供参考图；白色为编辑、黑色保留。多张参考图时作用于第一张，边缘仅作引导。 |
| `width`、`height` | 配对；单边 16–3840，步长 16。其他尺寸依赖见官方模型 Schema。 |
| `settings.background` | `auto`、`opaque`、`transparent`，默认 `auto`。透明背景要求 PNG 或 WebP。 |
| `settings.moderation` | `auto`、`low`，默认 `auto`。 |
| `settings.quality` | `auto`、`low`、`medium`、`high`、`xhigh`、`max`，默认 `auto`。 |
| `numberResults` | 1–20，默认 1。 |
| `outputFormat` | `JPG`、`PNG`、`WEBP`，默认 `JPG`。 |
| `outputQuality` | 压缩质量 20–99，默认 95。 |

成功结果在 `data` 数组中，通常通过 `imageURL` 取得图片。参见 [Runware 图像推理文档](https://runware.ai/docs/en/image-inference)了解同步和异步结果以及错误格式。
