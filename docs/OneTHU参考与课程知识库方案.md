# OneTHU 参考与课程知识库方案

核对日期：2026-10-18。参考仓库：[smartThise/OneTHU](https://github.com/smartThise/OneTHU)，固定提交 `56484fd91a49ae5304f2ac6a000c39928a6bbb67`。本次读取源码与文档，没有运行 OneTHU、登录真实账号、复制实现或完成导入。

## 已观察到的实现

| 源码 | 观察事实 | 本项目用途 |
| --- | --- | --- |
| [learn/client.ts](https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/packages/core/src/learn/client.ts) | `LearnClient` 接收 HttpClient；有 `getSemesterIdList`、`getCourseList`、`getFileList`；会话与 CSRF 检查、重连处理 | 参考学期／课程／文件列表的数据流程及解析；文件列表优先解析 `object`，兼容 `resultList` |
| [learn/urls.ts](https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/packages/core/src/learn/urls.ts) | 文件列表为 `kjxxbByWlkcidAndSizeForStudent`（默认 size=200）；文件下载为 `downloadFile?sfgk=0&wjid=…`；地址经 WebVPN 包装 | 作为上游请求依据，执行前实际验证；避免双重包装和目录截断未提示 |
| [learn/types.ts](https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/packages/core/src/learn/types.ts) | CourseFile 包含 id、courseId、title、uploadTime、downloadUrl、fileType、size 等 | 用学校稳定 ID 映射本机材料，不能按课程名或文件名充当唯一标识 |
| [桌面 clients.ts](https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/apps/desktop/src/lib/clients.ts) | `downloadLearnFile` → `downloadLearnUrl`；加 `_csrf`、携带相应 Cookie、调用 Tauri `invoke('download_file')` | 有实际下载代码，但不等于可以直接在现有 Vite 网页运行；下载适配放在本机后端 |
| [auth/session.ts](https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/packages/core/src/auth/session.ts) | CampusSession 已不承载完整登录状态机；注释和调用指向桌面 infoLib 登录链 | 不能只 import core 就认定学校登录已完成；优先验证可运行认证路径 |
| [http.ts](https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/packages/core/src/http.ts) | 注入 fetch、CookieJar、WebVPN 及重登录能力 | 若直接复用模块，要补宿主网络／会话适配；不把 Cookie 暴露到课程问答 |

这些文件证明上游包含相关实现，不能证明本项目当前账号可用，也未证明 OneTHU 已有本次需要的课程知识库、带出处问答、知识卡片和白板。后四项仍由本项目已有能力扩展。

## 推荐结构

```text
React：连接学校 → 学期／课程／文件 → 一键导入与结果
                    ↓ 本机 API
网络学堂适配器：授权会话 → 目录 → 文件下载
                    ↓ 原文件 + 上游课程／文件身份
现有 Python 材料服务：校验 → 唯一材料版本 → 逐页解析
                    ↓
课程知识库：课程关联 + 材料版本 + 片段 + 轻量检索
                    ↓ 仅当前课程、固定版本范围
现有模型服务扩展：带出处回答 → 服务端引用校验
                    ↓
知识卡片：本人改写 + 来源快照 + 复习状态
                    ↓ cardId 引用
单课程白板：节点位置 + 手动连线 + 持久化
```

不依赖 FreeBBS。优先保持现有 React + Python 运行方式；如果使用 OneTHU TypeScript 模块或桌面桥接，明确增加的运行依赖和启动方式，不把 Tauri 原生调用混进普通浏览器组件。

一键导入的产物必须直接注册到现有材料服务，而非仅保存在下载文件夹。课程知识库记录已就绪材料和未覆盖部分；多材料检索结果必须保留文件版本和页序。白板仅引用已保存卡片，不复制卡片正文。

## 实施前必须验证的三件事

1. 本人在本地完成学校登录，连接器能区分有效会话与登录页；二次认证按学校正常流程完成。
2. 真实返回一个学期、一门课程及其文件目录；成功下载一份有效 PDF，核对真实文件和页数。
3. 将该文件自动注册到本项目材料库，返回真实 materialId/versionId，能够通过原 PDF 接口读取。

通过后再扩展批次、失败重试、课程检索及白板。没有这三项的结果，不将学校接入标为完成。具体新增接口、分工、验收和时刻以[18:00 交付计划](../学习Agent-最后90分钟收尾计划.md)为准。

## 来源与复用许可

已读取 [LICENSE](https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/LICENSE) 和 [THIRD-PARTY.md](https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/LICENSES/THIRD-PARTY.md)。根许可为 MIT 文本加非商业等附加限制，第三方各自适用原许可；登录链涉及的 info-lib 还另有上游条款和授权范围。直接复制／修改分发前由执行人核对实际使用文件及本次活动适用条件，保留署名和条款，不把 OneTHU 的特定授权自动视为本队授权。

当前方案可参考数据结构、模块职责和观察到的接口行为；没有据此宣布复制整套代码或满足任何未核实的分发授权。实现和提交说明分别列明参考部分、本队新增适配、知识库、卡片与白板工作。
