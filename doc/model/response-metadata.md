# 响应信息与任务追溯

核对日期：2026-11-06。实现位置：`src/providers/results.ts`、`src/history/TaskUsage.tsx`、`src/services/generation.ts`。

历史保留业务参数与实际提交的编译后提示词快照，不保存含密钥、图片 Base64 的原始请求体。旧记录没有提交快照时显示“未记录”，不按新规则重新编译冒充原始请求。供应商任务 ID 与 Lutri 请求 ID 分开展示。

| 来源 | 已采集与展示 | 边界 |
|---|---|---|
| Images 兼容响应 | `usage.input_tokens`、`output_tokens`、`total_tokens`，逐图片返回的 `seed`、`revised_prompt` 等原有字段 | 原生返回才显示；流式完成事件的 usage 保存在对应结果，不将每张图片用量重复当作整批用量。 |
| Runware | 请求 `includeCost: true`；各 `data` 结果的 `cost`、`seed` | 官方定义 cost 单位 USD；按结果保存，不估算或用请求 seed 冒充随机生成的实际 seed。 |
| OpenRouter | 返回的 `usage` 中 token 与 cost | cost 按官方用量文档标为积分，不与 Runware USD 混合汇总；不存在则不显示，不额外创建计费请求。 |
| Gemini generateContent | 返回的 `usageMetadata.promptTokenCount`、`candidatesTokenCount`、`totalTokenCount` | 按响应提供值展示，不从差值猜测遗漏字段。 |
| fal | `request_id`、响应 `seed` 与 `metrics` 等已有返回字段 | 轮询任务 ID 保存在恢复信息；不将推理时长推算成费用，根级 seed 仅视作请求级返回值。 |

批次按单位分别求和，存在未返回、未完成或不支持统计的请求时标为“部分用量”。不计算猜测价格。HTTP 状态与脱敏后的错误可以在详情查看；签名 URL 的查询参数、常见凭据字段和图片数据会被移除。

参考官方文档：

- [Runware Pricing](https://runware.ai/docs/models-api/pricing)：`includeCost` 与 USD 费用。
- [Runware UNI-1 response schema](https://runware.ai/docs/models/luma-uni-1)：实际 seed 与逐任务 cost。
- [OpenAI Images API](https://developers.openai.com/api/reference/resources/images/methods/generate)：响应与流式完成事件中的 usage。
- [OpenRouter Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)：token 字段及 cost 积分。
- [Gemini UsageMetadata](https://ai.google.dev/api/generate-content#UsageMetadata)：generateContent 用量字段。
- [fal queue status](https://fal.ai/docs/api-reference/inference-api/queue/status)：任务 ID、状态与 metrics。

未进行付费请求验证。字段是否返回依赖具体模型－供应商组合，缺失值不会显示为零。
