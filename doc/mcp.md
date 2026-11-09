# MCP

Lutri 的本机 MCP 服务提供创作、图库资产检索和任务结果访问。Agent 提交独立的创作请求，任务与手动创作共用历史；用户正在编辑的常规草稿与批处理清单保持独立。

创作包含普通生成、参考图编辑、区域、蒙版及模型支持的原生云端批处理。Writer 和超分辨率不提供 MCP 工具。结果的保存与清理沿用应用现有机制。

## 连接

在设置中启动 MCP，复制连接配置到支持 Streamable HTTP 的客户端。默认地址是 `http://127.0.0.1:39632/mcp`，请求使用 `Authorization: Bearer TOKEN`；`TOKEN` 来自设置页。服务只监听本机 IPv4 地址。

服务使用无会话的 JSON 响应，支持协议版本 `2025-06-18` 和 `2025-11-25`。每个 POST 请求须接受 `application/json` 与 `text/event-stream`；初始化后使用协商的 `MCP-Protocol-Version` 请求头。GET 返回 405。停用 MCP 不取消已持久化的创作任务。

本次重写更改了工具及参数，旧客户端需要重新获取工具列表并调整调用。没有保留旧工具别名或旧参数适配。

## 工具

| 工具                | 用途                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `list_models`       | 分页列出模型与供应商组合，支持 `query`、`provider`、`mode`、`configuredOnly` 筛选。                          |
| `get_model`         | 返回单个组合的参数 schema、默认值、输入限制、提示词限制及文档；可提供 `input` 计算当前有效字段。             |
| `validate_creation` | 检查创作参数、素材是否存在、供应商密钥是否已配置及输出目录，不向供应商提交请求。                             |
| `generate`          | 提交普通创作，返回批次与任务 ID，不等待生图完成。                                                            |
| `submit_batch`      | 提交供应商原生云端批处理，支持多个创作条目；本地准备完成后返回 ID，上传、提交和获取结果在后台执行。          |
| `list_tasks`        | 分页查询任务，可按来源、创作模式、状态、是否已有结果、批次 ID 和调用标识筛选。                               |
| `get_task`          | 查询一个任务的状态、单次请求参数及结果资产。                                                                 |
| `get_batch`         | 查询一批创作的任务 ID、状态计数和云端分组状态。                                                              |
| `resume_task`       | 继续获取原任务结果或下载；云端任务恢复所属批次。不会重新提交生成请求。                                       |
| `cancel_batch`      | 普通创作仅取消尚未提交的请求；云端批处理向供应商请求取消。                                                   |
| `find_assets`       | 查询完整图库，支持精确 `assetId` 或 `query` 中的 ID 片段，以及来源筛选。                                     |
| `get_image`         | 按 asset ID 读取图库图片或未入库结果；默认返回 PNG 预览，`variant: "original"` 读取原图。原始 SVG 返回文本。 |
| `import_image`      | 将本地图片或 Base64 图片持久导入参考素材库，返回 asset ID。                                                  |

分页参数为 `limit`（1–100）和 `offset`（从 0 开始）。模型列表默认每页 25 项，任务和资产默认每页 20 项。响应中的 `nextOffset` 为下一页偏移，`null` 表示没有下一页。

## 创作流程

1. 调用 `list_models` 选择组合，再调用 `get_model` 获取该组合的参数。`mode` 为 `regular` 或 `batch`。凭据存在只表示已保存密钥，不保证供应商接受请求。
2. 通过 `find_assets` 查找图库图片，或通过 `import_image` 导入素材。按需调用 `get_image` 查看内容。
3. 构造 `creation`，调用 `validate_creation`。`valid` 同时考虑模型校验、素材可读性和密钥配置；不会验证供应商余额或实际授权。
4. 使用新的 `requestId` 调用 `generate`，或把多个创作条目放入 `submit_batch.items`。
5. 保存返回的 `batchId` 和 `taskIds`，通过 `get_task`、`get_batch` 或 `list_tasks` 获取状态。任务仍在进行时，`get_task` 会返回建议的 `pollAfterMs`。

以下示例是工具的 arguments，须替换 `REQUEST_ID` 和 `COMBINATION_ID`。模型组合 ID 来自 `list_models`；每次有意发起的新创作使用新的调用标识。

```json
{
  "requestId": "REQUEST_ID",
  "creation": {
    "combinationId": "COMBINATION_ID",
    "prompt": "A quiet lakeside pavilion at dusk",
    "requestCount": 1,
    "parameters": {}
  },
  "autoSave": false
}
```

`requestCount` 表示独立供应商请求的次数；`n`、`num_images` 等模型参数表示每次请求生成的图片数，两者不自动转换。普通创作的次数上限来自应用设置；MCP 云端批处理总计不超过 50,000 次请求。

`parameters` 中提供的字段覆盖模型默认值。JSON 参数、字段之间的依赖及图片输入约束仍由相应模型组合校验。`get_model.input` 使用与 `creation` 相同的字段，但不包含 `combinationId`；返回的 `fields[].active` 描述该输入下的可用字段。`includeDocumentation: false` 可省略模型文档内容。

### 参考图、区域与蒙版

每个参考图包含 `id` 与 `assetId`。`assetId` 是持久图片身份；`id` 是本次请求中唯一的参考身份，只允许字母、数字、下划线和连字符。同一资产可以通过不同参考身份多次出现。`name` 为可选别名。逐图 `purpose` 不对外暴露。

提示词通过 `[[ref:REFERENCE_ID]]` 引用图片。编辑模式使用 `creationMode: "edit"` 并指定 `editTargetId`，该值是参考身份。支持创作模式的组合默认采用 `generate`；不支持该能力的组合应省略模式字段。

区域包含 `id`、`description`，以及可选的 `operation`、`referenceId`、`source`、`target`。`operation` 为 `place`、`move`、`anchor` 或 `remove`。矩形格式为 `[top, left, bottom, right]`，坐标归一化为 0–1000，必须满足上小于下、左小于右。来源区域必须绑定参考身份；每个区域必须具有目标区域，或同时具有来源区域与参考身份。

蒙版使用 `{ "assetId": "MASK_ASSET_ID", "referenceId": "REFERENCE_ID" }`。具体蒙版语义、区域支持方式和数量限制来自 `get_model`。服务会检查编辑原图、区域和蒙版的引用关系。`inputPreparation.maxEdge` 只缩放请求副本，不改写资产原图。

### 输出

`autoSave` 和 `destination` 位于提交工具的顶层，控制额外另存副本。所有结果始终保存为本地资产，可通过任务记录和 asset ID 访问。`find_assets` 只搜索已收藏或加入图板的资源；导入和生成图片不会自动进入资源库。

未指定时继承对应创作模式的页面设置，提交时固定。`destination` 必须是已经存在的绝对目录；提供目录会开启额外另存为，显式 `autoSave: false` 可关闭。分层输出额外需要 `creation.layerOutputDirectory`。

导入本地图片时调用 `import_image`：

```json
{
  "source": {
    "type": "path",
    "path": "C:\\Images\\reference.png"
  }
}
```

Base64 来源使用 `{ "source": { "type": "dataUrl", "dataUrl": "data:image/png;base64,..." } }`；其中省略号须替换为完整编码。

## 找回上次结果

`list_tasks` 默认包含手动和 MCP 创作，按提交时间倒序。`{ "limit": 1 }` 查询最近提交的任务，其结果可能仍在生成中。

最近完成的 MCP 任务：

```json
{
  "origin": "mcp",
  "status": "completed",
  "orderBy": "updatedAt",
  "limit": 1
}
```

如需包含部分成功的任务，可用 `hasResults: true` 替代 `status: "completed"`。查询结果返回 asset ID 摘要；通过 `get_task` 读取每张结果的可读性、尺寸、媒体类型和错误。`get_task.creation` 的 `requestCount` 为 1，表示该任务对应的单次供应商请求。

`requestId` 可用于找回同一调用的任务。任务和调用标识保存在本地，重启后仍可查询；已从历史删除的任务不参与任务查询。

## 重试与错误

`generate` 和 `submit_batch` 必须提供 `requestId`。响应丢失时，使用相同标识和相同参数重试，服务返回原批次并标记 `reused: true`。同一标识搭配不同参数返回 `REQUEST_ID_CONFLICT`。查询批次记录存在期间，这个标识不会创建第二批任务；有意重新生成须使用新标识。幂等标识不代表供应商支持原生幂等。

普通结果同时返回 `structuredContent` 和文本 JSON，格式为 `{ "ok": true, "data": { ... } }`。工具执行错误设置 `isError: true`，并返回 `{ "ok": false, "error": { "code": "...", "message": "...", "details": [], "retryable": false } }`；`details` 可省略，具体类型依错误而定。

| 错误码                                                      | 后续处理                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `INVALID_ARGUMENTS`、`INVALID_CREATION`                     | 根据字段路径或校验消息修改请求。                           |
| `MODEL_NOT_FOUND`、`MODEL_MODE_UNSUPPORTED`                 | 重新查询模型组合与可用模式。                               |
| `CREDENTIAL_REQUIRED`                                       | 在 Lutri 设置中配置供应商。                                |
| `ASSET_NOT_FOUND`、`ASSET_UNAVAILABLE`                      | 检查素材 ID 或重新导入文件。                               |
| `OUTPUT_DIRECTORY_REQUIRED`、`OUTPUT_DIRECTORY_UNAVAILABLE` | 设置有效目录或关闭额外另存为。                             |
| `TASK_NOT_FOUND`、`BATCH_NOT_FOUND`                         | 查询现存任务或批次。                                       |
| `TASK_NOT_RESUMABLE`                                        | 当前任务没有可恢复的原始结果；如需重新生成，提交新的创作。 |
| `BATCH_BUSY`                                                | 查询批次状态，待当前云端操作结束后重试取消。               |
| `REQUEST_ID_CONFLICT`                                       | 找回原批次，或为新的创作使用新标识。                       |
| `BRIDGE_TIMEOUT`                                            | 查询已有任务，或用原调用标识及相同参数重试提交。           |
| `OPERATION_FAILED`                                          | 阅读脱敏消息并检查应用状态。                               |

任务自身的供应商、下载或另存为错误位于查询结果中。查询成功与创作成功分别表达。`resume_task` 在任务已结束或已运行时返回 `accepted: false` 和原因；恢复失败可继续从任务状态读取。普通取消只影响排队请求，已经提交的请求继续获取原结果。

协议依据：[MCP 工具规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。
