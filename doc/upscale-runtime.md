# 本地超分运行控制

超分使用全应用共享的本地队列；UI 与 MCP 调用都经 `upscale_run`。最大同时运行数为 1–16，默认 1，设置独立于 NCNN 线程数。降低上限不终止在途任务；FIFO 排队任务在名额可用后执行。

每项任务使用 UUID、独立子进程和独立暂存路径。排队取消不启动推理，运行取消只终止该项子进程；发布结果前进入不可取消的保存阶段，避免取消与完成各发布一次终态。进程失败与取消均释放名额。退出应用会终止尚未完成的本地工作进程，不自动重新提交任务。

GPU 名称与索引直接来自随应用分发的 NCNN runtime，不能用系统显卡或另一个 Vulkan 枚举结果猜测其索引。设备探测使用隔离进程，15 秒无响应会终止，完成后跳过易阻塞的 Vulkan 全局析构。当前二进制的设备信息读取使用其导出的 NCNN C++ ABI，完整符号集不匹配时明确失败；推理使用 NCNN C API。明确选择的设备必须仍在可用列表中，否则停止该项任务，不静默使用其他设备。

目录导出失败保留完成的推理输出，并支持单独导出重试。工作区任务状态在页面切换后保留在应用进程中；不声明应用完全退出后能自动恢复本地推理进度。

依据：[NCNN GPU 接口](https://github.com/Tencent/ncnn/blob/master/src/gpu.h)、[NCNN C API](https://github.com/Tencent/ncnn/blob/master/src/c_api.h)。桌面常驻和开机启动使用 [Tauri tray](https://v2.tauri.app/learn/system-tray/) 与 [autostart](https://v2.tauri.app/plugin/autostart/) 能力，后台常驻、开机启动和 MCP 随应用启动默认关闭。
