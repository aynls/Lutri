# Qwen Image 3 API（fal）

fal 对生成与编辑提供两个独立端点。

| 用途 | 模型路径 |
| --- | --- |
| 文生图 | `alibaba/qwen-image-3/text-to-image` |
| 编辑 | `alibaba/qwen-image-3/edit` |

使用 `FAL_KEY` 鉴权，通过 fal SDK 的 `fal.subscribe(模型路径, {input: 请求体})` 或队列接口调用。编辑的 `image_urls` 包含 1–3 张图片，顺序对应提示词的 image 1、image 2、image 3；每张 384–2048 像素/边、最大 10 MB，支持 JPEG、PNG（无 alpha）和 WebP。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `prompt` | string | 必填，最多 5000 字符。 |
| `negative_prompt` | string | 最多 500 字符，默认空字符串。 |
| `image_size` | string 或 object | 预设比例或 `{width,height}`；总像素 512×512 至 2048×2048。文生图默认 `square_hd`；编辑省略时自动确定尺寸。 |
| `image_urls` | string[] | 编辑必填，1–3 张。URL 可指向公开文件或 data URI。 |
| `enable_prompt_expansion` | boolean | 默认 `true`。 |
| `seed` | integer | 0–2147483647。 |
| `num_images` | integer | 默认 1。 |
| `output_format` | string | `jpeg`、`png`、`webp`，默认 `png`。 |
| `sync_mode` | boolean | 为 `true` 时返回 data URI，输出不保留在请求历史。 |
| `enable_safety_checker` | boolean | 默认 `true`，关闭需账号授权。 |

结果中 `images[]` 为图片文件对象，包含 `url`；另有生成时使用的 `seed`。例如：

```js
const result = await fal.subscribe("alibaba/qwen-image-3/edit", {
  input: { prompt: "Make image 1 a watercolor", image_urls: ["https://example.com/input.png"] }
});
```

来源：[文生图 API](https://fal.ai/models/alibaba/qwen-image-3/text-to-image/api)、[编辑 API](https://fal.ai/models/alibaba/qwen-image-3/edit/api)。
