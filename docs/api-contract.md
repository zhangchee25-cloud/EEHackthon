# 学习 Agent：电脑 A / B 接口契约

版本 1.0 · 2026-10-18。本机单用户 D0。后端默认 http://127.0.0.1:8000 ，JSON 使用 UTF-8。前端通过开发代理使用相对路径 /api。

相较分工草案，增加 revision 作为必要保存冲突字段，以及 GET /api/materials 供刷新恢复列表。页码均为文件页序，从 1 开始。密钥不通过前端接口传输。

## 接口清单

| 方法与路径 | 说明 | 成功 |
| --- | --- | --- |
| GET /api/health | 本机模式、模型配置状态、容量上限 | 200 |
| GET /api/materials | {materials: Material[]}，新到旧 | 200 |
| POST /api/materials | multipart 唯一文件字段 file，同步解析 | 201 |
| GET /api/materials/:materialId | 材料状态、版本、页数、告警与 fileUrl | 200 |
| GET /api/materials/:materialId/file | 原 PDF，支持 Range 和 HEAD | 200 / 206 |
| POST /api/ask | 指定一份材料的非流式问答 | 200 |
| GET /api/state | 完整学习状态 | 200 |
| PUT /api/state | 完整保存，必须带当前整数 revision | 200 |
| GET /api/export | text/markdown，附件 study-cards.md | 200 |

## 上传和材料

~~~javascript
const form = new FormData();
form.append('file', selectedFile);
const response = await fetch('/api/materials', { method: 'POST', body: form });
const result = await response.json();
if (!response.ok) throw new Error(result.error.message);
~~~

不要手动设置 multipart Content-Type；浏览器必须生成 boundary。等待时显示 processing，解析完成服务端才返回 ready。失败显示 failed 和原因。

Material 示例（ID 仅为格式示例，请使用真实响应）：

~~~json
{
  "materialId": "mat_example",
  "versionId": "ver_example",
  "title": "课程讲义.pdf",
  "status": "ready",
  "pageCount": 3,
  "warnings": [],
  "error": null,
  "createdAt": "2026-10-18T06:00:00.000Z",
  "fileUrl": "/api/materials/mat_example/file",
  "deduplicated": false
}
~~~

deduplicated 仅上传响应有。同内容复用原记录与原文件名；同名不同内容不覆盖旧材料。失败上传会保留 failed 记录，不得加入问答。

打开引用用真实 materialId 对应文件，按 citation.pageStart 跳页，例如 fileUrl + '#page=' + pageStart，或使用 PDF 阅读器页序 API。仅展示页码不等于跳页已实现。

## 提问

请求：

~~~json
{
  "materialId": "mat_example",
  "question": "线性与时不变分别是什么条件？",
  "requestId": "q_12345678-1234-1234-1234-123456789012"
}
~~~

requestId 可省略，推荐每个新问题用 crypto.randomUUID() 生成。重试同一个请求复用 ID；改问题或材料要换 ID。正在问答时返回 429 MODEL_BUSY，页面禁用重复发送并保留问题。

回答示例：

~~~json
{
  "supported": true,
  "answerId": "ans_example",
  "question": "线性是什么意思？",
  "answerSegments": [
    {"id": "seg_1", "text": "线性要求叠加性和齐次性同时成立。", "citationIds": ["cit_example"]}
  ],
  "citations": [
    {
      "id": "cit_example",
      "materialId": "mat_example",
      "versionId": "ver_example",
      "title": "课程讲义.pdf",
      "pageStart": 1,
      "pageEnd": 1,
      "quote": "A linear system satisfies additivity and homogeneity."
    }
  ],
  "selectedScope": [{"materialId": "mat_example", "versionId": "ver_example", "title": "课程讲义.pdf"}],
  "limitations": [],
  "model": "实际配置模型ID",
  "createdAt": "2026-10-18T06:00:00.000Z",
  "usage": {"total_tokens": 123}
}
~~~

usage 仅保留平台返回的非负 token 数，可能为空，不推算费用。按 citationIds 显示每段相应出处，不假设每段引用全部来源。

材料不足：仍 HTTP 200，supported=false，answerSegments=[]，citations=[]，limitations 非空；展示“材料依据不足”及说明，不虚构补充答案。模型失败、伪引用、格式不合法都返回错误，不保存为成功答案。

## 状态和卡片

首次 GET /api/state：

~~~json
{"revision":0,"goal":"","nextStep":"","readingPosition":null,"cards":[],"updatedAt":null}
~~~

PUT /api/state 提交完整状态：

~~~json
{
  "revision": 0,
  "goal": "分清线性和时不变",
  "nextStep": "复习因果性",
  "readingPosition": {"materialId": "mat_example", "versionId": "ver_example", "page": 2},
  "cards": [
    {
      "id": "card_12345678-1234-1234-1234-123456789012",
      "title": "我对线性的理解",
      "body": "用户自己编辑后的正文",
      "sourceRefs": [],
      "reviewStatus": "to_review"
    }
  ]
}
~~~

上例 sourceRefs=[] 表示无材料来源的手写卡片。从回答转卡片时，要复制该回答中使用到的完整 citations 对象，不是只存 ID，不可自行修改版本、页序或摘录。后端验证来源确实存在于已校验回答中。

保存响应是新完整状态，revision 加 1；每卡增加 createdAt、updatedAt、selfCheckedAt，时间由服务端产生。下次保存必须带服务器返回的新 revision。服务器允许返回的时间字段再次提交，但不信任客户端填写的时间。

- goal 最多 1000 字符，nextStep 最多 2000；最多 200 卡，标题 200、正文 20000、每卡 50 条来源。
- readingPosition 可为 null，否则材料版本必须可用，page 不得越界。
- reviewStatus 只有 to_review / self_checked。已保存正文改变时服务端强制 to_review；下一次独立操作才可再次自检。
- 完整 cards 中漏掉旧卡片就是删除，多个编辑器保存时先合并完整数组。
- 卡片/请求 ID 只能包含英文大小写、数字、下划线、连字符，长度 1–100。
- 409 STATE_CONFLICT 返回 details.currentRevision。保留本地草稿，重新 GET 并合并；不要拿旧内容直接覆盖。

推荐前端保存：同一时刻仅一个 PUT；等待期间的新编辑合并到待保存状态；成功时更新 revision，再发下一次。只有响应成功才显示“已保存”。

## 错误约定

~~~json
{
  "error": {"code":"STATE_CONFLICT","message":"学习记录已更新，请重新读取后合并，保留本地草稿。","details":{"currentRevision":2}},
  "requestId": "req_example"
}
~~~

| HTTP / code | 前端行为 |
| --- | --- |
| 413 FILE_TOO_LARGE / BODY_TOO_LARGE / CONTEXT_TOO_LARGE | 提示缩小/拆分材料 |
| 415 FILE_TYPE_UNSUPPORTED / PDF_INVALID | 只接受真实文本 PDF |
| 422 PDF_NO_TEXT / PDF_ENCRYPTED / PDF_PAGE_LIMIT / PDF_PARSE_TIMEOUT | 显示原因并换文件 |
| 409 MATERIAL_NOT_READY | 不能加入问答 |
| 422 INVALID_SOURCE / INVALID_READING_POSITION / REVISION_REQUIRED | 修正数据并保留草稿 |
| 409 STATE_CONFLICT / REQUEST_ID_CONFLICT | 重新读取并合并 |
| 429 MODEL_BUSY | 等已有请求完成 |
| 503 MODEL_NOT_CONFIGURED / MODEL_RATE_LIMITED | 提示配置或额度/限流问题 |
| 503 MODEL_CONCURRENCY_LIMIT | 暂停同一密钥的其他模型任务后重试，保留问题 |
| 502 MODEL_AUTH_FAILED / MODEL_UNREACHABLE / MODEL_UPSTREAM_ERROR | 真实报错，保留输入 |
| 502 INVALID_CITATION / MODEL_INVALID_JSON / MODEL_TRUNCATED | 回答未通过校验，允许重试 |
| 504 MODEL_TIMEOUT | 超时提示，保留问题 |
| 403 ORIGIN_NOT_ALLOWED / HOST_NOT_ALLOWED | 修正本机来源或代理配置 |

前端必须按 response.ok 判断成功，不能只看 JSON 是否存在。所有模型输出、文件名、摘录和 error.message 均按纯文本呈现；Markdown 禁用原始 HTML。
