# FLUX 3 Image Klein API（Runware）

来源：[Runware 模型 API](https://runware.ai/docs/models/bfl-flux-3-image-klein)。请求和认证格式见 [FLUX 3 Image Runware](../flux-3-image/flux-3-Image-Runware.md)，模型 ID 为 `bfl:flux@3-image-klein`。

| 字段 | 说明 |
| --- | --- |
| `positivePrompt` | 必填，1–10000 字符。 |
| `inputs.referenceImages` | 最多 4 张，接受 UUID、URL、data URI 或 Base64。 |
| `width`、`height` | 需配对，每边 128–4096，步长 16；提供参考图时可按 Schema 的依赖规则省略。 |
| `seed` | 可选整数，未指定则随机。 |
| `steps` | 1–50，默认 16。 |
| `settings.boundingBoxes` | 区域数组，坐标为 `[top,left,bottom,right]`、0–1000；没有参考图时必填。 |

结果从 `data` 数组读取。
