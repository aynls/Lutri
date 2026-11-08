# FLUX 3 Image Klein API（fal）

来源：[文生图](https://fal.ai/models/blackforestlabs/flux-3/klein/text-to-image/api)、[编辑](https://fal.ai/models/blackforestlabs/flux-3/klein/edit-image/api)。

## 请求

以 `Authorization: Key FAL_KEY` 和 JSON 提交至 `https://queue.fal.run/blackforestlabs/flux-3/klein/text-to-image`；编辑使用 `https://queue.fal.run/blackforestlabs/flux-3/klein/edit-image`。队列返回任务信息，按返回地址查询状态和获取结果。

| 字段 | 说明 |
| --- | --- |
| `prompt` | 必填，编辑时可按顺序引用图片。 |
| `image_urls` | 编辑必填，最多 10 张 URL 或 data URI。 |
| `image_size` | 预设名或 `{width,height}`，每边 256–4096；生成默认 `square_hd`，编辑省略时按参考图确定。 |
| `seed` | 可选整数。 |
| `enable_prompt_expansion` | 默认 true。 |
| `num_images` | 默认 1。 |
| `enable_safety_checker` | 默认 true。 |
| `output_format` | `jpeg`、`png`、`webp`，默认 `png`。 |
| `sync_mode` | true 时以 data URI 返回且结果不保存在请求历史。 |
| `bounding_boxes` | 可选区域对象数组，字段因生成和编辑而不同，见各端点 Schema；数组最多 32 项。 |

文生图的区域使用 `label`、`description`、`box`，坐标是以左上角为原点的 0–1 小数；BFL 的坐标范围为 0–1000。成功结果的 `images[].url` 为图片地址，另有 `seed`、`timings` 等字段。
