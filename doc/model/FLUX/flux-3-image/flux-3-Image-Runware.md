# FLUX 3 Image API（Runware）

来源：[Runware 模型 API](https://runware.ai/docs/models/bfl-flux-3-image)、[调用示例](https://runware.ai/blog/flux-3-image-four-generations)。

## 请求

`POST https://api.runware.ai/v1`，`Authorization: Bearer RUNWARE_API_KEY`，JSON 数组中的任务 `taskType` 为 `imageInference`，`taskUUID` 为 UUID，模型为 `bfl:flux@3-image`。

| 字段 | 说明 |
| --- | --- |
| `positivePrompt` | 必填，2–32000 字符。 |
| `inputs.referenceImages` | 1–10 张参考图；支持 UUID、URL、data URI 或 Base64。 |
| `width`、`height` | 配对指定输出像素尺寸。 |
| `resolution` | `0.75K`、`1K`、`2K`、`4K`；用于带参考图的自动宽高比，与明确尺寸互斥。 |
| `settings.boundingBoxes` | 区域数组；没有参考图时，官方模型页面要求至少一个区域。供应商未标明数量上限，Lutri 统一按 32 个限制。 |
| `settings.grounding` | 联网参考配置，详见模型 Schema。 |
| `numberResults`、`outputFormat`、`outputQuality` | 输出数量、格式和压缩质量；取值见模型 Schema。 |

区域包含 `id`、`description`、`referenceIndex`、`sourceBox`、`targetBox`；坐标为 `[top,left,bottom,right]`，每项为 0–1000。`referenceIndex` 指向参考图数组；新元素不指定来源，删除元素时目标框为空且必须有参考图。区域 ID 在提示词中以 `<id>` 引用。

## 示例与响应

```json
[{"taskType":"imageInference","taskUUID":"00000000-0000-4000-8000-000000000001","model":"bfl:flux@3-image","positivePrompt":"A landscape with <tree>","width":1024,"height":1024,"settings":{"boundingBoxes":[{"id":"tree","description":"a pine tree","targetBox":[100,100,900,700]}]}}]
```

成功结果位于响应的 `data` 数组，常用图片地址为 `imageURL`。结果格式、异步模式和错误见 [Runware 图像推理 API](https://runware.ai/docs/en/image-inference)。
