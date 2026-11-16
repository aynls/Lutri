# Recraft V4.1 Flash V2 API

Recraft V4.1 Flash V2 只接受提示词，生成 1K 位图。Lutri 的 Recraft、OpenRouter 和 fal 组合均支持配色和背景色。MCP 的组合 ID 为 `recraft-v4.1-flash-v2:recraft`、`recraft-v4.1-flash-v2:openrouter` 和 `recraft-v4.1-flash-v2:fal`。

## Recraft

发送 JSON 到 `POST https://external.api.recraft.ai/v1/images/generations`，使用 `Authorization: Bearer RECRAFT_API_TOKEN`。请求中的模型 ID 为 `recraftv4_1_flash_v2`。

| 请求字段 | 取值 |
| --- | --- |
| `prompt` | 必填，1–10,000 字符。 |
| `size` | 使用 [官方尺寸表](https://www.recraft.ai/docs/api-reference/appendix#image-sizes)中的 14 种比例（如 `16:9`）或 14 组 1K 尺寸（如 `1344x768`）。省略时从提示词选择比例。 |
| `n` | 1–6，默认 1。 |
| `random_seed` | 用于复现生成的整数种子。Lutri 接受 JavaScript 安全整数。 |
| `image_format` | `webp`（默认）或 `png`。 |
| `response_format` | Lutri 默认为 `multipart`，也可选 `url` 或 `b64_json`。 |
| `controls.colors` | 调色板，如 `[{"rgb":[30,60,90]}]`。 |
| `controls.background_color` | 背景色，如 `{"rgb":[245,240,232]}`。 |

RGB 分量为 0–255 的整数。调色板最多包含 10 个颜色。为调色板指定 `weight` 时，每个颜色都必须有权重，单个权重和权重总和均在 0–1 之间。 [颜色定义](https://www.recraft.ai/docs/api-reference/endpoints#colors)

```json
{
  "model": "recraftv4_1_flash_v2",
  "prompt": "A ceramic vase in warm window light",
  "size": "4:5",
  "n": 2,
  "response_format": "multipart",
  "controls": {
    "colors": [{ "rgb": [30, 60, 90] }],
    "background_color": { "rgb": [245, 240, 232] }
  }
}
```

`multipart/form-data` 响应的 `response` 分段包含结果清单。Lutri 按 `data[].image_id` 匹配图片分段的 `Content-ID`，将图片字节暂存在本地，随后按清单顺序入库。选择 `url` 或 `b64_json` 时，从 JSON 的 `data[].url` 或 `data[].b64_json` 读取结果。

[模型与示例](https://www.recraft.ai/docs/api-reference/models/recraft-v4-1-flash-v2) · [响应格式](https://www.recraft.ai/docs/api-reference/image-inputs-and-results)

## OpenRouter

发送 JSON 到 `POST https://openrouter.ai/api/v1/images`，使用 `Authorization: Bearer OPENROUTER_API_KEY`。请求发送 `model: "recraft/recraft-v4.1-flash-v2"` 和 `prompt`。可选的 `n` 为 1–6，默认 1。

`aspect_ratio` 支持 `auto`、`1:1`、`2:1`、`1:2`、`3:2`、`2:3`、`4:3`、`3:4`、`5:4`、`4:5`、`16:9`、`9:16`。颜色使用与原厂相同的 RGB 对象，通过 `provider.options.recraft.controls` 传入。响应为 JSON，从 `data[].b64_json` 和 `media_type` 读取图片。

```json
{
  "model": "recraft/recraft-v4.1-flash-v2",
  "prompt": "A ceramic vase in warm window light",
  "aspect_ratio": "4:5",
  "n": 2,
  "provider": {
    "options": {
      "recraft": {
        "controls": { "background_color": { "rgb": [245, 240, 232] } }
      }
    }
  }
}
```

[端点能力](https://openrouter.ai/api/v1/images/models/recraft/recraft-v4.1-flash-v2/endpoints) · [图像 API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)

## fal

发送 JSON 到 `POST https://queue.fal.run/recraft/v4.1/flash/v2/text-to-image`，使用 `Authorization: Key FAL_KEY`。

| 请求字段 | 取值 |
| --- | --- |
| `prompt` | 必填，1–10,000 字符。 |
| `image_size` | `square_hd`（默认）、`square`、`portrait_4_3`、`portrait_16_9`、`landscape_4_3`、`landscape_16_9`，或 `{width,height}` 对象。Lutri 将 `WxH` 转成尺寸对象，宽高各为 1–14,142 的整数。 |
| `colors` | 调色板，如 `[{"r":30,"g":60,"b":90}]`。 |
| `background_color` | 背景色，如 `{"r":245,"g":240,"b":232}`。 |
| `enable_safety_checker` | 默认开启，关闭需要 fal 账户授权。 |

RGB 分量为 0–255 的整数。每个请求生成一张图。要生成多张，在 Lutri 设置请求次数。提交后根据队列地址查询状态，完成后从 `images[].url` 取图。

[模型 API](https://fal.ai/models/recraft/v4.1/flash/v2/text-to-image/api) · [队列 Schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=recraft/v4.1/flash/v2/text-to-image)
