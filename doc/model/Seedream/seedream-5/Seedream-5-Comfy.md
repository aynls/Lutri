# Seedream 5.0 API（Comfy Router）

Lutri 的图层拆分默认关闭，开启后要求一张源图及本地输出目录。每个结果在 `Lutri-<结果 ID>` 子目录交付 `composite.png` 和 `layers.psd`，图库展示合成图。PSD 保留像素图层、透明度、名称、层序与边界，预览与 PNG 使用相同合成像素；原始图块与恢复状态放在应用暂存区。两个文件均成功提交后才标记交付完成，失败可重试本地保存，不重新生图。历史和 MCP 区分合成图已保存与 PSD 已交付并返回路径。不处理旧任务兼容。

拆分时使用独立的图层分辨率（auto / 1K / 1.5K / 2K）映射到 `size`，不发送普通生成的自定义尺寸、背景或提示词优化参数。响应 `data` 必须包含一张 `z_index=0` 的底图及 1–16 个有有效边界框和唯一正层序的图层。

调用 `POST https://api.comfy.org/v2/models/{模型路径}`，使用 `X-API-Key: COMFY_API_KEY` 和 JSON。请求体中省略 `model`，Router 根据路径填充。

| 模型 | 路径 | 生成场景最大参考图 |
| --- | --- | --- |
| Pro | `byteplus/seedream-5-0-pro-260628` | 10 |
| Flash | `byteplus/seedream-5-0-flash-260915` | 10 |
| Lite | `byteplus/seedream-5-0-260128` | 14 |

## 请求体

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `prompt` | string | 生成图片时的文本。图层拆分时可省略。 |
| `image` | string 或 string[] | 可公开访问的 URL 或带媒体类型的 Base64 data URI；图层拆分时只接受一张。 |
| `size` | string | 分辨率档位或 `宽x高`；不同模型范围见下。 |
| `response_format` | string | `url`（默认）或 `b64_json`。 |
| `output_format` | string | `jpeg`（默认）或 `png`。图层始终为 PNG。 |
| `watermark` | boolean | 默认 `true`。 |
| `layer_decomposition` | boolean | Pro/Flash 支持；生成底图和最多 16 个图层，默认 `false`。 |
| `sequential_image_generation` | string | Lite 支持 `auto` 或 `disabled`。 |
| `sequential_image_generation_options.max_images` | integer | Lite 组图上限 1–15，默认 15，输入图数加输出图数不超过 15。 |
| `optimize_prompt_options.mode` | string | 提示词优化模式；支持情况因模型而异。 |

Schema 中 Pro 列出 `1K`、`2K`，自定义面积 1024×1024–2048×2048；Flash 列出 `1K`、`1.5K`、`2K`，自定义面积 921600–4624220；Lite 列出 `2K`、`3K`，自定义面积 2560×1440 至约 3072×3072。宽高比均为 1:16–16:1。Pro/Flash 图层拆分支持 `1K`、`1.5K`、`2K`、`auto`，默认 `auto`。Router 将 `stream` 固定为 `false`；Pro/Flash 不支持组图。整个 JSON 请求上限为 100 MiB，包含 Base64 编码后的数据。

```bash
curl 'https://api.comfy.org/v2/models/byteplus/seedream-5-0-pro-260628' \
  -H "X-API-Key: $COMFY_API_KEY" -H 'Content-Type: application/json' \
  -d '{"prompt":"A watercolor coastal town","size":"2K","watermark":false}'
```

## 响应

`data[]` 含 `url` 或 `b64_json` 和 `size`；图层结果包括 `z_index`、`name`、`description`、`bounding_box`。边界框 `absolute` 是 `[left, top, right, bottom]` 像素坐标，`normalized` 是 0–1000 的归一化坐标。队列式调用在模型路径后加 `/requests`，然后轮询状态并取回结果，参见 Router 文档。

来源：[Pro schema](https://docs.comfy.org/router-schemas/byteplus/seedream-5-0-pro-260628.json)、[Flash schema](https://docs.comfy.org/router-schemas/byteplus/seedream-5-0-flash-260915.json)、[Lite schema](https://docs.comfy.org/router-schemas/byteplus/seedream-5-0-260128.json)、[Router 快速开始](https://docs.comfy.org/development/comfy-router/quickstart)。
