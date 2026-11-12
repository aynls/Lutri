# MiniMax H3-Image / H3-Image HighSpeed

两个版本分别注册，同属 MiniMax 家族，均支持文本生成及最多 16 张参考图编辑。参考标记在输入准备完成后按实际提交顺序转换成 `Image 1` 等。

## Comfy Router

`POST https://api.comfy.org/v2/models/minimax/minimax-h3-image`。HighSpeed 使用 `minimax-h3-image-highspeed` 路径。使用 `X-API-Key` 鉴权，由路径选择模型。传入 `images: [{ image_url }]` 时执行编辑，无参考图时执行文生图。参考图按提交顺序传入，可用公开 HTTP(S) URL 或 Base64 data URI，Lutri 使用 data URI。

## MiniMax 官方 API

国际站使用 `https://api.minimax.io`，中国大陆站使用 `https://api.minimax.cn`。在 Lutri 的 MiniMax 供应商设置中选站点并保存该站点的 API Key，默认国际站。使用 Bearer 鉴权。文生图走 `POST /v1/images/generations`，编辑走 `POST /v1/images/edits`。模型字段为 `MiniMax-H3-Image` 或 `MiniMax-H3-Image-Highspeed`。

参考图按顺序放入 `images: [{ image_url }]`。Lutri 使用 Base64 data URI，并校验编辑请求 JSON（含 Base64）不超过 64 MiB。官方还接受公开 URL 或 `mm_file://` 文件引用。Lutri 使用同步 JSON 响应，指定 `response_format: "url"`。

### Comfy Router 与官方 API 的共用参数

- `size: "宽x高"` 为自定义像素尺寸，面积为 655360–20000000 像素，宽高比为 1:3–3:1。切换到自动尺寸时，可指定 `area: 1K | 2K | 4K`（Lutri 默认 2K）和 `aspect_ratio`（`auto` 或整数比例 `X:Y`，两项各为 1–300，宽高比仍为 1:3–3:1）。显式尺寸与面积档位、宽高比互斥。
- `n` 为 1–10。格式为 jpeg、png、webp，`output_compression` 为 0–100，仅用于 JPEG 或 WebP。
- `disable_prompt_enhanced` 仅用于文生图。关闭提示词优化时需指定宽高或固定比例。提示词最多 32000 字符。参考图每边 128–8192 像素，长边不超过短边 4 倍，支持 JPEG、PNG、WebP、HEIC、HEIF。
- 两家复用同步 Images 结果解析，下载 `data[].url`，记录单图错误、`revised_prompt` 和响应中的 `usage`。

## Runware

`POST https://api.runware.ai/v1`，Bearer 鉴权。模型为 `minimax:h3@image` / `minimax:h3@image-highspeed`。使用 `imageInference`、独立 `taskUUID`、`deliveryMethod: "async"` 和 `getResponse` 轮询。参考图放入 `inputs.referenceImages`。

`positivePrompt` 为 1–32000 字符；`numberResults` 为 1–20；`outputFormat` 为 JPG、PNG 或 WEBP。尺寸使用配对的 `width` / `height`，或互斥的 `resolution: 1K | 2K | 4K`。每边 468–7745，面积 655360–20000000，比例 1:3–3:1。不指定尺寸时供应商默认 4K；Lutri 在尺寸全部清空后仍提交 2K。

`settings.promptOptimizer` 默认开启。只有文生图可关闭，并要求显式宽高；编辑不发送该开关。参考图每边 128–8192，比例不超过 4:1，每张最多 64 MiB。

## fal

队列端点为 `minimax/h3-image/text-to-image`、`minimax/h3-image/edit`，HighSpeed 对应 `minimax/h3-image/highspeed/text-to-image` 和 `minimax/h3-image/highspeed/edit`。`Authorization: Key` 鉴权，复用 fal 队列轮询。

参考图按序放入 `image_urls`，每边 128–8192。宽高映射到 `image_size: { width, height }`，输出尺寸限制同上；`num_images` 为 1–10；`output_format` 为 png、jpeg 或 webp。`enable_prompt_expansion` 仅文生图可选，编辑始终开启。结果来自 `images[].url`。

## OpenRouter

`POST https://openrouter.ai/api/v1/images`，Bearer 鉴权。模型为 `minimax/minimax-h3-image` / `minimax/minimax-h3-image-highspeed`。参考图放入 `input_references: [{ type: "image_url", image_url: { url } }]`。

Lutri 使用 `size: "宽x高"`，`n` 为 1–10，`output_format` 为 png、jpeg 或 webp。文生图的提示词优化开关 `enable_prompt_expansion` 取反后映射到 `provider.options.minimax.disable_prompt_enhanced`；编辑不发送此开关。关闭优化时仍提交显式尺寸。接口还公布 resolution、aspect_ratio，本期不额外暴露这些与显式尺寸重叠的控件。结果复用 Image API 的 `data` 解析。

## 官方来源

- https://github.com/Comfy-Org/docs/blob/main/development/comfy-router/models/minimax/minimax-h3-image/code.mdx
- https://github.com/Comfy-Org/docs/blob/main/development/comfy-router/models/minimax/minimax-h3-image-highspeed/code.mdx
- https://platform.minimax.io/docs/guides/image-generation
- https://platform.minimax.cn/docs/guides/image-generation
- https://platform.minimax.io/docs/api-reference/image-generation-h3-generations
- https://platform.minimax.io/docs/api-reference/image-generation-h3-edits
- https://runware.ai/docs/models/minimax-h3-image
- https://runware.ai/docs/models/minimax-h3-image/guides/prompting
- https://runware.ai/docs/models/minimax-h3-image/guides/editing-images
- https://fal.ai/minimax-h3-image
- https://fal.ai/models/minimax/h3-image/text-to-image/api
- https://fal.ai/models/minimax/h3-image/highspeed/edit/api
- https://openrouter.ai/api/v1/images/models/minimax/minimax-h3-image/endpoints
- https://openrouter.ai/api/v1/images/models/minimax/minimax-h3-image-highspeed/endpoints
- https://openrouter.ai/docs/guides/overview/multimodal/image-generation
