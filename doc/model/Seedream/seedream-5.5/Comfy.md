# Seedream 5.5 API（Comfy Router）

`POST https://api.comfy.org/v2/models/byteplus/seedream-5-5-261028`，使用 `X-API-Key` 鉴权。模型由路径确定，不再发送 model 字段。响应保持 BytePlus 原生形状。

## 普通生成

`prompt` 为描述；`image` 为有序参考图数组，最多 10 张。Lutri 暴露 `size: 1K | 1.5K | 2K`，初始 2K。接口也支持自定义 `宽x高`（面积 921600–4624220，比例 1:16–16:1），本期表单不暴露该模式。

`background` 为 auto / opaque / transparent；透明模式固定 `output_format: "png"`。其他场景可选 png / jpeg；初始 png。`response_format` 为 url / b64_json；watermark 为可选布尔值。5.5 不支持组图、stream、联网搜索，也不支持 optimize_prompt_options.mode=fast；本期不暴露这些参数。

## 图层拆分

`layer_decomposition: true` 要求恰好一张源图，不发送 background。独立 `layer_resolution`（auto / 1K / 1.5K / 2K）映射到 size，默认 auto，不沿用普通生成尺寸。prompt 可省略。

Lutri 的 `max_layers` 为 1–99，初始 29，提交为 `layer_decomposition_options: { max_images: max_layers + 1 }`，包含底图。未启用拆分时不提交该对象。

响应 `data` 是底图及图层数组：底图 z_index=0，图层按正 z_index 从下向上堆叠；数量上限为本次 max_images。每项使用 url 或 b64_json，图层包含 name、description、bounding_box.absolute / normalized。边界坐标为 `[left, top, right, bottom]`；normalized 是 0–1000。

每个成功结果交付 `Lutri-<结果 ID>/composite.png` 和 `layers.psd`。PNG 与 PSD 合成预览相同，PSD 保留独立像素图层、透明度、中日文名称与边界。下载图块和恢复状态位于应用暂存区；交付失败不抹掉已保存合成图，界面及 MCP `get_task` 返回独立交付状态、错误和产物路径；`resume_task` 可重试本地保存。不提供文字识别和原生文字层。

官方 schema 生成文档：https://github.com/Comfy-Org/docs/blob/main/development/comfy-router/models/byteplus/seedream-5-5-261028/code.mdx
