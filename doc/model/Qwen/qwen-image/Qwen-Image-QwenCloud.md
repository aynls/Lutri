# Qwen Image API（QwenCloud）

QwenCloud 的同步 DashScope 接口支持文生图与多图编辑，模型包括 `qwen-image-3.0`、`qwen-image-3.0-pro`、`qwen-image-2.1-pro` 和 `qwen-image-2.1-turbo`。区域、密钥和模型必须匹配。

## 请求

```http
POST https://ap-southeast-1.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation
Authorization: Bearer DASHSCOPE_API_KEY
Content-Type: application/json
```

这是新加坡区域示例。请求包含 `model`、`input.messages` 和可选 `parameters`。`messages` 只包含一个 `role` 为 `user` 的对象，其 `content` 按顺序放参考图片和恰好一个文本对象。3.0 系列接受 1–3 张参考图，2.1 系列接受 1–10 张；文生图省略图片。`image` 是公开 URL 或 data URL。图片格式支持 JPEG、PNG、BMP、TIFF、WebP、GIF，单张不超过 10 MB，动图仅处理首帧。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 必填，使用上列模型 ID。 |
| `input.messages[].content[].text` | string | 必填，提示词或编辑指令，建议不超过 4500 tokens。 |
| `input.messages[].content[].image` | string | 可选参考图，按数组顺序编号。 |
| `parameters.size` | string | `宽*高`；总像素在 512×512 至 2048×2048 之间，宽高比 1:8 至 8:1；省略时模型自动推荐。 |
| `parameters.n` | integer | 1–6，默认 1。 |
| `parameters.negative_prompt` | string | 不希望出现的内容，最多 500 字符；2.1 系列不支持。 |
| `parameters.prompt_extend` | boolean | 提示词改写，默认 `true`。 |
| `parameters.prompt_extend_mode` | string | `direct`（默认）或 `agent`；`agent` 仅支持文生图。 |
| `parameters.enable_thinking` | boolean | 思考开关，默认 `true`。 |
| `parameters.watermark` | boolean | 右下角水印，默认 `false`。 |
| `parameters.seed` | integer | 随机种子；具体范围参见官方文档。 |

```bash
curl 'https://ap-southeast-1.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation' \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen-image-3.0-pro","input":{"messages":[{"role":"user","content":[{"image":"https://example.com/input.png"},{"text":"将图片改为水彩风格"}]}]},"parameters":{"size":"1024*1024","n":1,"watermark":false}}'
```

## 响应与异步

同步响应在 `output.choices[].message.content[]` 返回图片 URL。异步文生图使用 `POST /api/v1/services/aigc/image-generation/generation` 与 `X-DashScope-Async: enable`，返回 `output.task_id`，再用 `GET /api/v1/tasks/{task_id}` 查询至 `SUCCEEDED` 或 `FAILED`，官方建议间隔 10 秒。详见 [异步生成](https://docs.qwencloud.com/api-reference/image-generation/qwen-text-to-image-30-async) 和 [任务查询](https://docs.qwencloud.com/api-reference/image-generation/qwen-text-to-image-task-query)。

## 来源

- [QwenCloud 同步 API](https://docs.qwencloud.com/api-reference/image-generation/qwen-text-to-image)
- [Qwen Image 生成与编辑参数](https://www.alibabacloud.com/help/en/model-studio/qwen-image-generation-and-editing-api-reference)
- [图像编辑输入限制](https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide)
