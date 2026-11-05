# MAI Image API

MAI-Image-2.5 和 MAI-Image-2.6 可通过 Microsoft Foundry 和 OpenRouter 调用；fal 提供 2.5。

## Microsoft Foundry

在 Foundry 部署模型后，将 `RESOURCE` 替换为资源名称，`DEPLOYMENT` 替换为部署名称。该接口为预览版。

```http
POST https://RESOURCE.services.ai.azure.com/mai/v1/images/generations
api-key: AZURE_API_KEY
Content-Type: application/json
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 部署名称，不一定等于模型名称。 |
| `prompt` | string | 文本提示词，最大上下文 32,000 tokens。 |
| `width`, `height` | integer | 仅文字生成；每边至少 768 像素。2.5 的总像素最多 1,048,576，2.6 最多 2,359,296。 |
| `auto_aspect_ratio` | boolean | 仅 2.6 系列，由模型选择比例。 |
| `web_grounding` | boolean | 仅 2.6 系列，启用 Bing 搜索作为上下文。 |

编辑端点为 `/mai/v1/images/edits`，以 multipart 表单传入 `image` 文件及 `model`、`prompt`；图片为 JPEG 或 PNG，最多五张，通过重复 `image` 字段发送。生成和编辑响应的 `data[].b64_json` 是 PNG 的 Base64 数据。认证也可使用 Microsoft Entra ID，令牌 scope 为 `https://cognitiveservices.azure.com/.default`。

文字生成示例，`DEPLOYMENT_NAME` 是部署时自定义的名称：

```bash
curl -X POST "https://RESOURCE.services.ai.azure.com/mai/v1/images/generations" \
  -H "api-key: $AZURE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"DEPLOYMENT_NAME","prompt":"A lighthouse at dawn","width":1024,"height":1024}'
```

编辑示例，`image` 可以重复指定，生成端点的宽高字段不要用于编辑：

```bash
curl -X POST "https://RESOURCE.services.ai.azure.com/mai/v1/images/edits" \
  -H "api-key: $AZURE_API_KEY" \
  -F 'model=DEPLOYMENT_NAME' -F 'prompt=Add a blue hat' \
  -F 'image=@first.png;type=image/png' -F 'image=@second.png;type=image/png'
```

## OpenRouter

模型 ID 为 `microsoft/mai-image-2.5` 和 `microsoft/mai-image-2.6`。使用 `POST https://openrouter.ai/api/v1/images`，通过 Bearer API Key 鉴权。`aspect_ratio` 可为 `auto`、`1:1`、`4:3`、`3:4`、`16:9`、`9:16`、`3:2`、`2:3`，`n` 固定为 1；2.5 最多 1 张参考图，2.6 最多 5 张。2.6 的 Azure 端点允许透传 `web_grounding`，2.5 不支持透传参数；两者均不支持流式。

2.6 的请求示例：

```json
{"model":"microsoft/mai-image-2.6","prompt":"A blue ceramic vase","aspect_ratio":"4:3","n":1,"provider":{"options":{"azure":{"web_grounding":true}}}}
```

编辑参考图使用 `input_references`，每项例如 `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`。响应的图片位于 `data[].b64_json`。

## fal

2.5 的文字生成端点为 `POST https://queue.fal.run/microsoft/mai-image-2.5`，编辑端点为 `POST https://queue.fal.run/microsoft/mai-image-2.5/edit`；使用 `Authorization: Key FAL_KEY`。`prompt` 必填；`num_images` 默认 1；`aspect_ratio` 默认 `auto`，也接受 `1:1`、`4:3`、`3:4`、`16:9`、`9:16`、`3:2`、`2:3`；`output_format` 为 `jpeg`、`png`、`webp`，默认 `png`。`sync_mode` 为 true 时以 data URI 返回且不保存至请求历史。编辑时 `image_urls` 必填，只能包含一张可公开访问的 HTTP(S) URL 或 data URI。

```bash
curl -X POST 'https://queue.fal.run/microsoft/mai-image-2.5/edit' \
  -H "Authorization: Key $FAL_KEY" -H 'Content-Type: application/json' \
  -d '{"prompt":"Add a blue hat","image_urls":["https://example.com/input.png"],"aspect_ratio":"auto","output_format":"png"}'
```

队列返回请求 ID、状态和结果 URL；完成后读取结果的 `images[].url`，并及时下载。输出还包含 `description`，文件元数据可能包含宽高、类型和大小。

## 参考来源

- [Microsoft Foundry：MAI 图像模型](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai)
- [OpenRouter 图像生成](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenRouter：2.5 端点发现](https://openrouter.ai/api/v1/images/models/microsoft/mai-image-2.5/endpoints)、[2.6 端点发现](https://openrouter.ai/api/v1/images/models/microsoft/mai-image-2.6/endpoints)
- [fal：MAI Image 2.5](https://fal.ai/models/microsoft/mai-image-2.5/api)
- [fal：MAI Image 2.5 编辑](https://fal.ai/models/microsoft/mai-image-2.5/edit/api)
