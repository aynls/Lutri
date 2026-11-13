# Seedream 5.5 API（OpenRouter）

Lutri 通过 `POST https://openrouter.ai/api/v1/images` 调用 `bytedance-seed/seedream-5-5`，使用 Bearer API key。请求包含 `prompt`，图像编辑按输入顺序发送最多 10 张 `input_references`，每项为 `image_url` 类型。

`resolution` 支持 `1K`、`1.5K`、`2K`，宽高比使用端点公布的 `aspect_ratio` 枚举。`seed` 可选，每次请求返回一张图。`output_format` 为 `png` 或 `jpeg`，透明背景发送 `background: "transparent"` 与 `output_format: "png"`。结果从 `data[].b64_json` 和 `media_type` 读取。

端点列出了图层拆分的透传参数。Lutri 暂时提供生成和编辑，图层交付需要确认 OpenRouter 返回的图层坐标和层序。

[模型说明](https://openrouter.ai/bytedance-seed/seedream-5-5-20261112) · [端点能力](https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-5/endpoints)
