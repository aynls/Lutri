# Recraft API（OpenRouter）

Lutri 使用 `POST https://openrouter.ai/api/v1/images` 和 OpenRouter API key。每次请求发送 `model`、`prompt`、可选 `aspect_ratio` 与 `n`（1–6）。`input_references` 按输入顺序发送，使用 `image_url` 类型。

| 变体 | 模型 ID（`recraft/` 后缀） | 图片输入 |
| --- | --- | --- |
| V4.1 位图 | `recraft-v4.1`、`recraft-v4.1-pro`、`recraft-v4.1-utility`、`recraft-v4.1-utility-pro` | 可选一张编辑源图 |
| V4、V4.1 矢量 | `recraft-v4-vector`、`recraft-v4-pro-vector`、`recraft-v4.1-vector`、`recraft-v4.1-pro-vector` | 可选一张编辑源图 |
| V4 Styles 位图及矢量 | `recraft-v4-styles`、`recraft-v4-styles-pro`、`recraft-v4-styles-vector`、`recraft-v4-styles-pro-vector` | 1–10 张风格参考图，PNG、JPEG 或 WebP，短边至少 256 像素 |

位图和常规矢量变体支持 `auto`、`1:1`、`4:3`、`3:4`、`16:9`、`9:16`。Styles 额外支持 `2:1`、`1:2`、`3:2`、`2:3`、`5:4`、`4:5`。Styles 根据参考风格生成新图。矢量变体发送 `output_format: "svg"`，从 `data[].b64_json` 和 `media_type` 读取结果。

[OpenRouter Recraft 模型目录](https://openrouter.ai/recraft) · [图像 API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) · [Styles 矢量端点](https://openrouter.ai/api/v1/images/models/recraft/recraft-v4-styles-vector/endpoints)
