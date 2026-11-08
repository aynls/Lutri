# FLUX 3 Image Klein API（BFL）

来源：[BFL API 参考](https://docs.bfl.ai/api-reference/utility/generate-an-image-with-flux-3-klein)。

## 请求

`POST https://api.bfl.ai/v1/flux-3-image-klein`，使用 `x-key: BFL_API_KEY`，请求体为 JSON。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `prompt` | string，必填 | 生成或编辑描述。 |
| `images` | string 或数组 | 1–10 张 URL 或 Base64 图片；首图是编辑主图并影响默认尺寸。 |
| `aspect_ratio` | string | 默认 `auto`，可用 15 种比例：`21:9`、`2:1`、`16:9`、`3:2`、`7:5`、`4:3`、`5:4`、`1:1`、`4:5`、`3:4`、`5:7`、`2:3`、`9:16`、`1:2`、`9:21`。 |
| `resolution` | string | `768sq`、`1k`、`1.5k`、`2k`、`4k`。 |
| `width`、`height` | integer | 配对提供，单边 64–6256，总像素不超过 16822272；覆盖比例和分辨率。 |
| `seed` | integer | 0–4294967295。 |
| `safety_tolerance` | integer | Lutri 按用户实测限制为 0–4，默认 2，0 最严格；未获批准的值返回 422。 |
| `output_format` | string | `jpeg`（默认）或 `png`。 |
| `steps` | integer | 1–16，默认 16。 |
| `user` | string | 可选的最终用户标识，1–256 字符。 |

官方 Schema 声明的审核容忍度范围为 0–7，但用户实测仅支持 0–4。Lutri 据此提供“默认”和 0–4 整数下拉选项，并校验该范围；选择“默认”时省略该字段，由 BFL 使用默认值 2。

未设置尺寸时，文生图默认 `1k`；编辑默认参考第一张图的尺寸。`auto` 编辑时采用首图比例，文生图则根据提示词选择。

## 响应

提交返回 `id` 和 `polling_url`，并可能返回 `cost`、`input_mp`、`output_mp`。按返回的 `polling_url` 用同一 API key 查询，完成后读取 `result.sample` 并及时下载。流程参见 [FLUX 3 Image BFL 文档](../flux-3-image/flux-3-Image-BFL.md)。
