# Seedream 5.5 API（火山方舟）

火山方舟的模型 ID 为 `doubao-seedream-5-5-261028`，默认地址为 `https://ark.cn-beijing.volces.com`。Lutri 使用供应商设置中的地址调用 `POST /api/v3/images/generations`，使用 Bearer API key 鉴权。

普通生成使用 `prompt` 和最多 10 张有序 `image`。`size` 支持 `1K`、`1.5K`、`2K` 和 `宽x高`。透明背景可用于文生图或图生图，发送 `background: "transparent"` 和 `output_format: "png"`。`response_format` 支持 `url` 和 `b64_json`。

拆层使用 `layer_decomposition: true` 和一张源图。拆层尺寸独立设置，默认 `auto`。`layer_decomposition_options.max_images` 包含底图，等于最大图层数加 1，范围为 2–100。拆层返回 PNG 底图和图层，按 `data[].z_index` 与 `bounding_box` 导出 `composite.png` 和 `layers.psd`。PSD 使用像素图层。

[火山方舟 Seedream 5.5 文档](https://console.volcengine.com/ark/region%3Acn-beijing/docs/seedream-5-5)
