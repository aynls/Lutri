# MiniMax H3-Image / H3-Image HighSpeed

两个版本分别注册，同属 MiniMax 家族；均支持文本生成及最多 16 张参考图编辑。Lutri 默认提交 2048×2048，常用尺寸包含 4K。参考标记在输入准备完成后按实际提交顺序转换成 `Image 1` 等。

## Runware

`POST https://api.runware.ai/v1`，Bearer 鉴权。模型为 `minimax:h3@image` / `minimax:h3@image-highspeed`。使用 `imageInference`、独立 `taskUUID`、`deliveryMethod: "async"` 和 `getResponse` 轮询。参考图放入 `inputs.referenceImages`。

`positivePrompt` 为 1–32000 字符；`numberResults` 为 1–20；`outputFormat` 为 JPG、PNG 或 WEBP。尺寸使用配对的 `width` / `height`，或互斥的 `resolution: 1K | 2K | 4K`。每边 468–7745，面积 655360–20000000，比例 1:3–3:1。不指定尺寸时供应商默认 4K；Lutri 在尺寸全部清空后仍提交 2K。

`settings.promptOptimizer` 默认开启。只有文生图可关闭，并要求显式宽高；编辑不发送该开关。参考图每边 128–8192，比例不超过 4:1，每张最多 64 MiB。

## fal

队列端点为 `minimax/h3-image/text-to-image`、`minimax/h3-image/edit`，HighSpeed 对应 `minimax/h3-image/highspeed/text-to-image` 和 `minimax/h3-image/highspeed/edit`。`Authorization: Key` 鉴权，复用 fal 队列轮询。

参考图按序放入 `image_urls`，每边 128–8192。宽高映射到 `image_size: { width, height }`，输出尺寸限制同上；`num_images` 为 1–10；`output_format` 为 png、jpeg 或 webp。`enable_prompt_expansion` 仅文生图可选，编辑始终开启。结果来自 `images[].url`。

## OpenRouter

`POST https://openrouter.ai/api/v1/images`，Bearer 鉴权。模型为 `minimax/minimax-h3-image` / `minimax/minimax-h3-image-highspeed`。参考图放入 `input_references: [{ type: "image_url", image_url: { url } }]`。

Lutri 使用 `size: "宽x高"`，`n` 为 1–10，`output_format` 为 png、jpeg 或 webp。接口还公布 resolution、aspect_ratio 及 `disable_prompt_enhanced` 透传能力；本期不额外暴露这些与显式尺寸重叠或依赖供应商透传的控件。结果复用 Image API 的 `data` 解析。

## 官方来源

- https://runware.ai/docs/models/minimax-h3-image
- https://runware.ai/docs/models/minimax-h3-image/guides/prompting
- https://runware.ai/docs/models/minimax-h3-image/guides/editing-images
- https://fal.ai/minimax-h3-image
- https://fal.ai/models/minimax/h3-image/text-to-image/api
- https://fal.ai/models/minimax/h3-image/highspeed/edit/api
- https://openrouter.ai/api/v1/images/models/minimax/minimax-h3-image/endpoints
- https://openrouter.ai/api/v1/images/models/minimax/minimax-h3-image-highspeed/endpoints
