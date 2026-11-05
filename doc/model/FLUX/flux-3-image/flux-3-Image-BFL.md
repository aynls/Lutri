# FLUX 3 Image API

FLUX 3 Image 使用同一接口生成和编辑图片，也支持多张参考图和在提示词中描述区域布局。接口异步返回任务，需要轮询获取结果。

## 请求

```http
POST https://api.bfl.ai/v1/flux-3-image
x-key: BFL_API_KEY
Content-Type: application/json
```

将 `BFL_API_KEY` 替换为 BFL API 密钥。请求体为 JSON；除下列字段外，不接受其他字段。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `prompt` | string | 是 | — | 描述生成或编辑内容的自由文本。 |
| `images` | string、string 数组或 null | 否 | — | 参考图片，以 HTTP(S) URL 或 Base64 字符串提供；共 1–10 张。顺序有意义，第一张用于 `auto` 构图和 `match_input` 尺寸的判断。 |
| `aspect_ratio` | string | 否 | `auto` | 输出宽高比，可选值见下文。 |
| `resolution` | string | 否 | `1k` | 输出分辨率档位，可选值见下文。 |
| `width` | integer 或 null | 否 | — | 输出宽度，256–6256 像素；须与 `height` 一起设置。 |
| `height` | integer 或 null | 否 | — | 输出高度，256–6256 像素；须与 `width` 一起设置。 |
| `safety_tolerance` | integer | 否 | `2` | 内容审核容忍度，范围 0–7，0 最严格。路由和组织决定获准的最高等级及各类别上限；未获批准的等级返回 422 和获准等级。 |
| `grounding` | boolean | 否 | `true` | 为 `true` 时，提示词可能使用外部网络和图片搜索；为 `false` 时两种搜索均关闭。 |
| `version` | string | 否 | `latest` | 接口版本。目前列出的值为 `latest`，指向当前发布版本；日期版本会在发布时添加。 |
| `user` | string 或 null | 否 | — | 调用平台提供的终端用户不透明标识符，长度 1–256，不得包含空字符。 |

### 宽高比与分辨率

`aspect_ratio` 支持 `21:9`、`2:1`、`16:9`、`3:2`、`7:5`、`4:3`、`5:4`、`1:1`、`4:5`、`3:4`、`5:7`、`2:3`、`9:16`、`1:2`、`9:21` 和 `auto`。

选择 `auto` 时，提示词指定的比例优先；否则有参考图时沿用第一张参考图的构图。没有参考图时由提示词决定，未指定则使用 `1:1`。

`resolution` 支持 `768sq`、`1k`、`1.5k`、`2k`、`4k` 和 `match_input`。前五项是等像素面积档位，实际宽高随比例变化。`match_input` 仅用于编辑：沿用第一张参考图的尺寸，超过 4 MP 时缩小至 4 MP；如果设置了 `aspect_ratio`，则使用最接近的档位。

同时设置 `width` 和 `height` 时，二者覆盖 `resolution` 和 `aspect_ratio`。宽高乘积最多为 16,822,272 像素；有参考图时最多为 4,194,304 像素。

## 示例

以下为 Bash 示例。先将 BFL 密钥设置为环境变量 `BFL_API_KEY`。

生成图片：

```bash
curl --request POST 'https://api.bfl.ai/v1/flux-3-image' \
  --header "x-key: $BFL_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"prompt":"A foggy coastal highway at dawn","aspect_ratio":"21:9"}'
```

多图参考编辑：将示例 URL 替换为可访问的图片地址。数组顺序对应提示词中的图片顺序。

```bash
curl --request POST 'https://api.bfl.ai/v1/flux-3-image' \
  --header "x-key: $BFL_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"prompt":"Turn Image 1 in the style of Image 2","images":["https://example.com/image-1.png","https://example.com/image-2.png"]}'
```

## 包围盒：控制布局与编辑区域

包围盒内容写在 `prompt` 字符串内，不是请求体的独立字段。官方示例先用自然语言描述操作，在对象名称后添加 `<对象 ID>` 标记，再附加一个 JSON 数组，以相同的 `id` 描述各对象的区域。编辑时将参考图放入 `images`，并在提示词中用 `<ref_image_0>` 引用第一张图。

下面的代码块是 **`prompt` 的内容**，不是完整请求体。实际提交时须将整个内容编码为 JSON 字符串，并放入请求体的 `prompt` 字段；编辑示例还需提供 `images`。

| 提示词中的字段 | 示例中的作用 |
| --- | --- |
| `id` | 对象标识，与正文中的 `<id>` 对应。 |
| `bbox` | 生成布局时的对象区域。 |
| `from` | 编辑时的来源图片标识，例如 `ref_image_0`；示例中也使用 `null`。 |
| `src_bbox` | 参考图中的来源区域；示例中也使用 `null`。 |
| `tgt_bbox` | 输出图中的目标区域。 |
| `desc` | 对象或操作的文字描述。 |

官方文档将区域表示为 `[上、左、下、右]`，坐标使用 0–1000 范围内的值。示例本身不能作为所有边界条件或字段必需性的完整定义。

### 生成：指定对象布局

以下示例将背景覆盖整个画面，并将人物限定在中间区域。`bbox` 和对象标记一起表达布局：

```text
Minimalist illustration of a running person <silhouette_1> against a chartreuse background <background_1>.
[{"id":"background_1","bbox":[0,0,1000,1000],"desc":"A flat chartreuse background."},{"id":"silhouette_1","bbox":[150,150,850,850],"desc":"A black silhouette of a running person."}]
```

### 编辑：指定修改与保留的区域

将待编辑图片作为 `images` 的第一张图。以下示例要求改变老虎的颜色，同时保持树木不变：

```text
In <ref_image_0>, change the tiger <animal_1> to pink. Keep the trees <trees_1> unchanged.
[{"id":"animal_1","from":null,"src_bbox":null,"tgt_bbox":[250,50,850,650],"desc":"Make the tiger pink."},{"id":"trees_1","from":"ref_image_0","src_bbox":[0,0,650,1000],"tgt_bbox":[0,0,650,1000],"desc":"Dark background trees."}]
```

### 移动：指定来源和目标位置

将待编辑图片作为 `images` 的第一张图。以下示例中，骑士的来源框与目标框大小相同，目标框位于更靠上、靠左的位置：

```text
In <ref_image_0>, move the knight <knight_1> upwards and to the left. Keep the needle <needle_1> in its original position and leave the rest unchanged.
[{"id":"knight_1","from":"ref_image_0","src_bbox":[500,150,850,350],"tgt_bbox":[194,55,544,255],"desc":"A miniature grey knitted knight."},{"id":"needle_1","from":"ref_image_0","src_bbox":[420,250,550,450],"tgt_bbox":[420,250,550,450],"desc":"A polished steel needle."}]
```

## 响应与结果查询

提交成功返回 HTTP 200 和任务信息：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 任务 ID。 |
| `polling_url` | string | 结果查询地址。 |
| `cost` | number 或 null | 本次请求消耗的 credits。 |
| `input_mp` | number 或 null | 输入图像的百万像素数，保留两位小数。 |
| `output_mp` | number 或 null | 输出图像的百万像素数，保留两位小数。 |

使用相同的 `x-key` 对返回的 `polling_url` 发起 GET 请求。状态为 `Pending` 时继续轮询；`Ready` 时从 `result.sample` 获取结果图片 URL。其他状态包括 `Task not found`、`Request Moderated`、`Content Moderated` 和 `Error`。结果图片的签名 URL 有效期为 10 分钟，应及时获取图片。

请求参数校验失败返回 HTTP 422；响应中的 `detail` 数组可包含错误位置 `loc`、消息 `msg` 和错误类型 `type`。

## 参考来源

- 用户提供的 FLUX 3 Image 接口文档及其 OpenAPI 定义。
- [BFL FLUX 3 Image 概览](https://docs.bfl.ai/flux_3/flux3_image_overview)。
- [BFL 结果查询 API](https://docs.bfl.ml/api-reference)
- [BFL 异步请求与结果示例](https://docs.bfl.ml/flux_outpainting)
