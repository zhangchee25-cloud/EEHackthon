# A／B 本轮集成契约

版本：2026-10-18 / 18:00 交付。**这是独立开发的目标合同，新增接口尚未实现。**它替代 A 旧单文件契约与 B 分支同名契约中冲突部分。A、B 按本文独立开发，不修改本文；必须变更时由集成人统一记录版本，并通知双方，不各自改路径和字段。

A 仅写 frontend/ 与 A 验收记录；B 仅写 backend/、examples/ 与 B 验收记录。本文、总计划、根 README 和最终包由集成人维护（优先 C；没有 C 则 A 兼任，仅承担组装职责）。不要求 C 必须会写业务代码。

## 1. 通用与基础对象

前端统一访问同源 `/api`，正常入口代理 `127.0.0.1:8000`。成功看 HTTP 2xx；错误固定 `{error:{code,message,details?}}`，附加 requestId 可选。ID 是非空字符串、页序从 1 开始、时间 ISO 8601。测试桩必须显式返回 `mode:"test-fixture"` 并在页面显示。

```ts
type Scope = { materialId: string; versionId: string; title: string };
type Citation = { id: string; materialId: string; versionId: string; title: string;
  pageStart: number; pageEnd: number; quote: string };
type Material = Scope & { status: 'processing'|'ready'|'failed'; pageCount: number;
  warnings: string[]; error: string|null; fileUrl: string };
type Course = { courseId: string; semesterId: string; upstreamCourseId: string; name: string };
type Card = { id: string; courseId: string|null; title: string; body: string;
  sourceRefs: Citation[]; reviewStatus: 'to_review'|'self_checked';
  createdAt: string; updatedAt: string; selfCheckedAt?: string|null };
```

courseId 是后端稳定本地 ID，唯一映射学期＋上游课程；界面不自行拼接／推算。标题不作主键。额外响应字段允许存在，A 的 schema 至少保留后续写请求必需的字段，特别是 revision、activeCourseId、card.courseId。

## 2. 学校登录由 B 完整承接

- `GET /api/learn/status` → `{status:'disconnected'|'connecting'|'connected'|'needs_auth'|'error', message:string, loginUrl:'/api/learn/connect'}`。
- `GET /api/learn/connect` → **B 提供的本机 HTML 连接页**，承接登录、二次认证或启动受控本地登录流程；认证内部端点由 B 自己维护。连接成功后的事实以 status 为准。
- A 只用用户点击打开该相对路径的新页，并提供“刷新连接状态”；可在页面重新获得焦点时查询。A 不实现学校表单、Cookie、CSRF 或认证过程。
- 该页和所有敏感认证处理留在本机；认证状态和错误不能泄露凭据。B 的具体认证策略不改变 A 的接口。

## 3. 学期、课程、目录

- `GET /api/learn/semesters` → `{semesters:[{id:string,name:string}]}`。
- `GET /api/learn/courses?semesterId=…` → `{courses:Course[]}`。
- `GET /api/learn/courses/:courseId/files` → `{files:CourseFile[], complete:boolean, warnings:string[]}`。

```ts
type CourseFile = { fileId: string; courseId: string; title: string; fileType: string;
  sizeBytes: number|null; supported: boolean; unsupportedReason: string|null };
```

fileId 是当前课程可访问的上游文件标识。B 校验请求归属，不接受任意客户端下载 URL。complete=false 表示目录可能被截断，A 必须提示。supported 只表示类型与已知大小预检通过；实际下载／解析仍可失败，不能预先标 ready。

## 4. 批次导入

- `POST /api/learn/imports`，body `{courseId,fileIds:string[],requestId}` → HTTP 202 和 ImportBatch。
- `GET /api/learn/imports/:batchId` → ImportBatch。
- `GET /api/learn/imports?courseId=…` → `{batches:ImportBatch[]}`，供刷新恢复。
- `POST /api/learn/imports/:batchId/retry`，body `{itemIds:string[]}` → ImportBatch，只重试 failed／needs_auth 项；已成功项不重复执行。

```ts
type ImportItem = { itemId: string; fileId: string; title: string;
  status: 'pending'|'downloading'|'processing'|'ready'|'failed'|'needs_auth'|'unsupported';
  materialId: string|null; versionId: string|null; error: string|null };
type ImportBatch = { batchId: string; courseId: string;
  status: 'running'|'needs_auth'|'completed'|'partial_failed'|'failed';
  items: ImportItem[]; updatedAt: string };
```

完成后的数量以 items 状态计算，completed 表示所有选择项就绪；有不支持／失败项为 partial_failed，全部失败为 failed；等待本人认证为 needs_auth。同 requestId、同参数重试返回同批次，不同参数冲突。重启将中断项转为可重试失败或继续排队，不永久停在 downloading。A 在活动批次每 2 秒查询一次，终态停止；重连后显式重试待认证项。

## 5. 材料和问答

- 保留 `POST /api/materials`（multipart `file`）→ Material；同步解析完成才 ready，默认 100 MB，PDF 页数不限。单独上传可无课程关联。
- 保留 `GET /api/materials/:materialId/file`（原 PDF），`GET /api/materials/:materialId` → Material。
- `GET /api/courses/:courseId/materials` → `{course:Course,materials:Material[],warnings:string[]}`，只列该课程关联材料；成功导入后自动出现。
- `POST /api/courses/:courseId/ask`，body `{question,requestId,materialScope?:Scope[]}`。省略 materialScope 使用该课程当前已就绪材料集合；传入时固定所选合法版本，不接受其他课程材料。
- 保留 `POST /api/ask` 单文件请求 `{materialId,question,requestId?}`。

两种回答格式相同：

```ts
type Answer = { supported: boolean;
  answerSegments: {id:string;text:string;citationIds:string[]}[];
  citations: Citation[]; selectedScope: Scope[]; limitations: string[] };
```

selectedScope 为本次实际使用的材料版本集合。B 校验课程、版本、片段、摘录；A 校验引用属于返回范围且属于本次所选合法课程材料，并分别核对页序。supported=false 时空答案、空引用、非空 limitations。正文以纯文本呈现。请求失败保留问题，重试同请求复用 requestId；修改问题／范围使用新 ID。

## 6. 学习状态与卡片

`GET /api/state` 和成功 `PUT /api/state` 均返回完整状态：

```ts
type StudyState = { revision:number; activeCourseId:string|null;
  goal:string; nextStep:string;
  readingPosition:{materialId:string;versionId:string;page:number}|null;
  cards:Card[]; updatedAt:string|null };
```

PUT 提交完整状态且必须带当前 revision。首次 `{revision:0,activeCourseId:null,goal:'',nextStep:'',readingPosition:null,cards:[],updatedAt:null}`。B 给历史记录缺失的 activeCourseId／card.courseId 补 null，不丢原数据。保存成功返回 revision+1 和服务端确认的完整状态，**没有 saved:true 要求**。

A 保留全量 cards 再保存，不能因为只显示当前课而丢掉其他课程卡片。手写／原有独立材料卡片可 courseId=null；课程回答建卡带当前 courseId。B 验证非空 courseId、引用课程关联和已校验来源；修改正文重置待复习，服务端产生时间戳。

每种状态队列仅一个在途 PUT；接收成功响应后更新最新 revision，再提交期间积累的新编辑。409 返回 `STATE_CONFLICT` 和 `details.currentRevision`；A 保留草稿，重读并由用户选择／合并，不能盲目覆盖。

## 7. 白板

`GET /api/courses/:courseId/board` 和成功 `PUT` 返回：

```ts
type Board = { courseId:string; revision:number;
  nodes:{id:string;cardId:string;x:number;y:number}[];
  edges:{id:string;source:string;target:string;label:string}[];
  updatedAt:string|null };
```

首次 revision=0、空节点与线。PUT 提交当前 revision、nodes、edges，成功返回完整新 Board。路径 courseId 与响应保持一致。冲突 409 `BOARD_CONFLICT`；失败保留本地草稿。

B 验证节点卡片属于本课程、ID 唯一、坐标有限、边端点存在，原子保存。A 拖动结束后提交，不每次指针移动都写服务。移除节点及其连线不会删除卡片，正文仅从卡片数据读取。10 张卡片为本次验收样本。

## 8. 唯一交接流程

1. A、B 各自在自己的范围完成开发、自测和验收记录；A 使用显著标记的桩，B 使用真实 HTTP／学校／模型分别记录。
2. 17:20 各交一个候选提交或目录包。集成人在独立候选目录组装，保留 A 的 frontend/、B 的 backend/ 与 examples/；不直接互相整分支覆盖。
3. 集成人按 B README 启动本机后端，按 A README 启动前端，关闭测试桩模式。验证导入 → 多文件问答 → 卡片 → 白板 → 重启恢复。
4. 问题归属明确：请求或显示问题 A 修；下载、模型、存储和响应问题 B 修。双方修自己的文件，重新交付；集成人不临时替双方改业务。
5. 17:30 冻结后形成同一包和根 README；17:45 上传，18:00 前完成提交确认。未通过的必需项如实列出。
