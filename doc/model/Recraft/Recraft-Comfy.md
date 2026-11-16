# Recraft API（Comfy Router）

向 `https://api.comfy.org/v2/models/recraft/{端点}` 发送 JSON，请求头使用 `Authorization: Bearer COMFY_API_KEY`。请求体的 `model` 与端点同名。

| Lutri 模型 | 端点和 `model` | `style_id` |
| --- | --- | --- |
| Recraft V4.1 | [`recraftv4_1`](https://docs.comfy.org/router-schemas/recraft/recraftv4_1.json) | 可选 |
| Recraft V4.1 Pro | [`recraftv4_1_pro`](https://docs.comfy.org/router-schemas/recraft/recraftv4_1_pro.json) | 可选 |
| Recraft V4.1 Utility | [`recraftv4_1_utility`](https://docs.comfy.org/router-schemas/recraft/recraftv4_1_utility.json) | 可选 |
| Recraft V4.1 Utility Pro | [`recraftv4_1_utility_pro`](https://docs.comfy.org/router-schemas/recraft/recraftv4_1_utility_pro.json) | 可选 |
| Recraft V4.1 Vector | [`recraftv4_1_vector`](https://docs.comfy.org/router-schemas/recraft/recraftv4_1_vector.json) | 可选 |
| Recraft V4.1 Pro Vector | [`recraftv4_1_pro_vector`](https://docs.comfy.org/router-schemas/recraft/recraftv4_1_pro_vector.json) | 可选 |
| Recraft V4 Styles | [`recraftv4_styles`](https://docs.comfy.org/router-schemas/recraft/recraftv4_styles.json) | 必填 |
| Recraft V4 Styles Pro | [`recraftv4_styles_pro`](https://docs.comfy.org/router-schemas/recraft/recraftv4_styles_pro.json) | 必填 |
| Recraft V4 Styles Vector | [`recraftv4_styles_vector`](https://docs.comfy.org/router-schemas/recraft/recraftv4_styles_vector.json) | 必填 |
| Recraft V4 Styles Pro Vector | [`recraftv4_styles_pro_vector`](https://docs.comfy.org/router-schemas/recraft/recraftv4_styles_pro_vector.json) | 必填 |

十条生成路由均以提示词为输入。V4 Styles 系列需要填写与所选模型匹配的已有风格 ID（UUID）。Comfy Router Schema 列出单独的 `POST /proxy/recraft/styles` 风格创建端点，Lutri 的这些组合使用现成的 ID。

| 参数 | 取值 |
| --- | --- |
| `prompt` | 必填，最多 10,000 字符。 |
| `model` | 见上表。 |
| `size` | 可省略，由提示词决定。也可传 Recraft 支持的比例或 `WxH`，Pro 模型使用对应的 2K 尺寸。 |
| `n` | 1–6，默认 1。 |
| `style_id` | 与模型匹配的风格 ID。 |
| `controls.colors` | 最多 10 个颜色对象，形如 `[{"rgb":[30,60,90]}]`。 |
| `controls.background_color` | 单个颜色对象，形如 `{"rgb":[245,240,232]}`，各分量为 0–255 的整数。 |
| `response_format` | `url`（默认）或 `b64_json`。 |

```json
{
  "model": "recraftv4_1_vector",
  "prompt": "A blue ceramic vase as a simple vector illustration",
  "size": "4:5",
  "n": 1,
  "controls": { "colors": [{ "rgb": [30, 60, 90] }] }
}
```

请求同步返回 `data[]`。每项带 `image_id` 和 `url` 或 `b64_json`，对应生成结果。Vector 模型生成原生 SVG，Lutri 入库时识别实际图片格式。

[Comfy Router 参考](https://docs.comfy.org/development/comfy-router/reference) · [Recraft 尺寸](https://www.recraft.ai/docs/api-reference/appendix#image-sizes) · [Recraft 风格](https://www.recraft.ai/docs/api-reference/styles)
