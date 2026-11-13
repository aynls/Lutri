# Seedream 5.5 API（OpenRouter）

Lutri 通过 `POST https://openrouter.ai/api/v1/images` 调用 `bytedance-seed/seedream-5-5`，使用 Bearer API key。请求包含 `prompt`，图像编辑按输入顺序发送最多 10 张 `input_references`，每项为 `image_url` 类型。

`resolution` 支持 `1K`、`1.5K`、`2K`，宽高比使用端点公布的 `aspect_ratio` 枚举。`seed` 可选，每次请求返回一张图。`output_format` 为 `png` 或 `jpeg`，透明背景发送 `background: "transparent"` 与 `output_format: "png"`。结果从 `data[].b64_json` 和 `media_type` 读取。

## 图层拆分

拆层使用一张源图和独立的分辨率设置，默认 `1K`。留空提示词时，Lutri 发送默认拆层指令以满足 OpenRouter 的 `prompt` 要求。请求使用 `output_format: "png"`，在 `provider.options.seed` 中设置 `layer_decomposition: true` 和 `layer_decomposition_options.max_images`。`max_images` 包含底图，等于最大图层数加 1。

OpenRouter 在 `data[].layer` 中返回 `z_index`、`bounding_box` 和可选名称，图片数据仍在 `data[].b64_json`。Lutri 使用层序和坐标生成 `composite.png` 与 `layers.psd`。PSD 使用独立的像素图层。

[模型说明](https://openrouter.ai/bytedance-seed/seedream-5-5-20261112) · [端点能力](https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-5/endpoints)
