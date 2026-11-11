# Seedream 5.0 API（火山方舟）

Lutri 的图层拆分默认关闭，开启后要求一张源图及本地输出目录。每个结果在 `Lutri-<结果 ID>` 子目录交付 `composite.png` 和 `layers.psd`，图库展示合成图。PSD 保留像素图层、透明度、名称、层序与边界，预览与 PNG 使用相同合成像素；原始图块与恢复状态放在应用暂存区。两个文件均成功提交后才标记交付完成，失败可重试本地保存，不重新生图。历史和 MCP 区分合成图已保存与 PSD 已交付并返回路径。不处理旧任务兼容。

拆分时使用独立的图层分辨率（auto / 1K / 1.5K / 2K）映射到 `size`，不发送普通生成的自定义尺寸、背景或提示词优化参数。

火山方舟的图片生成接口支持 Seedream 5.0 Pro、Flash 和 Lite，接受文本及有序参考图，返回图片或图层。

## 请求

```http
POST https://ark.cn-beijing.volces.com/api/v3/images/generations
Authorization: Bearer ARK_API_KEY
Content-Type: application/json
```

| 模型 | `model` |
| --- | --- |
| Pro | `doubao-seedream-5-0-pro-260628` |
| Flash | `doubao-seedream-5-0-flash-260915` |
| Lite | `doubao-seedream-5-0-260128`（亦支持 `doubao-seedream-5-0-lite-260128`） |

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 必填，模型 ID。 |
| `prompt` | string | 生成图片时必填；图层拆分时可省略以自动识别主要元素。 |
| `image` | string 或 string[] | 可访问 URL 或 `data:image/<格式>;base64,...`；Pro/Flash 生成场景最多 10 张，Lite 最多 14 张。图层拆分只能输入一张。 |
| `size` | string | Pro/Flash 图片生成支持 `1K`、`1.5K`、`2K`，默认 `2K`；也可用 `宽x高`，像素总数 921600–4624220，宽高比 1:16–16:1。Lite 限制不同，见官方文档。 |
| `layer_decomposition` | boolean | Pro/Flash 支持，默认 `false`。开启时将一张输入图拆为底图和最多 16 个透明 PNG 图层。 |
| `background` | string | Pro/Flash 支持 `opaque`、`transparent`。透明模式仅限一张带透明通道的输入图，输出必须为 PNG。 |
| `output_format` | string | `png` 或 `jpeg`，默认 `jpeg`；图层始终为 PNG。 |
| `response_format` | string | `url`（默认）或 `b64_json`；URL 在生成后 24 小时失效。 |
| `watermark` | boolean | 默认 `true`。 |
| `optimize_prompt_options.mode` | string | `standard`；Pro 另支持 `fast`。 |
| `sequential_image_generation` | string | 仅 Lite 支持，`disabled`（默认）或 `auto`；组图不保证固定数量。 |
| `sequential_image_generation_options.max_images` | integer | Lite 组图模式为 1–15，默认 15；参考图数加实际输出数不超过 15。 |
| `stream` | boolean | Lite 支持流式，默认 `false`；Pro/Flash 不支持。 |
| `tools` | object[] | Lite 可用 `[{"type":"web_search"}]`，模型决定是否实际搜索。 |

生成输入图支持 JPEG、PNG、WebP、BMP、TIFF、GIF、HEIC、HEIF；单张不超过 30 MB，宽高均大于 14，宽高比 1:16–16:1，总像素 196–3600 万。图层拆分的输入仅接受 PNG/JPEG，且至少 512×512 像素总量。

```bash
curl 'https://ark.cn-beijing.volces.com/api/v3/images/generations' \
  -H "Authorization: Bearer $ARK_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"doubao-seedream-5-0-pro-260628","prompt":"海边的水彩插画","size":"2K","response_format":"url","watermark":false}'
```

## 响应

非流式响应的 `data[]` 项包含 `url` 或 `b64_json`、`size` 等字段。组图可能在单个 `data[]` 项中包含 `error`，整个请求失败则返回顶层 `error`。拆分图层返回 `z_index`、`name`、`description`、`bounding_box`；底图索引为 0，较大的索引叠在上方。`bounding_box.absolute` 为底图坐标系中的 `[left, top, right, bottom]`。`usage.generated_images` 是成功生成数量。

## 来源

- [火山方舟图片生成 API](https://console.volcengine.com/ark/region:cn-beijing/docs/image-generation-api)
- [火山方舟模型列表](https://console.volcengine.com/ark/region:cn-beijing/docs/model-list)
