# FLUX 3 Image API（fal）

fal 将 FLUX 3 Image 的文字生成和参考图编辑分为两个端点。两者使用相同的队列接口提交任务、查询状态和获取结果。

## 请求

```http
POST https://queue.fal.run/blackforestlabs/flux-3/text-to-image
Authorization: Key FAL_KEY
Content-Type: application/json
```

编辑图片时，将请求地址改为 `https://queue.fal.run/blackforestlabs/flux-3/edit-image`，并提供 `image_urls`。将 `FAL_KEY` 替换为 fal API 密钥。请求体为 JSON。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `prompt` | string | 是 | — | 描述生成或编辑内容的文本。 |
| `image_urls` | string 数组 | 编辑时必填 | — | 1–10 张参考图的 URL 或 Base64 data URI；仅用于编辑端点。数组顺序对应提示词中的图片顺序。 |
| `aspect_ratio` | string | 否 | `auto` | 输出宽高比，可选值见下文。编辑时 `auto` 使用第一张参考图的比例。 |
| `resolution` | string | 否 | `1k` | 输出分辨率档位，可选值见下文。 |
| `enable_prompt_expansion` | boolean | 否 | 未在 Schema 中指定 | 扩展提示词，同时保留其意图和参考图的作用。 |
| `safety_tolerance` | integer | 否 | `2` | 内容审核容忍度，范围 0–4，0 最严格。 |
| `output_format` | string | 否 | `jpeg` | 输出格式：`jpeg` 或 `png`。 |
| `sync_mode` | boolean | 否 | 未在 Schema 中指定 | 为 `true` 时，以 data URI 返回图片，输出不保存在请求历史中。 |
| `version` | string | 否 | `latest` | 模型版本。 |

参考图每边至少 256 像素；超过 4 MP 的图片会在保持宽高比的情况下自动缩小至最多 4 MP。HTTP(S) 地址必须可公开访问；本地图片可转换为带媒体类型的 data URI，例如 `data:image/png;base64,...`。第一张图用于编辑时的 `auto` 比例判断。

### 宽高比与分辨率

两个端点的 API Schema 均列出以下 `aspect_ratio`：`auto`、`21:9`、`2:1`、`16:9`、`3:2`、`7:5`、`4:3`、`5:4`、`1:1`、`4:5`、`3:4`、`5:7`、`2:3`、`9:16` 和 `1:2`。

API Schema 列出的 `resolution` 为 `768sq`、`1k`、`1.5k`、`2k` 和 `4k`；`4k` 可能需要数分钟。fal 模型概述的分辨率列表与 Schema 不一致：概述列出 `512sq`，而未列出 `1.5k`。使用时应核对最新的 API Schema。

fal 的 Schema 还列出提示词扩展、输出格式和 `sync_mode`；BFL 原生接口中的自定义 `width`、`height`、`grounding` 和 `match_input` 未列在这两个 fal 端点的 Schema 中。不要假定它们可以直接使用。

## 示例

以下为 Bash 示例。先将密钥设置为环境变量 `FAL_KEY`。

生成图片：

```bash
curl --request POST 'https://queue.fal.run/blackforestlabs/flux-3/text-to-image' \
  --header "Authorization: Key $FAL_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"prompt":"A foggy coastal highway at dawn","aspect_ratio":"21:9","resolution":"1k"}'
```

多图参考编辑：将示例 URL 替换为可公开访问的图片地址。

```bash
curl --request POST 'https://queue.fal.run/blackforestlabs/flux-3/edit-image' \
  --header "Authorization: Key $FAL_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"prompt":"Turn image 1 in the style of image 2","image_urls":["https://example.com/image-1.png","https://example.com/image-2.png"]}'
```

## 响应与结果查询

队列提交成功后返回任务信息，包括 `request_id`、`status_url`、`response_url` 和 `cancel_url`。使用相同的 `Authorization` 请求头对返回的 `status_url` 发起 GET 请求。

| 状态 | 说明 |
| --- | --- |
| `IN_QUEUE` | 等待运行；响应可包含 `queue_position`。 |
| `IN_PROGRESS` | 正在运行。 |
| `COMPLETED` | 任务结束；失败或取消的任务也可能处于此状态，应检查错误信息并获取结果。 |

任务结束后，对返回的 `response_url` 发起 GET 请求。成功的模型响应包含 `images` 数组，每项的 `url` 为图片地址；还可能包含 `content_type`、`file_name`、`file_size`、`width` 和 `height`。使用 `sync_mode` 时，图片以 data URI 返回。获取结果时，如果模型执行失败，队列接口返回模型的错误响应。

fal 默认在任务完成后保留结果 1 小时；结果达到 10 KB 时保留 6 分钟。如果启用了载荷存储，结果保留时间取决于存储期限。应及时获取结果；图片文件本身的保存期限与队列结果的保留期限应分别核对。

如需取消任务，可对返回的 `cancel_url` 发起 PUT 请求。排队中的任务会被移除；运行中的任务会收到取消信号，具体如何停止由模型应用决定。

## 包围盒

BFL 原生接口文档提供了在 `prompt` 中描述包围盒的示例。fal 这两个端点的 API Schema 未列出独立的包围盒字段，也未说明 BFL 提示词示例在 fal 上的具体效果；相关示例见 [BFL 接口文档](flux-3-Image-BFL.md)。

## 参考来源

- [fal：FLUX 3 Image 生成 API](https://fal.ai/models/blackforestlabs/flux-3/text-to-image/api)
- [fal：FLUX 3 Image 编辑 API](https://fal.ai/models/blackforestlabs/flux-3/edit-image/api)
- [fal：生成模型概述](https://fal.ai/models/blackforestlabs/flux-3/text-to-image)
- [fal：提交队列任务](https://fal.ai/docs/api-reference/inference-api/queue/submit-path)
- [fal：查询任务状态](https://fal.ai/docs/api-reference/inference-api/queue/status)
- [fal：获取任务结果](https://fal.ai/docs/api-reference/inference-api/queue/result)
- [fal：取消任务](https://fal.ai/docs/api-reference/inference-api/queue/cancel)
