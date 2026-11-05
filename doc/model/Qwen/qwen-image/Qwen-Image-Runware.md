# Qwen Image API（Runware）

Runware 使用统一的任务 API：

| 版本 | `model` |
| --- | --- |
| 3.0 | `alibaba:qwen-image@3.0` |
| 3.0 Pro | `alibaba:qwen-image@3.0-pro` |
| 2.1 Pro | `alibaba:qwen-image@2.1-pro` |
| 2.1 Turbo | `alibaba:qwen-image@2.1-turbo` |

## 请求

```http
POST https://api.runware.ai/v1
Authorization: Bearer RUNWARE_API_KEY
Content-Type: application/json
```

请求体是任务数组。每项 `taskType` 为 `imageInference`，`taskUUID` 为唯一 UUID v4，`model` 指定模型，`positivePrompt` 描述期望内容。参考图放在 `inputs.referenceImages`，可使用 UUID、URL、data URI 或 Base64。输出设置有 `outputType`（`URL`、`base64Data`、`dataURI`）及 `outputFormat`；支持的格式随模型而变化。

3.0 页面列出最多 3 张参考图、`positivePrompt` 最多 32000 字符、`numberResults` 1–20（默认 1）、`seed` 0–2147483647，`width` 和 `height` 必须同时给出；面积约 0.26–4.19 MP，宽高比 1:8–8:1。`settings.promptExtend` 默认为 `true`；有参考图时 `settings.promptExtendMode` 必须是 `direct`，关闭扩写时不得设置 mode。3.0 Pro 同样是最多 3 张参考图，面积与宽高比一致。2.1 Pro/Turbo 最多 10 张参考图、提示词 2–3000 字符，单边 192–4096 像素，面积约 0.26–4.19 MP；有参考图时扩写模式须为 direct，关闭扩写时不得设置 `settings.thinking`。

```bash
curl 'https://api.runware.ai/v1' -H "Authorization: Bearer $RUNWARE_API_KEY" -H 'Content-Type: application/json' \
  -d '[{"taskType":"imageInference","taskUUID":"50836053-a0ee-4cf5-b9d6-ae7c5d140ada","model":"alibaba:qwen-image@3.0","positivePrompt":"A red bicycle","width":1024,"height":1024}]'
```

响应 `data[]` 按 `taskUUID` 匹配，包含 `imageUUID`、`imageURL` 等。异步任务查询参见 [Task Polling](https://runware.ai/docs/models-api/task-polling)。

来源：[3.0](https://runware.ai/docs/models/alibaba-qwen-image-3-0)、[3.0 Pro](https://runware.ai/docs/models/alibaba-qwen-image-3-0-pro)、[2.1 Pro](https://runware.ai/docs/models/alibaba-qwen-image-2-1-pro)、[2.1 Turbo](https://runware.ai/docs/models/alibaba-qwen-image-2-1-turbo)、[鉴权](https://runware.ai/docs/models-api/authentication)。
