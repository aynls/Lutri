# Ideogram 4.0 / 4.5 API

Ideogram 官方接口使用 v2。

## Ideogram 官方

使用 `Api-Key: IDEOGRAM_API_KEY`。4.0 文字生成端点为 `POST https://api.ideogram.ai/v2/image/generate/ideogram-4`，JSON 的 `prompt` 必填，长度 1–10,000 字符。`magic_prompt` 可为 `auto`、`on`、`off`，默认 `auto`；`seed` 为 0–2147483647；`num_images` 为 1–8，默认 1；`resolution` 可省略以自动选择比例；`rendering_speed` 为 `turbo`、`default`、`quality`，默认 `default`。完整尺寸列表见官方 Schema。

4.5 生成端点为 `/v2/image/generate/ideogram-4-5`；可上传 `images` 进行编辑。其 `quality` 为 `very_low`、`low`、`medium`、`high`，有输入图时默认 `medium`，无输入图时默认 `high`，`very_low` 需要输入图。

4.5 精确编辑使用 `POST /v2/image/precise-edit/ideogram-4-5`，multipart 包含 `prompt` 和 `image`。可选 `reference_images` 最多四张；如果提供 `mask`，最多三张参考图。蒙版与原图同尺寸，黑色为编辑区，白色为保留区，且必须同时包含黑白区域。默认整图编辑最多 4,194,304 像素；较大输入会缩小。`context_window` 可为 `auto`（需要蒙版）或 `y_min,x_min,y_max,x_max`，用于限制区域并保留大图尺寸，具体区域限制见官方文档。

默认同步返回 `data[].url`，链接会过期，应及时下载。设置 `async` 或 `webhook_url` 后返回 `generation_id`，使用 `GET /v2/generations/{generation_id}` 查询，直到完成或失败。`dry_run=true` 返回报价而不执行生成。

下面的 Bash 示例使用环境变量 `IDEOGRAM_API_KEY`：

```bash
curl https://api.ideogram.ai/v2/image/generate/ideogram-4 \
  -H "Api-Key: $IDEOGRAM_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A vintage travel poster of a coastal town","rendering_speed":"default","num_images":1}'
```

4.5 精确编辑的示例中，`photo.png` 和 `mask.png` 是需要替换的本地文件：

```bash
curl https://api.ideogram.ai/v2/image/precise-edit/ideogram-4-5 \
  -H "Api-Key: $IDEOGRAM_API_KEY" \
  -F 'image=@photo.png' -F 'mask=@mask.png' \
  -F 'prompt=Add a red scarf' -F 'context_window=auto'
```

## Runware

模型 ID 分别为 `ideogram:4@0` 和 `ideogram:4.5@0`，使用 `imageInference` 任务及唯一 UUID v4 `taskUUID`。输出类型可为 `URL`、`base64Data` 或 `dataURI`，对应响应的 `imageURL`、`imageBase64Data`、`imageDataURI`。

4.0 请求必须且只能选择 `positivePrompt` 或 `settings.structuredPrompt` 之一。结构化提示词需要 `high_level_description` 和 `compositional_deconstruction`，其中包含 `background` 和 `elements`；元素的 `bbox` 使用 0–1000 范围的 `[y_min,x_min,y_max,x_max]`。`settings.renderingSpeed` 为 `TURBO`、`DEFAULT`、`QUALITY`。`width`、`height` 需一起给出，并选择官方列出的尺寸对。

4.5 使用 `positivePrompt`，可用 `inputs.referenceImages` 提供 1–5 张图片：第一张是待编辑的原图，其余用于引导。`inputs.maskImage` 与原图同尺寸，白色为编辑区、黑色为保留区；这与 Ideogram 原生精确编辑接口的蒙版颜色方向相反。提供蒙版时参考图最多 4 张，且不能指定宽高。`settings.quality` 可选 `very_low`、`low`、`medium`、`high`；无参考图时不能用 `very_low`。有参考图时不能使用 `settings.magicPrompt`。

## Comfy Router

Router 使用 `X-API-Key: COMFY_API_KEY`，JSON 请求。下列两个端点均直接返回最终结果；`data[].url` 是 Ideogram 的临时链接，应及时下载。`data[].is_image_safe` 表示模型的安全判断。

### 4.0

```http
POST https://api.comfy.org/v2/models/ideogram/ideogram-v4
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `text_prompt` | string | 自然语言提示词，自动启用 Magic Prompt；与 `json_prompt` 二选一。 |
| `json_prompt` | object | 结构化提示词，关闭 Magic Prompt；与 `text_prompt` 二选一。 |
| `rendering_speed` | string | `DEFAULT`、`TURBO`、`QUALITY`，默认 `DEFAULT`。 |
| `resolution` | string | `宽x高`；省略时模型选择比例，允许的具体 2K 尺寸见 Schema。 |
| `enable_copyright_detection` | boolean | 是否启用生成后版权检测。 |

响应为 `created` 和 `data[]`，每项可包括 `url`、`prompt`、`resolution`、`seed`、`style_type`、`is_image_safe`；必须以实际存在的 `url` 判断是否获得图片。

### 4.5

```http
POST https://api.comfy.org/v2/models/ideogram/ideogram-4-5
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `prompt` | string | 必填，1–10000 字符。 |
| `images` | string[] | generate 模式的输入图，第一张为主图、其余为参考图；最多 5 张，有蒙版时最多 4 张。 |
| `image` | string | 选择 Precise Edit 模式的主图；不能与 `images` 同用。 |
| `reference_images` | string[] | Precise Edit 的参考图，须搭配 `image`；最多 4 张，有蒙版时最多 3 张。 |
| `mask` | string | 与主图同尺寸；黑色编辑、白色保留。提供时必须省略 `size`。 |
| `context_window` | string | 仅 Precise Edit；`none` 默认、`auto` 需蒙版，或 `y_min,x_min,y_max,x_max` 像素边界。自定义区域每边至少 256，宽高比 1:6–6:1，面积最多 4194304 像素；功能需账户启用，否则非 `none` 返回 422。 |
| `size` | string | 仅 generate；`auto`（默认）、`source`（需要 `images`）或 `宽x高`；不能与蒙版同时提供。 |
| `magic_prompt` | string | 仅 generate，`auto`、`on`、`off`，默认 `auto`。 |
| `quality` | string | 输入图时可为 `very_low`、`low`、`medium`、`high`，默认 `medium`；无图时不支持 `very_low`，默认 `high`。 |
| `seed` | integer | 0–2147483647。 |
| `num_images` | integer | 1–8，默认 1，按张计费。 |
| `enable_copyright_detection` | boolean | 是否启用版权检测。 |

不输入图片执行文生图；`images` 选择 generate 编辑，`image` 选择 Precise Edit。其他未列字段会被丢弃；Precise Edit 下 `size` 和 `magic_prompt` 也会被丢弃。响应包含 `generation_id`、`seed` 和 `data[]`，每个图片项包括 `url`、`prompt`、`resolution`、`seed`、`is_image_safe`。

图片、参考图和蒙版均可使用 `data:image/<格式>;base64,...` 或受限的 HTTPS URL；接受 PNG、WebP、JPEG。当前 URL 默认只允许 Comfy 资产存储的签名地址，普通公网 URL 或需要用户认证的 URL 会被拒绝；部分第三方对象存储需平台开关及账户权限。默认单图上限 25 MiB、每次请求图片总计 64 MiB；启用 `context_window` 的 Precise Edit 可达单图 50 MB、67108864 像素及每次合计 128 MiB。JSON 请求体总上限为 100 MiB。

```bash
curl 'https://api.comfy.org/v2/models/ideogram/ideogram-4-5' \
  -H "X-API-Key: $COMFY_API_KEY" -H 'Content-Type: application/json' \
  -d '{"prompt":"A vintage travel poster","quality":"high","num_images":1}'
```

## 参考来源

- [Ideogram：4.0 生成](https://developer.ideogram.ai/api-reference/images/generate/ideogram-4)、[4.5 生成](https://developer.ideogram.ai/api-reference/images/generate/ideogram-4-5)、[4.5 精确编辑](https://developer.ideogram.ai/api-reference/images/precise-edit/ideogram-4-5)
- [Ideogram API 概览与 v1 迁移](https://developer.ideogram.ai/ideogram-api/api-overview)
- [Runware：4.0](https://runware.ai/docs/models/ideogram-4-0)、[4.5](https://runware.ai/docs/models/ideogram-4-5)
- [Comfy：4.0 Schema](https://docs.comfy.org/router-schemas/ideogram/ideogram-v4.json)、[4.5 Schema](https://docs.comfy.org/router-schemas/ideogram/ideogram-4-5.json)
