# Qwen Image 3 API（Comfy Router）

模型路径为 `qwen/qwen-image-3.0` 和 `qwen/qwen-image-3.0-pro`。请求中省略 `model`，Router 根据路径填充。

## 请求

```http
POST https://api.comfy.org/v2/models/qwen/qwen-image-3.0
X-API-Key: COMFY_API_KEY
Content-Type: application/json
```

`input.messages` 恰含一个 `role: user` 消息；`content` 恰含一个 `text` 对象，编辑时再按顺序放 1–3 个 `{ "image": "URL 或 Base64" }`。`parameters` 可省略：

| 参数 | 说明 |
| --- | --- |
| `n` | 1–6，默认 1。 |
| `negative_prompt` | 负面提示词。 |
| `size` | `宽*高`；总像素 262144–6553600，宽高比 1:8–8:1；省略时模型决定。 |
| `seed` | 0–2147483647。 |
| `prompt_extend` | 提示词改写，默认 `true`。 |
| `prompt_extend_mode` | `direct`（默认）或 `agent`，后者仅用于文生图。 |
| `watermark` | 是否添加水印，默认 `false`。 |

```bash
curl 'https://api.comfy.org/v2/models/qwen/qwen-image-3.0' \
  -H "X-API-Key: $COMFY_API_KEY" -H 'Content-Type: application/json' \
  -d '{"input":{"messages":[{"role":"user","content":[{"text":"A red maple leaf"}]}]},"parameters":{"n":1,"size":"1024*1024"}}'
```

同步结果在 `output.choices[].message.content[].image`，是有效期 24 小时的 PNG URL。`usage` 提供输入输出图片数和输出宽高。队列方式在路径后加 `/requests` 提交，然后查询状态及获取结果；查询间隔遵循 `Retry-After`。

来源：[3.0 schema](https://docs.comfy.org/router-schemas/qwen/qwen-image-3.0.json)、[3.0 Pro schema](https://docs.comfy.org/router-schemas/qwen/qwen-image-3.0-pro.json)、[Router 快速开始](https://docs.comfy.org/development/comfy-router/quickstart)。
