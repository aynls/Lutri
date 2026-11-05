# FLUX 3 Image API（OpenRouter）

OpenRouter 通过 Image API 调用 FLUX 3 Image，使用同一接口生成和编辑图片。请求完成后直接返回图片数据；该模型的当前供应商端点不支持流式响应。

## 请求

```http
POST https://openrouter.ai/api/v1/images
Authorization: Bearer OPENROUTER_API_KEY
Content-Type: application/json
```

将 `OPENROUTER_API_KEY` 替换为 OpenRouter API 密钥。请求体为 JSON。下表列出模型端点公布的参数；供应商路由和透传设置见下文。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | string | 是 | 固定为 `black-forest-labs/flux-3-image`。 |
| `prompt` | string | 是 | 描述生成或编辑内容的自由文本。 |
| `resolution` | string | 否 | 输出分辨率档位：`768`、`1K`、`1.5K`、`2K` 或 `4K`。 |
| `aspect_ratio` | string | 否 | 输出宽高比，可选值见下文。 |
| `n` | integer | 否 | 输出图片数量；当前端点仅支持 `1`。 |
| `input_references` | object 数组 | 否 | 参考图片，最多 10 张；结构见下文。 |
| `provider` | object | 否 | 供应商路由偏好及供应商专有参数。 |

`aspect_ratio` 支持 `21:9`、`2:1`、`16:9`、`3:2`、`7:5`、`4:3`、`5:4`、`1:1`、`4:5`、`3:4`、`5:7`、`2:3`、`9:16`、`1:2`、`9:21` 和 `auto`。OpenRouter 的端点记录未公布这些字段的默认值，不应直接将 BFL 原生接口的默认值视为 OpenRouter 的保证。

### 参考图片

`input_references` 按数组顺序提供参考图，每项的结构如下：

```json
{
  "type": "image_url",
  "image_url": {
    "url": "https://example.com/image.png"
  }
}
```

`url` 可以是可访问的 HTTP(S) 地址，也可以是带媒体类型的 Base64 data URL，例如 `data:image/png;base64,...`。提示词中涉及多张图片时，应保持描述与数组顺序一致。

### 供应商专有参数

当前 Black Forest Labs 端点允许将 `safety_tolerance`、`grounding` 和 `version` 通过 `provider.options` 透传。以端点的供应商标识 `black-forest-labs` 为键：

```json
{
  "provider": {
    "options": {
      "black-forest-labs": {
        "safety_tolerance": 2,
        "grounding": false,
        "version": "latest"
      }
    }
  }
}
```

这些字段的 BFL 原生语义和限制见 [BFL 接口文档](flux-3-Image-BFL.md)。OpenRouter 的端点记录确认了可透传的字段名称，但没有单独列出其取值范围或默认值。供应商路由也可通过 `provider` 设置，详见 OpenRouter 路由文档。

与 BFL 原生接口相比，OpenRouter 当前端点未列出 `width`、`height` 和 `match_input` 分辨率，也未将 `user` 列为可透传参数；不要假定它们可通过此端点使用。BFL 文档中的包围盒写在提示词中，并非独立 API 字段；OpenRouter 对这些提示词示例的效果未单独说明。

## 示例

以下为 Bash 示例。先将 OpenRouter 密钥设置为环境变量 `OPENROUTER_API_KEY`。

生成图片：

```bash
curl --request POST 'https://openrouter.ai/api/v1/images' \
  --header "Authorization: Bearer $OPENROUTER_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"model":"black-forest-labs/flux-3-image","prompt":"A foggy coastal highway at dawn","resolution":"1K","aspect_ratio":"21:9"}'
```

多图参考编辑：将示例 URL 替换为可访问的图片地址。

```bash
curl --request POST 'https://openrouter.ai/api/v1/images' \
  --header "Authorization: Bearer $OPENROUTER_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"model":"black-forest-labs/flux-3-image","prompt":"Turn Image 1 in the style of Image 2","input_references":[{"type":"image_url","image_url":{"url":"https://example.com/image-1.png"}},{"type":"image_url","image_url":{"url":"https://example.com/image-2.png"}}]}'
```

## 响应与错误

非流式成功响应的 `data` 数组包含生成的图片。`data[].b64_json` 是 Base64 编码的图片数据，解码后可保存；`data[].media_type` 在已知时标识图片格式。响应可能包含 `usage`，其中 `usage.cost` 表示本次请求费用，单位为美元。处理响应前应先检查 HTTP 状态，并根据实际媒体类型选择文件扩展名。

常见错误包括：HTTP 400 表示请求或模型参数不受支持，401 表示认证失败，402 表示余额不足，404 可能表示模型或符合路由条件的端点不存在，429 表示请求受到限流。应结合响应体判断具体原因。

## 能力与价格查询

供应商能力和价格可能变化。可以查询当前模型的各供应商端点，检查 `supported_parameters`、`allowed_passthrough_parameters`、`supports_streaming` 和 `pricing`：

```bash
curl 'https://openrouter.ai/api/v1/images/models/black-forest-labs/flux-3-image/endpoints' \
  --header "Authorization: Bearer $OPENROUTER_API_KEY"
```

## 参考来源

- [OpenRouter：FLUX 3 Image 模型 API](https://openrouter.ai/black-forest-labs/flux-3-image/api)
- [OpenRouter：模型供应商端点数据](https://openrouter.ai/api/v1/images/models/black-forest-labs/flux-3-image/endpoints)
- [OpenRouter：Image API 使用示例](https://openrouter.ai/blog/tutorials/image-generation/)
- [OpenRouter：Image API 与供应商透传](https://openrouter.ai/blog/announcements/image-api/)
- [OpenRouter：模型能力、路由与错误](https://openrouter.ai/blog/tutorials/image-generation-models/)
