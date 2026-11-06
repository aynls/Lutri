# 输入图片预处理

创作与 MCP 提交共用 `prepareGenerationInputs`。它在任务取得调度名额后准备发送副本，图库原图及 asset ID 不变。请求预览共用尺寸计算函数，图片内容仍用占位符表示。

## 用户设置与变换

`GenerationDraft.inputPreparation` 保存 `{version: 1, maxEdge?: number}`。省略 `maxEdge` 表示不附加用户长边限制；提供时必须为 256–8192 的整数。界面提供常用档位，历史保留原设置。

发送尺寸取用户长边上限、组合的单边上限和总像素上限中最严格的约束，只等比缩小，不裁切或放大。格式转换默认使用 PNG；明确不支持透明输入的组合会检查透明像素并拒绝透明图片，非透明图片转换为 JPEG。单图、蒙版及合计字节数在编码后检查，超限会阻止网络提交。

蒙版须与绑定图片的原始显示尺寸一致，并应用相同的目标宽高。缩放后才转换供应商要求的蒙版方向；不会把旧蒙版转绑到另一张图片。区域在域模型中使用归一化坐标，等比缩小不改变其绑定和坐标。

浏览器无法解码的格式会返回准备失败，不会绕过尺寸或蒙版检查。此路径没有验证实际供应商调用；PNG/JPEG/WebP 以外的图片仍取决于当前 WebView 的解码支持。

## 已声明的组合约束

约束位于各模型定义的 `inputPolicy`。未声明的限制不从输出尺寸、模型名称或其他供应商推断。

| 组合                         | 发送前检查与处理                                                                                          | 依据                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Qwen 3 · fal                 | 每边 384–2048；单图最多 10 MB；JPEG、PNG、WebP；不接受透明输入                                            | [fal 编辑 Schema](https://fal.ai/models/alibaba/qwen-image-3/edit/api)                                                  |
| Qwen · QwenCloud             | 单图最多 10 MB；按官方格式列表；384–3072 是建议，未硬编码为限制                                           | [Qwen 编辑指南](https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide)                                |
| Recraft Styles · Recraft     | 单图小于 20 MB，合计不超过 64 MB；PNG、JPEG、WebP                                                         | [Recraft Styles](https://www.recraft.ai/docs/api-reference/models/recraft-v4-styles)                                    |
| Recraft Styles · Runware     | 每边至少 256；单图不超过 10 MB，合计不超过 64 MB                                                          | [Runware 参考图指南](https://runware.ai/docs/models/recraft-v4-styles/guides/prompting)                                 |
| Recraft Styles · fal         | PNG、JPEG、WebP；未推断 Recraft 原生服务的字节限制                                                        | [现有组合文档](Recraft/Recraft-V4.md)                                                                                   |
| MAI · Azure                  | JPEG、PNG                                                                                                 | [Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image) |
| FLUX 3 · fal                 | 每边至少 256，超过 4 MP 等比缩小                                                                          | [fal 编辑 Schema](https://fal.ai/models/blackforestlabs/flux-3/edit-image/api)                                          |
| FLUX 3 · Comfy Router        | 每边至少 256，最多 16 MP，载荷按 20 MB 约束检查                                                           | [现有组合文档](FLUX/flux-3-image/flux-3-Image-Comfy.md)                                                                 |
| GPT Image 2.5 · Comfy Router | 单图最多 25 MiB、合计 64 MiB，蒙版小于 4 MiB；JPEG、PNG、WebP                                             | [现有组合文档及 Schema 来源](GPT/gpt-image-2.5/gpt-image-2.5-Comfy.md)                                                  |
| Seedream · Ark、BytePlus     | 单图最多 30 MB，每边至少 15，比例不超过 16，总像素不超过 3600 万；拆层要求至少 262144 像素并限制 PNG/JPEG | [Ark](Seedream/seedream-5/Seedream-5-Ark.md)、[BytePlus](Seedream/seedream-5/Seedream-5-BytePlus.md)                    |
| Ideogram · Comfy Router      | 普通单图最多 25 MiB、合计 64 MiB；精确编辑设置 context_window 时为 50 MB、128 MiB；PNG、WebP、JPEG        | [现有组合文档](Ideogram/Ideogram-4.md)                                                                                  |

2026-11-06 重新访问了 fal、Recraft、Runware、Qwen 和 Microsoft 的上述官方页面。Comfy Router Schema 链接本轮无法从网页工具取得，相关约束沿用项目已保存的组合文档。BytePlus 页面只返回了页面框架，Seedream 限制同样依据项目现有记录；未将这些情况记录成新的在线验证。

## 图片用途

当前组合没有可由用户逐图切换的原生角色字段。`purpose` 为 `style` 或 `subject` 的旧草稿／MCP 输入会在提交前被拒绝，不再接受后忽略；界面可将旧值恢复为普通参考输入。Recraft Styles 的图片作为整组风格参考发送，属于组合本身的固定语义，不借助逐图用途下拉框拼接提示词。

## 侧栏定义

每个模型组合用 `groups` 显式组织尺寸、生成控制、样式、输出文件和高级选项。通用控件只渲染组合声明的字段，未分组字段保留在高级区，避免字段被布局配置遗漏。固定枚举不提供多余的选择器。分组折叠状态按组合持久化；创作页在页面切换时保持挂载，保留编辑焦点和滚动位置。

Recraft 收藏样式保存在本地 `styles` 记录中，按准确的模型－供应商组合选择。可以收藏手动填写的 ID，以及响应的 `style_id` 或 Runware `outputs.styleId`；没有实现远端样式账户管理。
