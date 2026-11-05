# Recraft V4.1 / V4 Styles API

## Recraft 官方

文字生成使用 `POST https://external.api.recraft.ai/v1/images/generations`，请求头为 `Authorization: Bearer RECRAFT_API_TOKEN`，JSON 请求体。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `prompt` | string | 必填，最多 10,000 字符。 |
| `model` | string | V4.1 默认 `recraftv4_1`；其他变体为 `recraftv4_1_pro`、`recraftv4_1_utility`、`recraftv4_1_utility_pro`、`recraftv4_styles`、`recraftv4_styles_pro`。 |
| `size` | string | 比例或指定尺寸；省略时从提示词选择，支持尺寸见官方表。 |
| `n` | integer | 1–6，默认 1。 |
| `style_id` | UUID | 复用已创建的自定义风格。 |
| `style_reference_urls` | string 数组 | 风格参考图 URL 或 data URL。 |
| `style_match` | string | `flexible` 或 `precise`。 |
| `response_format` | string | `url`、`b64_json`、`multipart`，默认 `url`。 |
| `image_format` | string | `webp` 或 `png`，默认 `webp`；矢量模型固定 SVG。 |
| `random_seed` | integer | 可复现结果的随机种子。 |
| `controls.colors`, `controls.background_color` | 对象 | 偏好的颜色和背景颜色。 |

V4 Styles 必须提供 `style_id` 或 1–10 张风格参考图；也可以通过 multipart 的 `style_references` 上传。参考图为 PNG、JPG 或 WEBP，单张小于 20 MB，总计不超过 64 MB。结果中可能包含新建的 `style_id`，后续可复用；结果 `data` 每项对应一张图片，默认 URL 约保留 24 小时。风格与创建它的模型关联。V4.1 支持图生图；V4 Styles 不支持图生图和局部重绘。两者均不支持 `negative_prompt`、预置 `style` 和 `text_layout`。

## Runware

请求 `POST https://api.runware.ai/v1`，Bearer API key，JSON 数组中放置 `imageInference` 任务和唯一 UUID v4 `taskUUID`。模型 ID 分别为 `recraft:v4.1@0`、`recraft:v4.1-pro@0`、`recraft:v4.1-utility@0`、`recraft:v4.1-utility-pro@0`、`recraft:v4@styles` 和 `recraft:v4@styles-pro`。输出类型可为 `URL`、`base64Data`、`dataURI`；结果在 `data` 数组，其图片字段分别为 `imageURL`、`imageBase64Data`、`imageDataURI`。

Styles 路由使用 `positivePrompt`，以及互斥的 `inputs.referenceImages`（1–10 项）或 `inputs.styleId`；新建风格的结果包含可复用的 `outputs.styleId`。宽高需一起设置并从模型允许的尺寸对选择。参考图可使用 UUID、URL、data URI 或 Base64；每张至少 256×256 像素、不超过 10 MB，总计不超过 64 MB。

六条路由的 `positivePrompt` 均为 1–10000 字符。V4.1、V4.1 Pro、Utility、Utility Pro 要求同时指定 `width` 和 `height`；这四条路由的 Schema 未列出参考图输入字段。Styles 两条宽高可省略，提供时须成对；`settings.styleMatch` 为 `precise`（默认）或 `flexible`。

六条均列出 `settings.colors` 颜色数组和 `settings.backgroundColor`，每个颜色写成 `{"rgb":[红,绿,蓝]}`，分量 0–255。`numberResults` 为 1–20，默认 1。

非 Pro 变体（V4.1、Utility、Styles）支持的宽高组合为 1024×1024、1536×768、768×1536、1280×832、832×1280、1216×896、896×1216、1152×896、896×1152、832×1344、1280×896、896×1280、1344×768、768×1344；三个 Pro 变体使用这些尺寸每边乘 2 后的组合。

```json
[{"taskType":"imageInference","taskUUID":"00000000-0000-4000-8000-000000000001","model":"recraft:v4@styles","positivePrompt":"A ceramic vase","inputs":{"styleId":"00000000-0000-4000-8000-000000000002"},"width":1024,"height":1024,"settings":{"styleMatch":"precise","backgroundColor":{"rgb":[245,240,232]}}}]
```

同步返回若超时转为 `processing`，需按 [任务查询](https://runware.ai/docs/en/task-polling)继续获取。

## fal

文字生成路径为 `fal-ai/recraft/v4.1/text-to-image`、`fal-ai/recraft/v4.1/pro/text-to-image`、`fal-ai/recraft/v4.1/utility/text-to-image`、`fal-ai/recraft/v4.1/utility/pro/text-to-image`、`recraft/v4/style/text-to-image` 和 `recraft/v4/style/pro/text-to-image`。路径前加 `https://queue.fal.run/`，使用 `Authorization: Key FAL_KEY`。

六条生成端点均列有必填 `prompt`，`image_size` 默认为 `square_hd`，也可使用 `square`、`portrait_4_3`、`portrait_16_9`、`landscape_4_3`、`landscape_16_9` 或 `{width,height}`，并支持 `colors`、`background_color` 和默认启用的 `enable_safety_checker`；RGB 用 `{"r":255,"g":128,"b":0}`。Styles 和 Styles Pro 另外列出 `style_id`、`image_urls`（1–10 张 PNG、JPG 或 WebP）及 `style_match`（`precise`、`flexible`），输出 `images` 并可包含 `style_id`。Schema 未说明能否同时提供 `style_id` 和 `image_urls`。

```bash
curl -X POST 'https://queue.fal.run/fal-ai/recraft/v4.1/utility/text-to-image' \
  -H "Authorization: Key $FAL_KEY" -H 'Content-Type: application/json' \
  -d '{"prompt":"A ceramic vase","image_size":"square_hd","colors":[{"r":30,"g":60,"b":90}]}'
```

提交结果提供任务 ID 及状态和结果地址；完成后取 `images[].url`。

## 参考来源

- [Recraft V4.1](https://www.recraft.ai/docs/api-reference/models/recraft-v4-1)、[V4 Styles](https://www.recraft.ai/docs/api-reference/models/recraft-v4-styles)
- [Runware V4.1](https://runware.ai/docs/models/recraft-v4-1)、[V4.1 Pro](https://runware.ai/docs/models/recraft-v4-1-pro)、[Utility](https://runware.ai/docs/models/recraft-v4-1-utility)、[Utility Pro](https://runware.ai/docs/models/recraft-v4-1-utility-pro)、[Styles](https://runware.ai/docs/models/recraft-v4-styles)、[Styles Pro](https://runware.ai/docs/models/recraft-v4-styles-pro)
- [fal V4.1 Schema](https://fal.ai/models/fal-ai/recraft/v4.1/text-to-image/api)、[V4.1 Pro](https://fal.ai/models/fal-ai/recraft/v4.1/pro/text-to-image/api)、[V4 Styles](https://fal.ai/models/recraft/v4/style/text-to-image/api)
- [fal Utility](https://fal.ai/models/fal-ai/recraft/v4.1/utility/text-to-image/api)、[Utility Pro](https://fal.ai/models/fal-ai/recraft/v4.1/utility/pro/text-to-image/api)、[Styles Pro](https://fal.ai/models/recraft/v4/style/pro/text-to-image/api)
- [Runware V4 Styles 参考图与尺寸](https://runware.ai/docs/models/recraft-v4-styles/guides/prompting)
