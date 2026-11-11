# Seedream 5.5 API（Runware）

官方模型：`bytedance:seedream@5.5`。`POST https://api.runware.ai/v1`，Bearer 鉴权，请求为任务数组。Lutri 使用 `imageInference`、独立 UUID `taskUUID`、`deliveryMethod: "async"`、`outputType: "URL"`，通过 `getResponse` 轮询。

## 普通生成

`positivePrompt` 为 1–10000 字符；`inputs.referenceImages` 按实际提交顺序最多 10 张。Lutri 暴露 `resolution: 1K | 1.5K | 2K`，初始 2K；`numberResults` 为 1–20；`outputFormat` 为 PNG、JPG 或 WEBP，Lutri 初始 PNG。

`settings.background` 为 opaque 或 transparent。透明输出在 Lutri 固定为 PNG，适用于文本生成与参考图生成。接口也支持配对 width/height（每边 256–16383），但与 resolution 互斥；本期表单只暴露分辨率档位，不暴露自定义宽高。

## 图层拆分

`settings.layerDecomposition: true` 要求恰好一张源图。普通分辨率、背景及生成数量不提交。独立的 `layer_resolution` 映射为 resolution（1K / 1.5K / 2K），留空则省略。提示词可省略；提供时用于描述需要拆分的元素。

Lutri 的 `max_layers` 为 1–99，初始 29；提交到 `settings.layerDecompositionMaxImages` 时加 1，取值 2–100，包含底图。两个字段仅拆分模式有效。不提交 `layerDecompositionTextRecognition`，不提供 OCR 或文字层。

响应底图来自 `data[].imageURL`，图层来自 `data[].outputs.layers`，每层含 url、name、zIndex、boundingBox。zIndex 从底到顶递增且必须唯一；boundingBox.absolute 使用底图像素坐标 `[left, top, right, bottom]`，normalized 使用 0–1000。校验数量不超过模型上限及本次 max_layers。

## 本地交付

每个结果在指定目录的 `Lutri-<结果 ID>` 下输出 `composite.png`、`layers.psd`。下载图块及恢复数据保存在应用暂存区；合成图保存状态与 PSD 交付状态分别持久化。PSD 为可移动、隐藏的 RGBA 像素图层，保留中日文名称、层序、透明度及边界，使用与 PNG 相同的合成预览。只有两个文件都成功提交才完成交付；失败可通过界面“重试本地保存”或 MCP `resume_task` 重试，不重新生成。

来源：https://runware.ai/docs/models/bytedance-seedream-5-5
