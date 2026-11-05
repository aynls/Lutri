# Lutri

桌面图像工作台，基于 Tauri、React、TypeScript 和 Rust。

开发环境需要 Node.js 24 或更高版本、npm 和 Rust。

```sh
npm ci
npm run dev       # 前端开发
npm run app:dev   # 桌面开发
npm run typecheck
npm run format
npm run format:check
```

包含创作、提示词作家、超分辨率、批次历史、图库及本机 MCP 服务。界面跟随系统语言（中文、英文、日文），支持浅色、深色与系统主题。

在设置中保存供应商密钥后，在创作页选择模型及供应商。不同组合有各自的字段、约束和请求编译器。作家使用独立的 OpenAI-compatible 模型配置；端点填写到 `/v1` 等基础路径，不包含 `/chat/completions`。

本地超分随项目提供 NCNN Windows x64 运行库及 Real-ESRGAN / Real-CUGAN 模型，运行时需要支持 Vulkan 的显卡驱动。相关许可位于 `src-tauri/resources/upscale`。

MCP 在设置中启动，仅监听本机地址；复制配置后加入支持 Streamable HTTP 的客户端。可查询模型组合、提交批次、恢复原任务、搜索与读取图库图片，以及执行本地超分。

架构、覆盖范围和核对记录见 [实施说明](doc/implementation.md)。产品规则见 [PRD](doc/PRD.md)，模型资料见 [API 索引](doc/model/README.md)。

当前只进行了类型检查、前端构建与 Rust 编译检查，没有运行测试、付费 API 或 GPU 推理。按用户最新要求，不交付安装包。
