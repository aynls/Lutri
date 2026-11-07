# Recraft Vector API

核对日期：2026-11-07。先核对各供应商的模型页、参数 Schema 和请求示例，再按以下组合适配。范围为 V4、V4.1、V4 Styles 的六个原生 SVG 模型；不包含旧版 V2/V3，也不把独立的位图描摹工具 Recraft Vectorize 当作生图模型。

## 模型与供应商

| Lutri 模型 | Recraft `model` | fal 路径 | Runware AIR |
| --- | --- | --- | --- |
| Recraft V4 Vector | `recraftv4_vector` | `fal-ai/recraft/v4/text-to-vector` | `recraft:v4@vector` |
| Recraft V4 Pro Vector | `recraftv4_pro_vector` | `fal-ai/recraft/v4/pro/text-to-vector` | `recraft:v4-pro@vector` |
| Recraft V4.1 Vector | `recraftv4_1_vector` | `fal-ai/recraft/v4.1/text-to-vector` | 未在当前官方目录中找到，不注册 |
| Recraft V4.1 Pro Vector | `recraftv4_1_pro_vector` | `fal-ai/recraft/v4.1/pro/text-to-vector` | 未在当前官方目录中找到，不注册 |
| Recraft V4 Styles Vector | `recraftv4_styles_vector` | `recraft/v4/style/text-to-vector` | `recraft:v4@styles-vector` |
| Recraft V4 Styles Pro Vector | `recraftv4_styles_pro_vector` | `recraft/v4/style/pro/text-to-vector` | `recraft:v4@styles-pro-vector` |

共 16 个组合。每个模型使用独立目录，每个供应商有独立的字段、校验及请求组装；仅复用通用控件、尺寸表和明确相同的校验函数。Vector 不作为现有栅格模型的格式开关。

## Recraft 原厂：六个组合

生成使用 `POST https://external.api.recraft.ai/v1/images/generations`，`Authorization: Bearer <token>`，JSON 请求体。

| 参数 | 约束及映射 |
| --- | --- |
| `model` | 使用上表中的独立 Vector ID。 |
| `prompt` | 必填，1–10000 字符。 |
| `size` | 可省略；支持宽高比或官方尺寸表中的 `WxH`，不支持任意像素宽高。Pro 使用 2K 表，其余使用 1K 表。 |
| `n` | 1–6，省略为 1。 |
| `style_id` | 可复用的风格 UUID；风格须属于对应模型。 |
| `style_reference_urls` | 最多 10 张风格参考图，按用户顺序传入 data URL；与 `style_id` 互斥。PNG/JPG/WEBP，单张小于 20 MB，总计不超过 64 MB。 |
| `style_match` | `flexible` / `precise`；省略时采用供应商默认。 |
| `random_seed` | 整数；官方未给出上下界，应用限于 JavaScript 可安全表示的整数。 |
| `controls.colors` | 至多 10 色，每项 `{"rgb":[r,g,b]}`，分量为 0–255 的整数；可带 0–1 的 `weight`，须全部设置或全部省略，权重合计不超过 1。 |
| `controls.background_color` | `{"rgb":[r,g,b]}`。 |
| `response_format` | 应用提供 `url`、`b64_json`；默认 URL。供应商还支持 multipart 响应，但应用传输层暂不解析，不提供该选项。 |

输出固定 SVG，不发送栅格 `image_format`，也不提供压缩质量设置。V4 Styles 两个组合必须提供风格 ID 或参考图；其余四个组合可纯文字生成。

V4 / V4.1 的四个原厂组合还支持编辑：`POST /v1/images/imageToImage`，JSON 的 `image_url` 接收一张原图的 data URL，必填 `strength` 为 0–1，应用初值 0.5；保留 `model`、`prompt`、`n`、`random_seed`、`controls`、`response_format`。不发送 `size` 或风格字段。编辑原图支持 PNG/JPG/WEBP/SVG，单张小于 20 MB、256–4096 像素、至多 16 MP。使用已有“风格生成／编辑／自动”和原图绑定机制。Styles 不支持编辑或蒙版。

参考：[V4](https://www.recraft.ai/docs/api-reference/models/recraft-v4)、[V4.1](https://www.recraft.ai/docs/api-reference/models/recraft-v4-1)、[Styles](https://www.recraft.ai/docs/api-reference/models/recraft-v4-styles)、[端点与风格参考](https://www.recraft.ai/docs/api-reference/endpoints)、[图生图](https://www.recraft.ai/docs/api-reference/tools/image-to-image)、[尺寸与限制](https://www.recraft.ai/docs/api-reference/appendix)。

## Runware：四个组合

`POST https://api.runware.ai/v1`，Bearer 认证，请求体为任务数组。**这四个接口使用 `taskType: "vectorize"`，不是 `imageInference`**。模型 Schema 不包含 `numberResults`，应用按单张任务处理；多张使用已有“请求次数”，每次拥有独立的 `taskUUID`。

| 参数 | 约束及映射 |
| --- | --- |
| `model` | 上表中四个已确认 AIR。 |
| `positivePrompt` | 1–10000 字符。 |
| `width` / `height` | 应用始终成对发送，且限定为该模型的尺寸表。普通版默认 1024×1024，Pro 默认 2048×2048；不提供省略尺寸的“自动”选项。 |
| `settings.colors` | `[{"rgb":[r,g,b]}]`，分量整数 0–255；不发送 Recraft 原厂的 `weight`。 |
| `settings.backgroundColor` | `{"rgb":[r,g,b]}`。 |
| `inputs.styleId` | 仅 Styles 两个组合，风格 UUID。 |
| `inputs.referenceImages` | 仅 Styles，1–10 张；与 `styleId` 二选一且必选。每边至少 256，单张至多 10485760 字节，总计至多 67108864 字节。 |
| `settings.styleMatch` | 仅 Styles，`precise` / `flexible`，供应商默认 `precise`。 |
| `outputFormat` | 固定 `SVG`。 |
| `outputType` | 应用固定 `URL`；供应商还支持 `base64Data`、`dataURI`。 |
| `deliveryMethod` | 应用固定 `async`；通过原任务 UUID 的 `getResponse` 轮询并恢复。 |
| `includeCost` | 固定 `true`，保存结果费用。 |

普通 V4 Vector / Pro Vector 不接收参考图、style ID 或 seed。四个组合都不提供单次数量、栅格输出、蒙版或编辑模式。供应商另有 `ttl`、`uploadEndpoint`、`webhookURL` 等交付字段；应用沿用自身下载和轮询管理，不暴露这些外部存储配置。

1K 尺寸：1024×1024、1536×768、768×1536、1280×832、832×1280、1216×896、896×1216、1152×896、896×1152、832×1344、1280×896、896×1280、1344×768、768×1344。Pro 的每边乘 2。该尺寸描述生成画布，SVG 保存后仍可无损缩放。

2026-11-07 实际调用纠正：Runware Schema 将宽高标为可省略，但用户提交的 V4 Pro Vector 任务在未发送宽高时返回 `unsupportedDimensions`。通过 `getTaskDetails` 核对，原请求没有 `width` 或 `height`，并非发送了错误的 1K 尺寸；响应列出的 14 个尺寸与当前 Pro 尺寸表一致。不能由此确定服务器内部用了什么默认值。四个 Vector 组合统一采用上述显式尺寸策略，请求组装时再次检查尺寸白名单；未设置参数的草稿也会发送对应的方形尺寸。此修复未重新调用付费生成。

结果使用 `data[].imageUUID`、`imageURL`；Styles 可返回 `outputs.styleId`。复用现有 Runware 任务恢复和结果元数据，不重新提交失败任务来补图。

来源：[V4 Vector](https://runware.ai/docs/models/recraft-v4-vector)、[Pro Vector](https://runware.ai/docs/models/recraft-v4-pro-vector)、[Styles Vector](https://runware.ai/docs/models/recraft-v4-styles-vector)、[Styles Pro Vector](https://runware.ai/docs/models/recraft-v4-styles-pro-vector)、[Styles 请求示例](https://runware.ai/docs/models/recraft-v4-styles-vector/examples)。同时通过 Runware 官方 MCP `list_models` 和四次 `model_schema` 核对模型 ID、字段及依赖。

## fal：六个组合

`POST https://queue.fal.run/<上表路径>`，`Authorization: Key <key>`。注意 Styles 路径以 `recraft/` 开头，其余以 `fal-ai/recraft/` 开头。每个端点的 OpenAPI Schema 已分别核对。

| 参数 | 约束及映射 |
| --- | --- |
| `prompt` | 1–10000 字符。 |
| `image_size` | 六个枚举 `square_hd`、`square`、`portrait_4_3`、`portrait_16_9`、`landscape_4_3`、`landscape_16_9`，或 `{width,height}`；每边整数 1–14142。默认 `square_hd`；应用自定义宽高须填写完整。 |
| `colors` / `background_color` | 使用 `{"r":0,"g":0,"b":0}`，分量整数 0–255；Schema 允许缺省分量并以 0 补齐。 |
| `enable_safety_checker` | 布尔值，默认 true；关闭需要账户授权。 |
| `style_id` | 仅 Styles，UUID v4。 |
| `image_urls` | 仅 Styles，1–10 张 PNG/JPG/WEBP 风格图，按顺序发送 data URL。 |
| `style_match` | 仅 Styles，`precise` / `flexible`。 |

Styles 需要风格 ID 或参考图。fal 的 Schema 没有声明二者互斥，不套用原厂或 Runware 的互斥约束。其他四个 fal 组合不提供图片输入或 style ID。六个端点均没有 seed、数量或输出格式字段；固定产生 SVG，应用预期单张，实际结果以 `images` 数组为准。

保存提交响应的 `request_id`、`status_url`、`response_url`，沿用 fal 队列恢复。读取 `images[].url` 和 `content_type: image/svg+xml`，Styles 的顶层 `style_id` 存入任务元数据。

来源：[V4 Vector](https://fal.ai/models/fal-ai/recraft/v4/text-to-vector/api)、[V4 Pro Vector](https://fal.ai/models/fal-ai/recraft/v4/pro/text-to-vector/api)、[V4.1 Vector](https://fal.ai/models/fal-ai/recraft/v4.1/text-to-vector/api)、[V4.1 Pro Vector](https://fal.ai/models/fal-ai/recraft/v4.1/pro/text-to-vector/api)、[Styles Vector](https://fal.ai/models/recraft/v4/style/text-to-vector/api)、[Styles Pro Vector](https://fal.ai/models/recraft/v4/style/pro/text-to-vector/api)。原始 Schema：各页面的 Schema 链接 `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<路径>`。

## 应用数据链路与验收范围

SVG 原件通过现有统一图片类型解析保存，图库资产记录 `image/svg+xml`，缩略图另存 PNG；缩略图不改变资产类型。原厂的裸 Base64 交给实际文件检测，不伪标为 PNG。现有 SVG 超分拦截继续生效。

输入准备对 SVG 使用图片元素解码后检查尺寸，避免直接从 SVG Blob 创建位图的 WebView 限制。原厂编辑在尺寸无需调整时传递 SVG 原件；风格参考或其他不接受 SVG 的输入按已有规则转换为 PNG 发送副本，不修改图库原件。

本次只做静态检查与构建；按项目规范不添加或运行测试，不调用付费生图。文档和 Schema 核对不能证明账户权限、真实 SVG 生成质量或端到端接口成功。
