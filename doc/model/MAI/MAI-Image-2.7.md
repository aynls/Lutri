# MAI Image 2.7 API

Microsoft Foundry、OpenRouter 和 fal 均提供 MAI Image 2.7 与 MAI Image 2.7 Flash。两款模型均支持文生图和多图编辑，单次请求生成一张图片。Lutri 在有参考图时提交编辑请求，选定的编辑原图排在第一张，其余参考图保持相对顺序。接口参数未公开原生蒙版。

## Microsoft Foundry

在 Foundry 分别部署所需模型。两款预览模型的版本均为 `2026-11-02`，部署类型为 Global Standard。在 Lutri 填写资源端点、API 密钥及每个模型各自的部署名称。请求体的 `model` 是部署名称。

| 场景 | 请求 | 参数 |
| --- | --- | --- |
| 文生图 | `POST https://RESOURCE.services.ai.azure.com/mai/v1/images/generations`，JSON | `model`、`prompt`，可选 `width` 与 `height`。两边至少 768 像素，总像素最多 4,194,304。透明图传 `background: "transparent"`。 |
| 编辑 | `POST https://RESOURCE.services.ai.azure.com/mai/v1/images/edits`，multipart | `model`、`prompt` 和 1–5 个重复的 `image` 文件字段，接受 PNG 或 JPEG。Lutri 将宽高和背景设置用于文生图。 |

请求使用 `api-key` 头。结果是 `data[].b64_json` 中的 PNG 数据。根据 Foundry 请求文档，Lutri 的 2.7 系列直连不发送 `auto_aspect_ratio` 或 `web_grounding`。

## OpenRouter

`POST https://openrouter.ai/api/v1/images`，使用 Bearer API Key。模型 ID 为 `microsoft/mai-image-2.7` 和 `microsoft/mai-image-2.7-flash`。

| 参数 | 说明 |
| --- | --- |
| `model`, `prompt` | 模型 ID 和提示词。 |
| `aspect_ratio` | `auto`、`1:1`、`4:3`、`3:4`、`16:9`、`9:16`、`3:2`、`2:3`。 |
| `background` | `opaque` 或 `transparent`。 |
| `n` | 固定为 `1`。 |
| `input_references` | 最多 5 张图。每项为 `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`。 |
| `provider.options.azure.web_grounding` | 可选布尔值，用于联网搜索。 |

非流式响应，结果位于 `data[].b64_json`。

## fal

使用 `Authorization: Key FAL_KEY` 提交到 `https://queue.fal.run/` 下的以下路径，之后根据队列状态读取 `images[].url`。

| 模型 | 文生图 | 编辑 |
| --- | --- | --- |
| 2.7 | `microsoft/mai-image-2.7/text-to-image` | `microsoft/mai-image-2.7/edit` |
| 2.7 Flash | `microsoft/mai-image-2.7/flash/text-to-image` | `microsoft/mai-image-2.7/flash/edit` |

| 参数 | 说明 |
| --- | --- |
| `prompt` | 必填。 |
| `image_urls` | 编辑时必填，按编辑 API 参数表最多 5 张。接受公开 HTTP(S) URL 或 Data URL。 |
| `image_size` | 可选。预设有 `square_hd`、`landscape_4_3`、`portrait_4_3`、`landscape_3_2`、`portrait_3_2`、`landscape_16_9`、`portrait_16_9`。自定义尺寸用 `{ "width": 1280, "height": 768 }`，每边至少 768，总像素最多 4,194,304，fal 向下取整到 16 的倍数。省略时文生图默认 `square_hd`，编辑按原图选择接近的尺寸。 |
| `resolution` | 预设的 `1K` 或 `2K`，默认 `1K`。 |
| `background` | `opaque` 或 `transparent`，默认 `opaque`。 |
| `output_format` | `png`、`jpeg` 或 `webp`，默认 `png`。透明背景使用 PNG 或 WebP。 |
| `sync_mode` | 可选布尔值。启用时结果图以 Data URL 返回。 |

Lutri 的 `image_size` 选择 `custom` 时，`size` 填写 `宽x高`，提交时转换成 fal 的 `image_size` 对象。选择 `auto` 时由 fal 决定尺寸。

## 参考来源

- [Microsoft Foundry 部署及请求文档](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image)、[模型卡](https://microsoft.ai/pdf/MAI-Image-2.7-Model-Card.pdf)
- [OpenRouter 2.7 端点定义](https://openrouter.ai/api/v1/images/models/microsoft/mai-image-2.7/endpoints)、[2.7 Flash 端点定义](https://openrouter.ai/api/v1/images/models/microsoft/mai-image-2.7-flash/endpoints)
- [fal 2.7 生成](https://fal.ai/models/microsoft/mai-image-2.7/text-to-image/api)、[2.7 编辑](https://fal.ai/models/microsoft/mai-image-2.7/edit/api)、[2.7 Flash 生成](https://fal.ai/models/microsoft/mai-image-2.7/flash/text-to-image/api)、[2.7 Flash 编辑](https://fal.ai/models/microsoft/mai-image-2.7/flash/edit/api)
