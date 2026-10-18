# A / B 共用接口契约 · 三小时 D0

版本：2026-10-18 / A 前端实现约定。**待 B 确认并联调，不代表后端已实现。**

A 维护 `frontend/` 与本文；B 维护 `backend/`。前端仅访问同源 `/api`。开发及本机构建预览通过 Vite 代理到 `http://127.0.0.1:8000`；可在 `frontend/.env.local` 设置 `BACKEND_URL` 后重启 Vite。模型密钥只放后端，不使用 `VITE_` 变量传给浏览器。

## 通用规则

- UTF-8 JSON；键名使用 camelCase。成功返回 2xx；业务失败返回合适的非 2xx 和 `{"error":"用户可读说明"}`（亦可兼容字符串 `detail` / `message`）。原 PDF 接口例外，返回二进制。
- ID 为非空字符串；不同上传产生不同材料 ID 和版本 ID，文件永不按同名覆盖。页序为正整数，从 **1** 开始，指 PDF 文件页序。
- 材料状态仅 `processing / ready / failed`；本次上传同步解析，不提供轮询接口。因此正常成功应直接返回 `ready`，失败返回错误；前端等待请求时显示处理中。若返回 `processing`，前端提示接口未完成且不会启用提问。
- `quote` 是对应页面的真实非空摘录，后端负责核验；前端只检查结构、材料/版本归属、引用 ID 和已知页数，不能证明结论受原文支持。
- 本次单用户单空间，状态只由一个页面修改。跨标签页并发编辑没有冲突合并协议，演示时仅打开一个页面。

## GET /api/health

```json
{"status":"ok"}
```

不得返回模型密钥。此接口只证明后端可达；真实模型可用性通过实际问答验收。

## POST /api/materials

`multipart/form-data`，字段名 **file**。浏览器自动设置 Content-Type 和 boundary。前端限制非空、扩展名 `.pdf`、最大 20 MiB；后端仍需自行检查类型、大小、解析文字和上下文上限。

成功：

```json
{
  "materialId":"mat_001",
  "versionId":"ver_001",
  "title":"课程讲义.pdf",
  "status":"ready",
  "pageCount":3,
  "error":null
}
```

扫描件、坏文件、空文字、超长材料等应给出明确的非 2xx 错误。若业务选择返回 `failed` 结果，仍须保留上述字段，`pageCount` 可为 0，`error` 给出说明。新材料成功后才切换当前阅读与问答范围，旧卡片不改写。

## GET /api/materials/:materialId/file

返回该 ID 保存的原 PDF，`Content-Type: application/pdf`，建议 `Content-Disposition: inline; filename="lecture.pdf"; filename*=UTF-8''...`，让刷新后恢复真实文件名。可支持 Range；不支持时返回完整 PDF 也可。未知 ID 返回 404；不能用当前材料替代旧材料。

PDF.js 是前端阅读器，仅渲染原文件；按页提取材料上下文、验证文字可读性均由 B 完成。字体、CMaps、WASM 和 worker 随前端本地提供。引用定位用引用材料 ID 与 `pageStart`，并展示原摘录；另有 `#page=N` 的原 PDF 打开入口作为兜底。旧卡片来源在阅读器临时打开，不改变当前问答范围或保存的当前阅读位置。

## POST /api/ask

请求：

```json
{"materialId":"mat_001","question":"这个概念的核心是什么？"}
```

响应：

```json
{
  "answerSegments":[
    {"id":"seg_1","text":"根据材料可得到的解释。","citationIds":["ref_1"]}
  ],
  "citations":[
    {"id":"ref_1","materialId":"mat_001","versionId":"ver_001","title":"课程讲义.pdf","pageStart":2,"pageEnd":2,"quote":"第 2 页可核对的实际原文。"}
  ],
  "selectedScope":{"materialId":"mat_001","versionId":"ver_001"},
  "limitations":[]
}
```

- `selectedScope` 本次为单一对象；`limitations` 始终为字符串数组。
- 段落内 `citationIds` 必须在 `citations` 中存在，引用 ID 不重复；每条引用必须属于 selectedScope 的材料和版本。
- 前端使用纯文本展示，不执行模型生成的 HTML。每段只显示自己的引用；生成卡片时仅复制实际被段落引用的来源。
- 依据不足时可以返回空 `answerSegments` / `citations`，在 `limitations` 写明材料未涵盖；或以无引用段落说明不足。不能编造引用，不能静默联网补全。
- 前端问题上限 4000 字符，请求超时 120 秒；失败保留问题。提问与上传不会并行，避免范围切换后展示旧回答。

## GET /api/state

首次运行必须返回完整空结构，不能返回 `{}`：

```json
{"goal":"","nextStep":"","readingPosition":null,"cards":[]}
```

已有状态示例：

```json
{
  "goal":"理解电容储能的推导",
  "nextStep":"复习第 3 页例题",
  "readingPosition":{"materialId":"mat_001","versionId":"ver_001","page":2},
  "cards":[
    {
      "id":"card_uuid",
      "title":"我对储能公式的理解",
      "body":"经过本人改写的表述。",
      "sourceRefs":[
        {"id":"ref_1","materialId":"mat_001","versionId":"ver_001","title":"课程讲义.pdf","pageStart":2,"pageEnd":2,"quote":"当时原文的摘录快照。"}
      ],
      "reviewStatus":"to_review",
      "createdAt":"2026-10-18T06:00:00.000Z",
      "updatedAt":"2026-10-18T06:01:00.000Z"
    }
  ]
}
```

前端由 `readingPosition` 恢复当前材料 ID、版本和页数，通过原 PDF 的 Content-Disposition / 元数据恢复标题和实际总页数。缺少文件名元数据时显示“上次学习材料”；不伪造原文件名。`sourceRefs` 是完整引用快照，允许空数组（手写卡片）。卡片 ID 唯一，客户端生成 UUID；时间使用 ISO 8601。

## PUT /api/state

请求是上面四个字段的**完整状态**。后端应原子保存（文件原子替换或数据库事务），持久化成功后才响应：

```json
{"saved":true}
```

没有明确确认时前端不会显示已保存。前端每次仅发一个 PUT，输入防抖 650ms，失焦、卡片提交、复习操作立即尝试保存；请求期间修改合并到下一次 PUT。失败不清空最新状态，可手动重试，无重复新建卡片。

本地存储仅保存未提交/未确认的状态草稿、问题草稿、卡片编辑草稿。服务器成功确认且队列清空后删除状态草稿。重开时服务端先读取，如发现不同的未保存草稿，由用户选择恢复或采用服务端版本；未读取服务端前禁止写入，避免空状态覆盖已有数据。恢复提示未处理前禁止上传、提问、状态修改和导出。

## 集成前 B 必须核对

1. 上述路径、multipart 字段、`selectedScope` 对象、`limitations` 数组、`saved: true`。
2. 重启后原文件可取、状态仍在、旧材料 ID 不覆盖；文件名 header 可读。
3. 只有文本提取成功才 ready，真实模型问题改变会触发真实请求；引用来自对应原文。
4. 没有模型、模型超时、解析失败、保存失败均返回可读错误，不能返回假成功。

请求样例中的文字仅用于说明格式，不是运行时固定答案。测试桩只在 `frontend/tests/` 的独立服务中提供，默认端口 8011；测试时须主动启动独立代理页面。health 可选 `mode: "test-fixture"` 会触发显眼标记；生产页面没有固定回答或测试模式开关。
