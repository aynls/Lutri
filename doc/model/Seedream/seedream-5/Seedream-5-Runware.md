# Seedream 5.0 API（Runware）

Lutri 的图层拆分默认关闭，开启后要求一张源图及本地输出目录。目录不发送给供应商。每个结果在 `Lutri-<结果 ID>` 子目录交付 `composite.png` 和 `layers.psd`，图库展示合成图；下载图块、层名、层序、边界及恢复状态保存在应用暂存区。PSD 保存独立 RGBA 像素图层，支持中日文层名，按边界写入图块；合成预览与 PNG 使用相同像素。两个文件均通过临时文件提交，全部成功才标记交付完成。失败后可重试本地保存，不重新生图；历史与 MCP 分别记录合成图保存状态、PSD 交付状态和产物路径。不处理旧任务兼容。

拆分时不发送普通尺寸、背景、生成数量及提示词优化参数。Pro 的拆分分辨率可选 1K / 2K；Flash 可选 1K / 1.5K / 2K；自动表示省略 resolution。底图和图层来自 `data[].imageURL` 与 `data[].outputs.layers`，要求底图加 1–16 层，图层的 `zIndex` 唯一且为正；`boundingBox.absolute` 为 `[left, top, right, bottom]`，`normalized` 使用 0–1000。缺少名称时按层序命名。

```http
POST https://api.runware.ai/v1
Authorization: Bearer RUNWARE_API_KEY
Content-Type: application/json
```

请求体是任务数组，每个对象包含唯一 UUID v4 格式的 `taskUUID`、`taskType: imageInference`、`model` 和按场景需要的输入。版本对应 `bytedance:seedream@5.0-pro`、`bytedance:seedream@5.0-flash`、`bytedance:seedream@5.0-lite`。

参考图通过 `inputs.referenceImages` 按顺序提供，支持 UUID、URL、data URI、Base64。Pro 最多 10 张，Lite 最多 14 张。Pro 可通过 `settings.layerDecomposition` 请求图层拆分：只能输入一张图，不能同时使用 `positivePrompt` 或 `width`/`height`；未开启拆分时 `positivePrompt` 必填。Pro 的 `settings.background` 不可与图层拆分同时使用，透明背景时仅一张参考图且 `outputFormat` 为 `PNG` 或 `WEBP`。

Pro 要求参考图或尺寸（`width`/`height` 或 `resolution`）至少提供一项，`resolution` 不能与宽高同用，宽高需成对；自定义面积约 0.92–4.62 MP、宽高比 1:16–16:1。Flash 同样支持一张参考图拆层，限制与 Pro 类似，但 `resolution` 仅在拆层时可用；Flash 的面积约 0.92–4.62 MP、宽高比 1:16–16:1。Lite 要求宽高成对，并使用官方列举的 2K 和 3K 尺寸组合。

```bash
curl 'https://api.runware.ai/v1' -H "Authorization: Bearer $RUNWARE_API_KEY" -H 'Content-Type: application/json' \
  -d '[{"taskType":"imageInference","taskUUID":"50836053-a0ee-4cf5-b9d6-ae7c5d140ada","model":"bytedance:seedream@5.0-pro","positivePrompt":"A watercolor coastal town","width":1024,"height":1024}]'
```

响应在 `data[]` 中按 `taskUUID` 对应任务，包含 `imageUUID`、`imageURL` 等。输出类型可使用 `outputType`，例如 `URL`、`base64Data` 或 `dataURI`；另可设置 `outputFormat`。拆分时底图及每个图层单独计费。

来源：[Pro](https://runware.ai/docs/models/bytedance-seedream-5-0-pro)、[Flash](https://runware.ai/docs/models/bytedance-seedream-5-0-flash)、[Lite](https://runware.ai/docs/models/bytedance-seedream-5-0-lite)、[鉴权与响应](https://runware.ai/docs/models-api/authentication)。
