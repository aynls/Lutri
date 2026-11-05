# GPT Image 2.5 API（fal）

来源：[Flare 生成](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image/api)、[Flare 编辑](https://fal.ai/models/openai/gpt-image-2.5/flare/edit/api)、[Sunburst 生成](https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image/api)、[Sunburst 编辑](https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit/api)。

## 请求

以 `Authorization: Key FAL_KEY` 和 JSON 提交队列：

| 模型 | 生成路径 | 编辑路径 |
| --- | --- | --- |
| Flare | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` |
| Sunburst | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` |

路径前加 `https://queue.fal.run/`。提交后根据返回的队列状态和结果地址获取最终结果。

| 字段 | 说明 |
| --- | --- |
| `prompt` | 必填。 |
| `image_urls` | 编辑必填，最多 16 张参考图。 |
| `mask_url` | 编辑可选蒙版；白色为编辑区域，黑色为保留区域。 |
| `image_size` | 预设、`auto` 或 `{width,height}`；生成默认 `landscape_4_3`，编辑默认 `auto`。自定义尺寸两边为 16 的倍数，最长边不超过 3840，长宽比不超过 3:1，总像素 655360–8294400。 |
| `background` | `auto`、`transparent`、`opaque`；默认 `auto`。 |
| `quality` | `auto`、`low`、`medium`、`high`、`xhigh`、`max`；默认 `high`。 |
| `num_images` | 默认 1。 |
| `output_format` | `jpeg`、`png`、`webp`，默认 `png`。 |
| `output_compression` | 0–100，仅用于 JPEG 或 WebP。 |
| `sync_mode` | true 时返回 data URI，输出不保存在请求历史中。 |
| `enable_safety_checker` | 默认 true；授权调用方可请求放宽检查。 |

最终结果中 `images` 数组的每项含 `url`，也可能包含宽、高、媒体类型及文件名。
