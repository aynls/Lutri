# 图像模型 API 资料

## 创作方式

下列组合提供 `creationMode: generate | edit | auto`，它属于 Lutri 业务参数，不直接发送给供应商。新草稿及 MCP 新请求默认 `generate`；旧记录缺省为 `auto`，保留原请求分流且不额外注入模式指令。`edit` 必须提供 `editTargetId`，其值是 `references[].id`，不是 asset ID；界面默认选择第一张，MCP 显式指定。缺失原图时阻止提交，不以剩余图片替代。

| 组合 | 参考生成的请求方式 |
| --- | --- |
| GPT Image 2.5 / 2.6 Flare、Sunburst × OpenAI | Images API；有图仍走 edits，提示词表达参考创作 |
| Grok Imagine Image 2.0 × xAI；MAI Image 2.5 / 2.6 × Azure；Muse Image × Meta | 有图走 edits，提示词表达参考创作 |
| GPT Image 2.5 Flare / Sunburst、FLUX 3 Image / Klein、Nano Banana 2.1、Seedream 5 Pro / Flash / Lite、Qwen Image 3.0、Grok Imagine Image 2.0、MAI Image 2.5、Muse Image × fal | 有图走各自 edit 路径，提示词表达参考创作 |
| Nano Banana 2 / Pro × fal | 基础生成路径，参考图依次放入 context 的 image 部分；编辑与 auto 保留原 edit 路径 |
| Recraft V4.1 / Pro / Utility / Utility Pro × Recraft | generations 的 style_reference_urls；编辑走 imageToImage |

提示词控制不是原生操作保证。生成模式不标记编辑对象，也不接受蒙版；编辑模式绑定原图 ID，发送时将原图移至第一位，统一重新编译提示词与区域引用。其他图片维持相对顺序。预览和实际提交共用编译器，历史保存模式、原图 ID 和最终提示词。

Ideogram 4.5 × Ideogram / Comfy 继续使用独立的 `edit_mode: generate | precise`，显示为“常规编辑／精确编辑”；其中 generate 携带图片时仍然是编辑操作。

| 模型家族 | 文档 |
| --- | --- |
| FLUX.3 Image | [完整模型](FLUX/flux-3-image/)、[Klein](FLUX/flux-3-image-klein/) |
| GPT Image 2.5 / 2.6 | [OpenAI](GPT/gpt-image-OpenAI.md)、[2.5 各供应商](GPT/gpt-image-2.5/)、[2.6 各供应商](GPT/gpt-image-2.6/) |
| Qwen Image | [各供应商](Qwen/qwen-image/) |
| Nano Banana | [API 资料](Gemini/Nano-Banana-API.md) |
| Seedream 5.0 | [各供应商](Seedream/seedream-5/) |
| Seedream 5.5 | [Runware](Seedream/seedream-5.5/Runware.md)、[Comfy Router](Seedream/seedream-5.5/Comfy.md)、[fal](Seedream/seedream-5.5/fal.md)、[火山方舟](Seedream/seedream-5.5/Ark.md)、[BytePlus](Seedream/seedream-5.5/BytePlus.md) |
| MiniMax H3-Image / HighSpeed | [Runware、fal、OpenRouter、Comfy Router、MiniMax](MiniMax/H3-Image.md) |
| Grok Imagine Image 2.0 | [API 资料](Grok/Grok-Imagine-Image-2.0-API.md) |
| MAI Image | [API 资料](MAI/MAI-Image.md) |
| Muse Image | [API 资料](Muse/Muse-Image.md) |
| Recraft V4 | [API 资料](Recraft/Recraft-V4.md) |
| Ideogram 4 | [API 资料](Ideogram/Ideogram-4.md) |
