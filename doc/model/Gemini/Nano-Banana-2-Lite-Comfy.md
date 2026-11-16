# Nano Banana 2 Lite API（Comfy Router）

`POST https://api.comfy.org/v2/models/vertexai/gemini-3.1-flash-lite-image` 接受 JSON 请求。Lutri 使用 `Authorization: Bearer COMFY_API_KEY` 鉴权，模型由路径确定。

| 请求字段 | 取值 |
| --- | --- |
| `contents[0].parts` | 提示词为第一个 `text` 项。最多 14 张参考图按顺序放入后续 `inlineData` 项，每项包含 `mimeType` 和 Base64 `data`。 |
| `generationConfig.responseModalities` | Lutri 发送 `["IMAGE"]`。 |
| `generationConfig.imageConfig.aspectRatio` | 可选。支持 `1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`21:9`、`1:4`、`4:1`、`1:8`、`8:1`。 |
| `generationConfig.imageConfig.imageSize` | 可选，Lite 支持 `1K`。 |
| `generationConfig.imageConfig.imageOutputOptions.mimeType` | 可选，Vertex AI 支持 `image/png` 和 `image/jpeg`。 |
| `generationConfig.thinkingConfig.thinkingLevel` | 可选，`MINIMAL` 或 `HIGH`。 |
| `uploadImagesToStorage` | 可选。为 `true` 时请求 Comfy 托管生成图。 |

```json
{
  "contents": [{ "role": "user", "parts": [{ "text": "A red panda in a garden" }] }],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": { "aspectRatio": "1:1", "imageSize": "1K" },
    "thinkingConfig": { "thinkingLevel": "MINIMAL" }
  }
}
```

结果位于 `candidates[].content.parts[]`。`inlineData` 包含 Base64 图片和媒体类型，`fileData.fileUri` 包含图片地址。Comfy 托管的地址在 24 小时后过期。上传失败的图片仍可能返回 `inlineData`，两种形式可出现在同一响应中。

[Comfy Router Schema](https://docs.comfy.org/router-schemas/vertexai/gemini-3.1-flash-lite-image.json) · [ComfyUI 模型参数](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_gemini.py) · [Google 模型规格](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite-image)
