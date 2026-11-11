# Seedream 5.0 API（BytePlus ModelArk）

Lutri 的图层拆分默认关闭，开启后要求一张源图及本地输出目录。每个结果在 `Lutri-<结果 ID>` 子目录交付 `composite.png` 和 `layers.psd`，图库展示合成图。PSD 保留像素图层、透明度、名称、层序与边界，预览与 PNG 使用相同合成像素；原始图块与恢复状态放在应用暂存区。两个文件均成功提交后才标记交付完成，失败可重试本地保存，不重新生图。历史和 MCP 区分合成图已保存与 PSD 已交付并返回路径。不处理旧任务兼容。

拆分时使用独立的图层分辨率（auto / 1K / 1.5K / 2K）映射到 `size`，不发送普通生成的自定义尺寸、背景或提示词优化参数。

BytePlus ModelArk 提供 Seedream 5.0 Pro、Flash 和 Lite。

```http
POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations
Authorization: Bearer BYTEPLUS_API_KEY
Content-Type: application/json
```

| 版本 | `model` |
| --- | --- |
| Pro | `dola-seedream-5-0-pro-260628` |
| Flash | `dola-seedream-5-0-flash-260915` |
| Lite | `seedream-5-0-260128`，亦支持 `seedream-5-0-lite-260128` |

## 请求参数

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 必填，模型 ID。 |
| `prompt` | string | 生图时的文本提示词；图层拆分时可省略，由模型自动识别主体。 |
| `image` | string 或 string[] | 公开 URL 或 `data:image/<格式>;base64,...`。Pro/Flash 最多 10 张；Lite 最多 14 张。 |
| `size` | string | 档位或 `宽x高`；取值范围见下。 |
| `layer_decomposition` | boolean | 仅 Pro/Flash，默认 `false`；输入一张图片，拆成一张底图和最多 16 张透明 PNG 图层。 |
| `output_format` | string | `png` 或 `jpeg`；图层拆分时仅控制底图格式。 |
| `response_format` | string | `url` 或 `b64_json`；URL 有效 24 小时。 |
| `watermark` | boolean | 默认 `true`；是否在右下角加水印。 |
| `optimize_prompt_options.mode` | string | Pro 支持 `standard`、`fast`；Flash 为标准模式。 |
| `sequential_image_generation` | string | 仅 Lite 支持 `auto` 组图或 `disabled` 单图。 |
| `sequential_image_generation_options.max_images` | integer | Lite 组图上限 1–15，默认 15；输入参考图数加实际输出图数不超过 15。 |
| `stream` | boolean | Lite 支持，默认 `false`。Pro/Flash 不支持流式或组图。 |

Pro/Flash 的生图 `size` 支持 `1K`、`1.5K`、`2K`，默认 `2K`；自定义尺寸面积为 921600–4624220 像素，宽高比 1:16–16:1。拆层仅支持 `1K`、`1.5K`、`2K`、`auto`，默认 `auto`。Lite 的生图支持 `2K`、`3K`、`4K`；自定义面积 3686400–16777216 像素，宽高比 1:16–16:1，默认尺寸 `2048x2048`。

普通生成参考图支持 JPEG、PNG、WebP、BMP、TIFF、GIF、HEIC、HEIF，单图不超过 30 MB、宽高均大于 14、像素总数 196–3600 万，宽高比 1:16–16:1。拆层仅允许一张 PNG 或 JPEG，最大 30 MB，总像素 262144–3600 万；任一图层失败时整个请求失败。

```bash
curl 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations' \
  -H "Authorization: Bearer $BYTEPLUS_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"dola-seedream-5-0-pro-260628","prompt":"A watercolor coastal town","size":"2K","response_format":"url","watermark":false}'
```

## 响应

非流式 `data[]` 包含 `url` 或 `b64_json` 和 `size`；组图的某个结果可以有 `error`，整次失败返回顶层 `error`。拆层时底图 `z_index` 为 0，其他图层从 1 开始递增。每层可含 `bounding_box.absolute`、`bounding_box.normalized`、`name` 和 `description`；使用边界框与顺序还原图层。`usage.generated_images` 表示成功生成数。

## 来源

- [BytePlus 图片生成 API](https://docs.byteplus.com/en/docs/modelark/image-generation-api)
- [Seedream 5.0 Pro / Flash 教程](https://docs.byteplus.com/en/docs/ModelArk/seedream-5-0-pro)
- [BytePlus 模型列表](https://docs.byteplus.com/en/docs/modelark/model-list)


## 交互编辑与布局（2026-11-05 核对）

Seedream 5.0 Pro / Flash 的交互编辑使用提示词中的 `<bbox>x0 y0 x1 y1</bbox>`，不新增请求体字段。坐标针对每一张参考图归一化到 **0–999**，顺序是左、上、右、下。跨图编辑通过 `Image 1`、`Image 2` 等显式绑定图片。前端内部仍保留稳定参考 ID 和统一的 0–1000 矩形；仅在 Seedream 请求编译时转换顺序并将边界裁至 999。供应商未给出区域数量上限，Lutri 统一按 32 个限制。该能力没有为 Lite 开启。

来源：[BytePlus 官方交互编辑指南](https://docs.byteplus.com/en/docs/modelark/seedream-5-0-pro-editing-guide)、[Seedream 5.0 Pro / Flash 能力说明](https://docs.byteplus.com/en/docs/modelark/seedream-5-0-pro)。此机制经由已有 prompt 字段传输，所有 Pro / Flash 的供应商组合共用该编译器；供应商实际效果尚未逐一调用验证。
