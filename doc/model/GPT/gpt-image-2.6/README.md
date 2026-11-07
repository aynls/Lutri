# GPT Image 2.6

核对日期：2026-11-07。官方模型为 `gpt-image-2.6-flare` 和 `gpt-image-2.6-sunburst`；Flare 侧重快速迭代，Sunburst 侧重复杂构图与编辑细节。新增 `complexity`（low / medium / high），与渲染质量独立；fal 使用 `reasoning_effort`，Comfy Router 不开放该参数。

来源：[OpenAI 模型提示指南](https://developers.openai.com/api/docs/guides/image-prompting)、[图像生成指南](https://developers.openai.com/api/docs/guides/image-generation)。

## Lutri 接入范围

| 供应商 | 模型 | 输出 | 特殊能力 |
| --- | --- | --- | --- |
| [OpenRouter](gpt-image-2.6-OpenRouter.md) | Flare、Sunburst | PNG、JPEG、WebP | 参考图、复杂度、流式响应 |
| [Runware](gpt-image-2.6-Runware.md) | Flare、Sunburst | PNG、JPG、WebP、SVG | 参考图、蒙版、复杂度、SVG 转写模型及推理强度 |
| [fal](gpt-image-2.6-fal.md) | Flare、Sunburst | PNG、JPEG、WebP、SVG | 参考图、蒙版、复杂度、SVG 转写模型 |
| [Comfy Router](gpt-image-2.6-Comfy.md) | Flare、Sunburst | PNG、JPEG、WebP | 参考图、蒙版 |

保留 GPT Image 2.5 组合。OpenAI 直连接口见 [OpenAI](../gpt-image-OpenAI.md)。两款 2.6 均已接入 OpenAI、OpenRouter、fal、Runware、Comfy Router 五家供应商。

GIF 按产品决定不开放，模型格式校验也不接受 GIF。原生接口的 markup 标注引导编辑暂未接入；当前使用已有的参考图与蒙版绑定，不将区域描述冒充 markup。

## SVG

SVG 是静态矢量输出，适合图标、标志和插画。模型先渲染参考图，再由另一个模型生成 SVG；两阶段分别计费。图像质量与复杂度控制参考图，SVG 模型与推理强度控制转写阶段。

通过 Runware 和 fal 开放文字生成 SVG，单次生成一张，不携带参考图、蒙版或压缩质量。fal 只提供 SVG 转写模型，不提供独立的 SVG 推理强度。已有资产保存逻辑保留 SVG 原始文件，并生成 PNG 缩略图；这不等于提供内置矢量编辑器。

## 验证边界

已核对官方文档、读取 OpenRouter 公开端点能力、fal 四个端点的 OpenAPI Schema，以及 Comfy 两款模型的认证目录和实时 Schema。静态文档尚未列出 Comfy 2.6 时，以实时目录与 Schema 为依据。未添加或运行测试，未发起付费 API 请求，未验证实际出图或桌面交互。
