# Seedream 5.5 API（fal）

Lutri 通过 `https://queue.fal.run/bytedance/seedream/v5.5/{operation}` 提交任务，使用 `Authorization: Key <API key>` 鉴权。

无参考图时使用 `text-to-image`，有参考图时使用 `edit`，按顺序提交最多 10 张 `image_urls`。`prompt` 必填。`image_size` 使用 `auto_1K`、`auto_1.5K` 或 `auto_2K`，初始为 2K。`num_images` 为 1–6。`background` 可选 `auto`、`opaque` 或 `transparent`，透明背景使用 PNG。普通结果从 `images[].url` 读取。

图层拆分使用 `layerize`。`image_url` 接收一张源图，`prompt` 可省略。拆层尺寸单独设置，默认 `auto`。`max_images` 包含底图，等于 Lutri 设置的最大图层数加 1。响应的 `layers` 包含 `image.url`、`z_index`、`bounding_box` 和可选名称。Lutri 使用 PNG 底图，按原坐标输出 `composite.png` 和 `layers.psd`。PSD 使用像素图层。

[文生图](https://fal.ai/models/bytedance/seedream/v5.5/text-to-image) · [图像编辑](https://fal.ai/models/bytedance/seedream/v5.5/edit) · [图层拆分](https://fal.ai/models/bytedance/seedream/v5.5/layerize)
