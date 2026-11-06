# Lutri

桌面图像工作台，基于 Tauri、React、TypeScript 和 Rust。

开发环境需要 Node.js 24 或更高版本、npm 和 Rust。

```sh
npm ci
npm run dev       # 前端开发
npm run app:dev   # 桌面开发
npm run app:build # 当前平台的完整安装包
npm run typecheck
npm run format
npm run format:check
```

包含创作、提示词作家、超分辨率、批次历史、图库及本机 MCP 服务。界面跟随系统语言（中文、英文、日文），支持浅色、深色与系统主题。

在设置中保存供应商密钥后，在创作页选择模型及供应商。不同组合有各自的字段、约束和请求编译器。作家使用独立的 OpenAI-compatible 模型配置；端点填写到 `/v1` 等基础路径，不包含 `/chat/completions`。

本地超分随项目提供 NCNN Windows x64、Linux x64 运行库及 Real-ESRGAN / Real-CUGAN 模型，按目标平台选择运行库。GPU 推理需要支持 Vulkan 的显卡驱动。相关许可位于 `src-tauri/resources/upscale`。

`npm run app:build` 会构建前端、Rust 桌面程序和安装包：Windows 生成 NSIS setup，Linux 生成 deb 和 AppImage。产物位于 `src-tauri/target/release/bundle`，安装包只包含对应平台的超分运行库。构建在对应操作系统的 x64 环境执行，配置分别位于 `src-tauri/tauri.windows.conf.json` 和 `src-tauri/tauri.linux.conf.json`。

Linux 的构建依赖、桌面环境要求和运行限制见 [Linux 平台说明](doc/linux.md)。

MCP 在设置中启动，仅监听本机地址；复制配置后加入支持 Streamable HTTP 的客户端。可查询模型组合、提交批次、恢复原任务、搜索与读取图库图片，以及执行本地超分。

架构、覆盖范围和核对记录见 [实施说明](doc/implementation.md)。产品规则见 [PRD](doc/PRD.md)，模型资料见 [API 索引](doc/model/README.md)。

Windows x64 已生成过 NSIS 安装包，尚未验证安装后的运行。Linux 适配目前仅完成代码与配置修改，未进行 Linux 构建、安装或运行验证。
