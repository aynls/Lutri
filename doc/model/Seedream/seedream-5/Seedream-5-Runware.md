# Seedream 5.0 API（Runware）

Lutri 的图层拆分默认关闭，开启后必须设置本地图层另存为目录。此目录保存在草稿中，不发送给供应商。完整拆分结果按返回的位置和层序合成；底图、透明 PNG 和 `layers.json` 自动写入目录下的 `Lutri-<结果 ID>` 子目录，图库只保存合成 PNG。底图另存为 PNG；位置清单使用输出底图坐标系。下载与另存为失败保留原任务供重试，成功后移除临时图层来源。

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
