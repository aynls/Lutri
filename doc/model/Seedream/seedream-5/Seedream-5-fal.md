# Seedream 5.0 API（fal）

fal 将文生图和编辑拆为不同的模型路径；`num_images` 表示独立运行次数，不能等同于 Lite 的组图数量。使用 `FAL_KEY` 鉴权，通过 fal SDK 的 `fal.subscribe` 或队列接口提交、查询并获取结果。

| 模型 | 文生图 | 编辑 |
| --- | --- | --- |
| Pro | `bytedance/seedream/v5/pro/text-to-image` | `bytedance/seedream/v5/pro/edit` |
| Flash | `bytedance/seedream/v5/flash/text-to-image` | `bytedance/seedream/v5/flash/edit` |
| Lite | `bytedance/seedream/v5/lite/text-to-image` | `bytedance/seedream/v5/lite/edit` |

## 文生图参数

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `prompt` | string | 必填。 |
| `image_size` | string 或 object | Pro/Flash 默认 `auto_2K`，可用 `auto_1K`、`auto_1.5K`、`auto_2K`、比例预设或 `{width,height}`；自定义尺寸总像素 921600–4624220，宽高比 1:16–16:1。Lite 使用不同范围，见下文。 |
| `num_images` | integer | 独立生成次数，默认 1。 |
| `output_format` | string | `jpeg` 或 `png`，默认 `jpeg`。 |
| `watermark` | boolean | 控制供应商水印。 |
| `sync_mode` | boolean | 返回 data URI 时结果不保留在请求历史。 |
| `enable_safety_checker` | boolean | 默认 `true`；禁用需账号授权。 |
| `enhance_prompt_mode` | string | Pro 支持 `standard`（默认）或 `fast`。 |

Lite 的 `image_size` 默认 `auto_2K`，另支持 `auto_3K`、`auto_4K`；自定义总像素为 2560×1440 至 4096×4096，宽高比 1:16–16:1。Lite 还支持 `sequential_image_generation`（`auto`/`disabled`）与 `max_images`；参考图与每次生成的输出图数量合计不超过 15。编辑参数见文末对应的编辑 API 文档。

```js
const result = await fal.subscribe("bytedance/seedream/v5/pro/text-to-image", {
  input: { prompt: "A watercolor coastal town", image_size: "auto_2K", num_images: 1 }
});
```

结果包含 `images[]`，每个图片对象包含 `url`，可附带尺寸和媒体类型。

来源：[Pro 文生图](https://fal.ai/models/bytedance/seedream/v5/pro/text-to-image/api)、[Pro 编辑](https://fal.ai/models/bytedance/seedream/v5/pro/edit/api)、[Flash 文生图](https://fal.ai/models/bytedance/seedream/v5/flash/text-to-image/api)、[Flash 编辑](https://fal.ai/models/bytedance/seedream/v5/flash/edit/api)、[Lite 文生图](https://fal.ai/models/bytedance/seedream/v5/lite/text-to-image/api)、[Lite 编辑](https://fal.ai/models/bytedance/seedream/v5/lite/edit/api)。
