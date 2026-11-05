# FLUX 3 Image API（Comfy Router）

来源：[Comfy Router 模型 Schema](https://docs.comfy.org/router-schemas/bfl/flux-3-image.json)。

## 请求

`POST https://api.comfy.org/v2/models/bfl/flux-3-image`，使用 `Authorization: Bearer COMFY_API_KEY` 和 JSON 请求体。该路径同步返回结果；异步请求使用 Router 队列接口。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `prompt` | string，必填 | 生成或编辑描述。区域信息追加在提示词末尾，格式见下。 |
| `images` | string 或 string 数组 | 1–10 张参考图，URL 或 Base64；每张至少 256×256、最多 16 MP，Base64 载荷最多 20 MB。 |
| `aspect_ratio` | string | 默认 `auto`；可用 `21:9`、`2:1`、`16:9`、`3:2`、`7:5`、`4:3`、`5:4`、`1:1`、`4:5`、`3:4`、`5:7`、`2:3`、`9:16`、`1:2`、`9:21`。 |
| `resolution` | string | `768sq`、`1k`、`1.5k`、`2k`、`4k`；默认 `1k`。 |
| `grounding` | boolean | 联网和图片搜索，默认 true。 |
| `safety_tolerance` | integer | 0–4，默认 2。 |
| `version` | string | 默认 `latest`。 |

区域不是独立字段：生成区域作为 `{id,bbox,desc}` 对象数组追加至 `prompt`，编辑区域使用 `{id,from,src_bbox,tgt_bbox,desc}`。具体规则参考 [BFL 文档](flux-3-Image-BFL.md)。

## 响应

同步成功时返回 BFL 终态文档，图片在 `result.sample`；链接会过期。Comfy 重新托管失败时保留 BFL 原链接。`result.cost` 是上游费用，不是 Comfy 实际收费。
