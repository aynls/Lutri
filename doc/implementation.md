# Lutri 重写实施记录

## 交付范围

以 PRD 为准，旧项目仅作为功能核对和素材来源。包括创作、提示词作家、原生超分、批次历史、图库、MCP、三语和明暗主题。用户后续取消安装包构建，本轮交付源码项目。

## 架构边界

- `domain`：草稿、引用、区域、批次、任务、结果和资产类型。引用通过稳定 ID 绑定，提交时才转换为供应商下标。
- `models/<family>`：每个模型与供应商组合拥有字段定义、组件排列、默认值、约束和请求编译器。共享输入组件不包含供应商判断。
- `providers`：HTTP 协议、响应解析和恢复查询；不决定表单布局。编译请求只存在于执行期间，不保存带图片内容的请求体。
- `services`：手动与 MCP 共用提交入口。先保存业务快照，再提交；远端标识和结果地址尽早持久化。查询失败和下载失败均不得触发重新生成。
- `gallery`：资产内容与入库记录分离；收藏、图板只引用 asset ID。清理不保护草稿或运行任务。
- `src-tauri`：文件、SQLite、凭据、网络传输、窗口、MCP 传输和原生推理。不复制 TypeScript 的模型业务规则。

## 已确认的旧实现差异

旧 `singleImageDraft` 将单次数量固定为 1；新实现区分请求次数和每请求数量。旧生成历史保存输入副本；新历史只保存资产引用。旧超分队列返回 HistoryItem；新超分任务不进入生成历史。旧 UI 包含创建/编辑路由和工作台概念；新界面按实际输入选择端点。

## 执行顺序

1. 核对全部本地模型文档及官方来源，登记组合与特殊约束。
2. 建立领域类型、原生存储、资产服务、凭据与网络桥。
3. 实现组合定义、独立适配器与可恢复任务服务。
4. 完成专业创作界面、图库、批次历史和图片独立窗口。
5. 完成流式作家、规范管理、超分模型与 MCP。
6. 编译与静态检查；按用户要求不执行安装包构建。项目禁止添加或运行测试；不以编译通过宣称付费 API 或 GPU 推理已验证。

## 实现范围

注册表声明 10 个模型家族、27 个模型变体、103 个模型与供应商组合。组合声明代表已实现表单和请求编译路径，不代表每条路径已经通过真实服务调用验证。

| 家族 | 组合数 | 供应商范围 |
| --- | ---: | --- |
| FLUX 3 Image / Klein | 9 | BFL、fal、OpenRouter、Comfy、Runware |
| GPT Image 2.5 | 8 | OpenRouter、fal、Runware、Comfy |
| Qwen Image | 13 | QwenCloud、OpenRouter、fal、Runware、Comfy |
| Seedream 5 | 18 | Ark、BytePlus、Comfy、fal、OpenRouter、Runware |
| Nano Banana | 18 | Google、OpenRouter、Runware、Comfy、fal |
| Grok Imagine Image | 5 | xAI、OpenRouter、Runware、Comfy、fal |
| MAI Image | 5 | Microsoft Foundry、OpenRouter、fal |
| Muse Image | 3 | Meta、fal、Runware |
| Recraft | 18 | Recraft、Runware、fal |
| Ideogram | 6 | Ideogram、Runware、Comfy |

创作使用稳定引用 ID，提交时转换成对应供应商的图片顺序。提示词胶囊、区域框选与数值编辑、蒙版绘制及颜色转换分别实现；模型切换保留引用，并在当前会话中记住各组合的参数；不适用或超限的输入在提交前校验。参数、任务及资产存放于应用数据目录的 SQLite 与文件目录，凭据存放于操作系统凭据库。

任务先持久化再提交；支持 BFL、fal、Runware、Google 和 Ideogram 的原任务查询。同步服务未提供可恢复任务标识时，明确报错，不重新发起付费请求。Runware 查询保留逐张完成及失败结果，并在剩余结果仍 processing 时继续查询。结果下载使用稳定 ID，重启重复取回不会重复创建资产。瀑布流变更串行提交，移除卡片不影响任务；200 是卡片上限，不是请求次数上限。

图库提供外部文件和剪贴板导入、资产搜索、收藏、图板、批量导出与删除、相关历史入口，以及进入创作或超分的快捷操作。图片独立窗口显示资产及生成参数。自动清理默认关闭，收藏和图板资产不计入容量。

提示词作家支持独立配置、可重复队列、内容与推理流、重写、接受结果，以及有序 Markdown 规范。超分采用独立原生工作进程，支持单图对比、批处理进度、输出目录与图库保存，不进入生图历史。MCP 与 UI 共用业务服务；主程序采用单实例，图片子窗口不恢复后台任务。

## 官方资料核对补充

- [Google Interactions 图像生成](https://aistudio.google.com/docs/image-generation)：遍历 `steps[].content` 的图片块，避免只取最后一张图片。
- [Comfy Gemini Schema](https://docs.comfy.org/router-schemas/vertexai/gemini-nano-banana-2.1.json)：输出格式写入 `generationConfig.imageConfig.imageOutputOptions.mimeType`；思考强度使用 `thinkingConfig.thinkingLevel`。
- [OpenRouter 图片流](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)：区分部分预览与 completed；只把最终图片作为结果。
- [BytePlus 图片流](https://docs.byteplus.com/en/docs/modelark/image-generation-streaming-responses)：保存 partial_succeeded 和 partial_failed，按 image_index 排序，不将统计用 completed 事件当成额外图片。
- [Runware 任务查询](https://runware.ai/docs/models-api/task-polling)：同时处理 data 中 success / processing 和 errors 中失败结果。
- [Ideogram 查询](https://developer.ideogram.ai/api-reference/generations/get-generation)：依据 completed / failed 结束查询。

## 验证边界

已执行 TypeScript 类型检查、Vite 生产构建及 `cargo check`。没有添加或运行测试，没有调用收费生图接口，没有执行 GPU 推理，也没有完成桌面交互验收。因此不能把编译通过等同于全部供应商组合、所有参数边界或各类显卡上的行为已经验证。

安装包构建曾进入原生编译阶段，随后按用户要求停止。本轮不将 setup 作为交付物。


## 2026-11-05 交互迭代

- 恢复 legacy 的模型家族图标和品牌素材，采用本地 Inter / Noto Sans 中日文字体。基础字号调整为 14px，表单、导航和说明文字同步增大，保留明暗主题。
- 区域编辑改用独立大画布，支持右键连续绘框、左键选中移动、八向缩放、空格/中键平移、滚轮定点缩放、方向键微调、撤销重做和像素数值编辑。源区域在原参考图中单独编辑；取消对话框不改动草稿。
- 缩放手柄保持屏幕尺寸，命中容差为 8px。悬停或拖动时由 9px 放大至 12px，并显示区域色和光晕；反馈过渡为 100ms，系统减少动态效果时禁用过渡。矩形几何位置不做缓动，拖动期间锁定滚轮缩放，防止坐标跳变。
- 蒙版支持画笔、橡皮、矩形、缩放平移、撤销重做、导入、清空与反转；最终保存统一的黑白蒙版，由供应商适配器转换协议。
- 图库增加多选、范围选择、日期/方向筛选、缩略图大小、图板管理和单次选目录批量导出。查看器支持缩放平移与参数详情；历史增加筛选、批次分组、完整请求详情与恢复入口。
- 超分按逻辑模型展示。Real-CUGAN Pro 的六份权重合为一个模型，分别选择 2×/3× 和关闭/保守/强降噪。界面和 MCP 共用目录与配置解析，按实际安装的权重限制选项。Real-ESRGAN General、x4plus、x4plus Anime 保持三个独立模型。
- 超分单图和批处理分别保留工作内容，支持暂停队列、逐图状态、重做及结果入库；对比预览共用缩放平移组件。

桌面预览已查看字体、模型图标和布局编辑器结构；用户按 Escape 停止了电脑操作，因此后续的连续绘框和手柄动画没有完成实际操作验收。超分队列尚不跨重启恢复，未新增自定义超分权重导入；本轮没有执行真实供应商请求或 GPU 推理。
