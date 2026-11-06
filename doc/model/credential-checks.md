# 凭据连接检查

核对日期：2026-11-06。检查仅由用户主动触发，不执行生图，也不推断某个模型已获得权限。

| 供应商 | 认证读取接口 | 成功含义 |
|---|---|---|
| OpenRouter | `GET https://openrouter.ai/api/v1/key`，Bearer token | 当前 API key 可读取自身信息。 |
| Google | `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1`，`x-goog-api-key` | 当前 key 可访问模型列表。 |
| 其他供应商 | 不提供检查 | 保留“已配置”状态，不将其视为认证成功，也不使用收费请求探测。 |

检查使用系统凭据库中的 key，禁止重定向，20 秒超时。错误仅返回 HTTP 状态或连接失败，不将密钥、响应正文或带签名地址写入界面。已配置状态还校验当前供应商所需 endpoint/deployment 是否完整。

官方依据：[OpenRouter 当前 API key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)、[Google Models API](https://ai.google.dev/api/models)。
