# 队长汇总：《开源与AI使用声明》

507队使用React、PDF.js等通用依赖，参考Heptabase及21st.dev交互设计；在AI辅助下实现目标、材料阅读、引用核对、理解卡片、自检和导出。Git可见赛前初始提交及现场两次功能提交，另有未提交修改。最终已集成Python后端并完成真实学校导入、模型引用问答与重连验收；完整AI窗口历史仍未收齐，部分来源许可未核实，不作原创度评分。

队长：杨坤烨；队员：杨坤烨、张弛衡、卢汕郗；作品：清大搭 THU O PAL；日期：2026年10月18日。

**收集状态：本文件已整理声明与来源核查；各 AI 开发窗口的全部历史记录及逐窗附件三答复尚未收齐。下文的文件核查与提示词不能替代完整对话。此状态须在原文收齐后更新。**

依据：选手手册第五节、附件二、附件三，以及队伍提供的附件原文。手册链接：<https://www.kdocs.cn/l/cjY5KOlufgFO>。

## 一、外部内容使用清单

以下范围为本次可见工作区。依赖版本依据 `源码/frontend/package-lock.json` 与本机已安装包的元数据核对；普通依赖按模块合并说明，传递依赖的具体版本和许可仍以各自随包文件为准。

| 来源及版本 | 许可 | 用途与对应文件 | 复用方式、本队工作 |
| --- | --- | --- | --- |
| [React / React DOM](https://github.com/facebook/react)，19.3.1 | MIT | `frontend/src/`、`frontend/src/main.tsx` | 通用界面框架；本队编写页面、状态与学习流程，未声称原创该框架 |
| [PDF.js / pdfjs-dist](https://github.com/mozilla/pdf.js)，5.7.284 | Apache-2.0 | `frontend/src/components/PdfReader.tsx`、`frontend/scripts/copy-pdf-assets.mjs` | PDF 阅读独立模块；本队接入页序、缩放、来源跳页及本地资源打包；上游库未作为本队原创 |
| [Lucide](https://github.com/lucide-icons/lucide)，lucide-react 0.468.0 | ISC（包级元数据） | `frontend/src/components/`、`frontend/src/App.tsx` | 通用图标模块；选用图标并组合到本队界面，图标仍归原作者 |
| [Zod](https://github.com/colinhacks/zod)，4.6.7 | MIT | `frontend/src/domain.ts`、`frontend/src/api.ts` | 通用校验库；本队定义状态、材料、回答与引用规则 |
| [Inter](https://github.com/rsms/inter)，由 @fontsource/inter 5.2.8 提供 | SIL Open Font License 1.1 | `frontend/public/fonts/` | 使用 400/500/600 字重；保留 `Inter-LICENSE.txt`，字体无本队原创主张 |
| [Vite](https://github.com/vitejs/vite) 7.3.7、@vitejs/plugin-react 5.2.0；[TypeScript](https://github.com/microsoft/TypeScript) 5.9.3；[Vitest](https://github.com/vitest-dev/vitest) 3.2.7；[Playwright](https://github.com/microsoft/playwright) 1.64.1；[@axe-core/playwright](https://github.com/dequelabs/axe-core-npm) 4.14.0；@types/react 19.3.0、@types/react-dom 19.3.0 | Vite、插件、Vitest、类型包为 MIT；TypeScript、Playwright 为 Apache-2.0；axe 工具包为 MPL-2.0，所含组件保留各自许可 | `frontend/package.json`、配置、`frontend/tests/` 与脚本 | 构建、测试和可访问性检查工具；非本队核心业务实现 |
| [Heptabase Work with AI](https://wiki.heptabase.com/work-with-ai)，公开 Wiki 与界面截图；页面版本未核实 | 主应用及截图再分发许可未核实 | `frontend/src/App.tsx`、阅读与助手区；记录见 `docs/frontend-A交付与验收.md` | 交互设计参考；已有验收记录说明未复制主应用源码或品牌素材。本队按课程目标、改写卡片、自检与导出需求重新实现；截图再分发权不因可浏览而成立 |
| [21st.dev 组件选型](https://21st.dev/)，含 [Background Paths](https://21st.dev/@kokonutd/components/background-paths)、Sidebar、Cited Answer Chat Input、AI Sources、Vercel Tabs、ReUI Card、File Upload；固定版本未核实 | 选型记录载明部分页面标注 MIT；上传组件许可未核实；未逐项独立复核上游许可 | `docs/21st-UI选型.md` 中保留逐项来源；相关实现为 `frontend/src/components/`、`LandingPage.tsx` 和 CSS | 已有记录说明作为视觉与交互参考，使用现有 React、Lucide、原生 CSS 重新实现；没有引入这些组件的整套依赖。首页路径背景据记录为原创 SVG/CSS 实现 |
| [Free-BBS](https://github.com/Free-BBS) 相关架构调研；架构记录引用 agent 提交 `5fb7651c192d1034bc3a30022947d05994ec14e9` | 本次未核实相关仓库的完整许可 | `docs/FreeBBS接入顶层架构与预计代码结构.md` 及早期规划 | 属于架构与选题背景。当前目录未见 FreeBBS 主站或 agent 服务源码，不能把调研写成已集成的后端 |
| [OneTHU](https://github.com/smartThise/OneTHU)，调研记录固定提交 `56484fd91a49ae5304f2ac6a000c39928a6bbb67` | 既有调研记录为 MIT 文本附非商业等限制，第三方另有条款；本次未独立复核 | `docs/OneTHU参考与课程知识库方案.md` | 网络学堂接入的调研参考；最终 backend/learn.py 按协议行为独立实现Python适配，参考固定提交的URL、CSRF和目录字段；未复制其Tauri、登录或认证源码。不能将上游统称无附加条件的 MIT |
| iDunhuang 教学参考、论文白板原型 | 原始来源链接、版本与许可未核实 | `docs/iDunhuang项目代码结构与基础语句学习指南.md` 等调研资料 | 教学／候选参考；未取得原项目的完整对照证据，不能据此认定已复用或全部原创。最终加入原型代码时需补充来源 |

自制演示材料：`docs/acceptance/capacitors-self-authored.pdf`，生成器为 `frontend/tests/create-test-pdf.mjs`。现有验收记录将其标注为本队自制三页电容讲义；不随作品默认公开教师课件或学校账号中的资料。

`Context7-网站开发工具调研.md`、`Playwright-CLI-Skills-网站开发工具调研.md` 属于开发工具研究记录；仅凭调研文件不能认定实际调用过这些工具。其他上游版权、LICENSE、NOTICE 等随包要求应继续保留。

## 二、复用程度与本队实现

当前前端以 React、PDF.js 等通用模块构建，未取得完整外部作品与本队代码的逐文件对照证据，因此不作“零复用”或“全部从零原创”的保证。现有文件支持的本队业务实现包括：

| 内容 | 主要文件 |
| --- | --- |
| 本次目标、下次目标、阅读／助手工作台及专注模式 | `frontend/src/App.tsx`、`frontend/src/components/LandingPage.tsx`、CSS |
| 材料上传入口、问答请求、引用数据校验及跳页交互 | `frontend/src/api.ts`、`domain.ts`、`components/PdfReader.tsx`、`components/SourceList.tsx` |
| AI 草稿改写、理解卡片、复习标记及 Markdown 导出 | `frontend/src/components/CardsPanel.tsx`、`domain.ts` |
| 保存队列、失败提示、本机草稿保护及恢复交互 | `frontend/src/hooks/useStudyState.ts` |
| 自制 PDF、接口测试桩、单元测试与浏览器验收脚本 | `frontend/tests/`、`frontend/scripts/` |

最终状态（18日提交前更新）：已交付 backend/learn.py、course_store.py、courses.py 及服务与状态扩展，完成学校导入、多材料问答和课程白板。后端48项、前端17项、桌面/移动UI 12项通过，生产构建通过；真实学校HTTP15项、重连7项、隔离包9项通过，真实学校材料问答20项检查通过。上述是各自范围验收，WebVPN、Mac实机、学校限流和10卡规模仍未完成实测。此前失败属于开发过程记录，不作为最终状态。详见源码/docs/B-验收记录.md及A记录。

## 三、AI 使用及现场工作说明

AI 辅助范围包含方案与技术资料整理、前端代码和样式实现、接口约定、测试与验收材料、提交文档整理，具体采用内容须由各开发窗口完整记录核对。本次文档整理窗口使用 Codex 读取项目、核对手册与依赖、复核构建和测试、撰写四份提交文档；本窗口没有可用于证明其他窗口全部开发过程的完整历史。

AI 生成的代码或文案不应被写成队员逐行手写的成果。队员承担需求选择、交互取舍、运行核验、修改与最终采用责任；哪些文件由哪个窗口生成、各成员具体工作量、实际模型名称与额度来源，当前无法逐项核查，须在下方原文与队长汇总中补全。不能仅根据安装了某个工具推断其实际使用。

最终核查结论：可确认前后端源码、第三方依赖、部分Git及验收记录存在，交付源码逐文件SHA-256固定；缺少其他队员全部开发窗口对话，无法完整核查全队现场原创过程。**不提供原创度分数。**

## 四、Git 历史简述

前期文档整理时可见历史包含 2026年10月17日的初始提交 `11ecab6`，以及 10月18日 16:00 的学习工作台提交 `34b1cbb`、16:44 的 UI 和课程学习更新提交 `1db2669`（时间为 UTC+08:00）。核查时工作区另有未提交修改，尚未形成覆盖最终提交包的冻结提交。

赛前初始提交不能全部算作现场开发；Git 时间来自本机记录，不能单独证明每行代码的开发时间或原创归属。最终前端基于zch 04c1baac加本地联调修复，后端基于lsx 4ad7865加本轮实现；未将全部最终修改推送GitHub，以提交包及SHA-256清单固定源码，后端与AI自查见后附原文；无需粘贴完整 Git 日志。

## 五、各 AI 开发窗口的全部历史记录

**当前：尚未收齐。以下是收集位置，不是已经完成的记录。**

请全体队员逐一登记实际使用过的开发窗口，不以三名队员为由只保留三个窗口；包括方案、编程、调试、界面、测试、集成、文档等实际参与作品开发的对话。每个窗口在最终源码冻结后，手动发送本文件末尾的附件三原文，随后把该窗口从第一条到最后一条的所有交互及自查答复按原顺序复制到此处。只删除或遮盖密钥、账号凭据及个人敏感信息，使用 `[已脱敏：信息类别]` 标记，不以摘要替代历史，不删去失败、纠正或“无法核查”的内容。

| 窗口编号 | 使用者、平台及实际模型 | 工作范围 | 全部历史／附件三答复状态 |
| --- | --- | --- | --- |
| DOC-01 | 使用者待登记；Codex；具体模型以原始记录为准 | 本次四份提交文档整理 | 待在本窗口结束后复制全部原文及手动自查答复 |
| 其余窗口 | 待三位队员逐窗登记，可继续增加行 | 方案、前端、后端、调试、测试、集成等 | 待收齐，不以此行代替记录 |

### 窗口 DOC-01：本次提交文档整理

使用者：待登记。平台：Codex。起止时间：以原始导出为准。

<!-- DOC-01_FULL_HISTORY_START -->
【待粘贴：本窗口全部历史原文，包含用户消息、AI 答复、可导出的工具交互、附件三原文及该窗口的实际自查答复。】
<!-- DOC-01_FULL_HISTORY_END -->

### 其他开发窗口：逐窗增加本节

窗口编号／使用者／平台及模型／工作范围／起止时间：待据实填写。

<!-- OTHER_WINDOWS_FULL_HISTORY_START -->
【待粘贴：各窗口分别标明边界后，按原顺序粘贴全部历史与各自附件三答复。不得将多窗口摘要写成完整记录。】
<!-- OTHER_WINDOWS_FULL_HISTORY_END -->

## 附：附件三统一自查提示词（按队伍提供的原文收录）

以下代码块内文字供各实际开发窗口手动原样发送。仅收录提示词不代表已在各窗口执行，也不代表已收齐全部历史。

```text
请对我们的这个作品进行开源使用与原创度自查。
请只核查这个最终提交并用于现场展示的项目，不要把其他练习项目当作参赛作品，也不要仅凭我的口述下结论。
按以下格式回答：
一、外部内容使用清单
列出作品借鉴或使用的开源项目、模板、代码片段、素材，以及对核心设计有明显影响的教程或其他参考。逐项说明来源链接、在作品中的用途、我们修改了什么。查不到的链接、版本或许可证写“未核实”，不要编造。普通依赖库可合并说明。
二、复用程度
说明每项开源内容是作为独立模块接入、作为起步模板修改，还是已经构成作品的主要功能或整体框架。指出对应文件。特别检查：是否只是给已有完整项目换了界面、名称或少量文案。
三、本队现场完成的工作
结合项目文件和全部AI对话，说明本队现场提出、设计、开发、修改和集成了哪些核心功能。AI在现场生成的代码请单独说明；正常使用AI工具和通用依赖本身不算抄袭。
四、Git历史简述
如果能访问Git记录，用几句话概括现场开发期间的主要提交和功能变化即可，不要粘贴完整日志。若没有Git记录或时间无法核实，直接说明，不要补造开发过程。
五、原创度自评
针对最终作品相对于已有项目、模板新增的实质工作，给出0—100分的参考分数、主要依据和可信度（高／中／低）。区分“有文件或记录支持的事实”和“仅由队伍陈述的内容”。若无法访问最终源码，或明显缺少关键开发对话，不要给分，说明需要补充什么。
最后生成一段不超过200字的《开源与AI使用声明》，供队伍提交：写明主要引用来源、复用方式、本队新增的核心内容、Git历史简况及仍未核实的部分。不要输出API密钥、账号凭据或对话中的个人敏感信息。
```


## 最终后端补充与记录收集边界

本轮主窗口及子Agent使用Codex生成/修改学校Python适配、课程持久化、中文词项检索、多材料引用校验、卡片与白板一致性、HTTP路由、测试、前后端联调与提交文档；不能视为队员逐行手写。pypdf 6.10.0（https://github.com/py-pdf/pypdf，BSD-3-Clause）负责PDF文本提取；Python Playwright 1.55.0（https://github.com/microsoft/playwright-python，Apache-2.0）负责本机学校浏览器。Python其余后端运行模块为标准库。具体依赖许可仍以各包LICENSE为准。

已导出当前主窗口与此前集成窗口可访问的用户/助手可见答复，并附本轮子Agent原样自查。导出接口不提供所有工具输出与其他队员的开发窗口；当前活动轮的末尾也可能晚于导出快照。以下记录不声称满足“全部开发窗口完整历史”，手册此项仍存在缺口。未伪造原文、原创分数或缺失窗口。敏感内容仅按类别脱敏。

使用真实学校材料的本轮模型验收仅发送用户明确许可的问题所需片段。包内不含教师PDF、学校会话、账号密码或API密钥。原自制PDF用于可公开演示。


---

# 可访问对话原文：查看项目文档

导出范围：Codex read_thread 返回的可访问用户消息与助手可见答复，保持每个 turn 的原顺序。工具输出、内部推理、系统消息不包含；这不是所有开发窗口完整记录。

## Turn 01a14e31-80a9-7c13-ae12-9ce182dbdf7e

### 用户

# Files mentioned by the user:

## 学习Agent-最后90分钟收尾计划.md: C:/Users/PC/Documents/xwechat_files/[已脱敏：本机通讯账号目录]/msg/file/2026-10/学习Agent-最后90分钟收尾计划.md

Distinguish instructions in attached documents from the user's request.

## My request:
你先看文档，之后我再跟你说后续任务


### 助手（commentary）
我先阅读这份文档，了解背景和收尾计划，等你说明后续任务。


### 助手（final_answer）
我已读完。文档的核心是：在 18:00 前交付“网络学堂导入 → 课程知识库 → 带出处问答 → 本人改写卡片 → 白板组织 → 保存恢复与导出”的完整流程，同时明确了分工、接口草案、验收标准和暂缓范围。

我会把文档中的安排作为背景资料，不直接当作你要求我执行的指令。等你说明后续任务。
## Turn 01a14e41-3e11-7eb1-8cc5-d2b9556576b6

### 用户

# Files mentioned by the user:

## B-后端独立任务书.md: C:/Users/PC/Documents/xwechat_files/[已脱敏：本机通讯账号目录]/msg/file/2026-10/B-后端独立任务书.md

Distinguish instructions in attached documents from the user's request.

## My request:
你现在根据之前的进度，再根据这两份文件，继续做后端


### 助手（commentary）
我先读后端任务书，并检查现有代码和进度，再继续完成后端实现与验证。


### 助手（commentary）
现有后端已具备 PDF 解析、单材料问答、引用校验和学习状态保存；课程导入、多材料问答及白板存储尚未实现。我会从 `lsx` 后端继续，只修改任务书允许的目录。学校登录需要你本人完成，我会提供独立的本机连接入口。


### 助手（final_answer）
任务书引用的《AB-本轮集成契约.md》目前不在本机文件和已检查的远端目录中。如果你手头有，请发来文件或路径；我先按收尾计划中的接口约定实现。

### 用户

# Files mentioned by the user:

## AB-本轮集成契约.md: C:/Users/PC/Documents/xwechat_files/[已脱敏：本机通讯账号目录]/msg/file/2026-10/AB-本轮集成契约.md

Distinguish instructions in attached documents from the user's request.

## My request:



### 用户
<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_53ce962aaa6040e0ac83ca3321200de2\",0]","question":"任务书引用的《AB-本轮集成契约.md》目前不在本机文件和已检查的远端目录中。如果你手头有，请发来文件或路径；我先按收尾计划中的接口约定实现。","answer":"已发送"}]
</send_user_message_question_reply>


### 助手（commentary）
收到集成契约，接口路径和字段已明确，后端会按它实现。原有 16 项测试全部通过。接下来先接通本机登录页和学校目录，再完成批次导入、课程问答与白板存储；学校和模型的真实验收会分别记录。


### 助手（commentary）
课程身份映射、导入批次持久化、中文检索和课程白板存储已写入，正在接 HTTP 接口并测试。多材料引用现在保留各自的文件版本和页序，卡片来源也会检查课程归属。


### 助手（final_answer）
后端已在 http://127.0.0.1:8000 启动，并已打开独立 Edge 学校登录窗口。请你本人完成登录和二次认证，进入网络学堂课程列表后回复“已登录”。若未看到窗口，可打开 http://127.0.0.1:8000/api/learn/connect；校外可选择 WebVPN。不要把密码或验证码发到对话里。

### 用户
<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_20b2315d53b241d78784ea95161844dd\",0]","question":"后端已在 http://127.0.0.1:8000 启动，并已打开独立 Edge 学校登录窗口。请你本人完成登录和二次认证，进入网络学堂课程列表后回复“已登录”。若未看到窗口，可打开 http://127.0.0.1:8000/api/learn/connect；校外可选择 WebVPN。不要把密码或验证码发到对话里。","answer":"已登录"}]
</send_user_message_question_reply>


### 助手（commentary）
你已完成登录，但后端还未识别到学校会话，我正在修正连接识别逻辑。新增测试中，批次失败重试、多材料引用、中文检索、白板冲突和恢复检查已通过；学校接入还需要真实接口验证。


### 用户
能不能开几个子AGENT分别干不同部分，时间来不及了


### 助手（commentary）
可以。我现在拆成三个子 Agent：分别负责课程问答、状态与白板、验收与交付文档。我继续处理学校登录和真实导入，并做最终联调；各自限定文件范围，避免相互覆盖。


### 助手（final_answer）
已修复学校把 CSRF 放在脚本／链接中的兼容问题，并重新打开登录窗口。刚才的临时会话随后端重启关闭，需要你在新窗口再登录一次；进入课程列表后回复“已登录”。这次连接识别支持学校的多种页面格式。

### 用户
<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_d8bb1a61b4ba4d1eb4a801b9085b2b18\",0]","question":"已修复学校把 CSRF 放在脚本／链接中的兼容问题，并重新打开登录窗口。刚才的临时会话随后端重启关闭，需要你在新窗口再登录一次；进入课程列表后回复“已登录”。这次连接识别支持学校的多种页面格式。","answer":"已登录"}]
</send_user_message_question_reply>


### 用户
再开一个子Agent把前端合并进去（zch分支）


### 助手（commentary）
学校连接已验证成功，后端拿到了真实学期数据，我继续验证课程目录和 PDF 自动入库。

收到合并要求。我会让专门的子 Agent 在 `integration` 中合入 `zch` 前端，再接入本轮后端候选。


### 助手（commentary）
真实学校链路已跑通：读取到了 4 个学期、当前学期 10 门课，以及电路原理课程的文件目录；两份讲义已自动下载、解析并入库，批次状态为 `completed`。

前端合并子 Agent 也已启动。现在继续核对去重、原件读取，以及最新后端与前端的联调。


### 助手（final_answer）
真实课程的两份 PDF 已完成本机自动入库。为验收“课程综合问答”，是否允许将这两份讲义中检索到的相关片段发送给你已配置的模型平台 api.muzeai.top（gpt-6.1-sol）？学校账号、Cookie 和密码不会发送。先前自动审批曾要求对课程讲义外发明确授权；其余本机验证和合并继续进行。
- 允许，仅发送本次问题所需片段
- 只用自制材料验收模型

### 用户
<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_f8c353bba68f4d19b6418208b8bdcecc\",0]","question":"真实课程的两份 PDF 已完成本机自动入库。为验收“课程综合问答”，是否允许将这两份讲义中检索到的相关片段发送给你已配置的模型平台 api.muzeai.top（gpt-6.1-sol）？学校账号、Cookie 和密码不会发送。先前自动审批曾要求对课程讲义外发明确授权；其余本机验证和合并继续进行。","answer":"允许，仅发送本次问题所需片段"}]
</send_user_message_question_reply>


### 助手（commentary）
后端完整测试已通过 43 项。真实学校验收也通过了 15 项检查，包括两份 PDF 的原件与页数核对、重复导入去重，以及成功项不重复处理。

`zch` 最新前端已合入候选目录，17 项前端单测通过，正在验证页面流程。课程材料的真实模型问答已按你的授权启动，仅发送本次问题所需片段。


### 助手（commentary）
真实课程综合问答已通过：实际发送约 5,142 字相关片段，回答引用覆盖两份讲义，5 条出处均与原 PDF 页码和摘录匹配，并明确说明了材料缺少直接比较证据的部分。

3 张带来源卡片、3 个白板节点和 2 条连线的 HTTP 保存及测试服务重启恢复也已通过。现在收尾统一候选、页面验证和交付包。


### 助手（commentary）
统一候选包已生成，排除了凭据、学校会话和私人课件；后端包的 9 项隔离启动检查全部通过。最新结果是后端 48 项、前端 17 项单测、12 项桌面/手机流程全部通过。

我现在重启最终后端候选，核对已导入课程和批次恢复，并补测本人重新登录后继续导入。前端可在 [学习空间](http://127.0.0.1:5173/#study) 打开。


### 助手（final_answer）
最终候选已重启，2份课程材料和完成批次均已恢复；新的学校登录窗口已打开。请再由你本人登录一次，回复“已登录”，我会验证待认证批次能继续并完成最后打包。这次是最终候选的重启／重连验收。

### 用户
<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_ac6b8d1fbf204786b563bc095d2fa6a2\",0]","question":"最终候选已重启，2份课程材料和完成批次均已恢复；新的学校登录窗口已打开。请再由你本人登录一次，回复“已登录”，我会验证待认证批次能继续并完成最后打包。这次是最终候选的重启／重连验收。","answer":"已登录"}]
</send_user_message_question_reply>


### 用户
[https://www.kdocs.cn/l/cjY5KOlufgFO](https://www.kdocs.cn/l/cjY5KOlufgFO)
做完上述工作之后，按照这个文档里面的提交要求，提交项目


### 助手（commentary）
收到。我先完成最后的重连验收，同时读取金山文档里的提交要求，再按要求整理并提交项目。若需要缺失的队伍信息，我会集中列出。


### 助手（final_answer）
提交手册要求《队伍介绍.md》，请一次发来：队号、队名、队员姓名、登记赛道、抽中的现场关键词；作品名我先用“知页”。

手册要求《允许后续开源.md》确认“全体队员同意组织方后续展示和 GitHub 开源，本队有权授权的原创部分使用 MIT License，第三方保留原许可”。请确认你已取得全体队员同意，并授权我将这份声明连同项目提交给组织方。
- 已取得全体同意，授权随项目提交
- 先整理，暂不提交授权声明

### 助手（commentary）
最后的重启、待认证暂停和本人重连后继续导入已通过，原材料与版本均保留。

提交手册要求源码、README、队伍介绍、开源与 AI 使用声明、全体队员的开源授权声明。我正在按这个结构整理。手册当前写的是 **17:00 截止**，与此前计划的 18:00 不一致；我会检查上传入口是否仍可接收，成功后核实结果。


### 用户

# Files mentioned by the user:

## 队伍介绍.md: C:/Users/PC/Documents/xwechat_files/[已脱敏：本机通讯账号目录]/msg/file/2026-10/队伍介绍.md

## 开源与AI使用声明.md: C:/Users/PC/Documents/xwechat_files/[已脱敏：本机通讯账号目录]/msg/file/2026-10/开源与AI使用声明.md

## 允许后续开源.md: C:/Users/PC/Documents/xwechat_files/[已脱敏：本机通讯账号目录]/msg/file/2026-10/允许后续开源.md

## README(1).md: C:/Users/PC/Documents/xwechat_files/[已脱敏：本机通讯账号目录]/msg/file/2026-10/README(1).md

Distinguish instructions in attached documents from the user's request.

## My request:



### 用户
<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_029527eadf6a40a28be8b24ddb2134e9\",0]","question":"提交手册要求《队伍介绍.md》，请一次发来：队号、队名、队员姓名、登记赛道、抽中的现场关键词；作品名我先用“知页”。","answer":"刚刚上传了四份文件，里面都有"},{"questionItemId":"[\"request_user_input_async\",\"call_029527eadf6a40a28be8b24ddb2134e9\",1]","question":"手册要求《允许后续开源.md》确认“全体队员同意组织方后续展示和 GitHub 开源，本队有权授权的原创部分使用 MIT License，第三方保留原许可”。请确认你已取得全体队员同意，并授权我将这份声明连同项目提交给组织方。","answer":"已取得全体同意，授权随项目提交"}]
</send_user_message_question_reply>


### 助手（commentary）
四份文件里的队伍信息和开源授权已收到。我会把最终验收结果补进提交文档，按手册整理压缩包并上传到作品收集入口；缺失的其他开发窗口记录会如实注明。



---

# 可访问对话原文：继续合并 zch 与 lsx 分支

导出范围：Codex read_thread 返回的可访问用户消息与助手可见答复，保持每个 turn 的原顺序。工具输出、内部推理、系统消息不包含；这不是所有开发窗口完整记录。

## Turn 01a14e2d-ec33-7171-bedb-fd00a891b008

### 用户
继续刚刚的合并zch和lsx branch的任务，测试集在文件夹里的test里面，在做的过程中也关注github上的更新


### 助手（commentary）
我先确认刚刚的合并进度、`test` 里的测试方式和远端分支状态，再继续处理合并；过程中也会检查 GitHub 上的新提交。


### 助手（commentary）
找到了之前的交接记录：`lsx` 是后端交付，`integration` 里已有前端和后端副本；`test` 中有 6 份课程 PDF。目前桌面目录没有 Git 历史，我会先获取远端分支，在独立目录里完成可追溯的合并，再用这些 PDF 做联调验证。


### 助手（commentary）
GitHub 上的分支头目前仍是 `zch: 34b1cbb`、`lsx: 4ad7865`。后端 16 项测试和前端 10 项测试已通过。Git 直连失败，但 GitHub API 可用，我会继续通过 API 核对分支内容，并保留两条分支的提交历史。


### 助手（commentary）
6 份 PDF 都能解析，共 218 页；其中 5 份的末页没有可提取文字，系统会保留提示。之前的整合副本已把页数上限调到 50 页，能覆盖这些讲义。我也确认了需要保留的接口修复：回答范围改为数组、按 `revision` 保存状态，以及显示后端返回的具体错误。接下来验证真实前端客户端与后端的完整流程。


### 助手（commentary）
真实模型测试被自动审批拦截：审批要求明确授权将这 6 份课程讲义发送到配置的外部模型平台。我会先完成本机上传、阅读、保存和重启恢复验证，以及合并交付；真实问答测试留待最后确认。


### 助手（commentary）
检查 GitHub 时发现 `zch` 刚新增了 `1db2669`，包含新版 UI、材料列表和错误提示。我会把这次更新纳入合并，保留最新界面和已有接口修复。刚完成的 6 份 PDF 本机联调全部通过，上传、原件读取、分页请求、去重、保存冲突检测和重启恢复均正常。


### 用户
先暂停合并吧，还有一项后端任务要做


### 助手（final_answer）
已暂停合并，现有改动保留在 `integration`，已纳入 `zch` 最新更新，尚未推送或合入远端。

你把后端任务发来，我们先处理那项。


---

# 子窗口原样自查附件：本窗口自查-B交付.md

# 本窗口自查：B 后端交付与验收

日期：2026-10-18。范围：本并行子 Agent 窗口可见的任务、工具结果与修改。本文不声称审查了其他窗口的完整对话，也不代替团队授权、全量对话附件或提交人最终自查。以下五项按主窗口转达的提交自查格式整理。

## 一、外部内容清单、链接与许可

| 外部内容 | 链接／依据 | 本窗口许可核查状态 |
| --- | --- | --- |
| OneTHU 学校接口行为参考 | https://github.com/smartThise/OneTHU/tree/56484fd91a49ae5304f2ac6a000c39928a6bbb67 ；许可 https://github.com/smartThise/OneTHU/blob/56484fd91a49ae5304f2ac6a000c39928a6bbb67/LICENSE | 本窗口只见团队参考记录称MIT文本另有非商业等附加限制，未独立核验；不宣称已获任意复制授权，也未复制其实现 |
| Python依赖 pypdf／Playwright | https://pypi.org/project/pypdf/ ；https://pypi.org/project/playwright/ | 依赖版本见 `backend/requirements.txt`；本窗口未逐条核实许可证 |
| React、Vite、TypeScript、Zod、PDF.js、Lucide等前端依赖 | https://www.npmjs.com/package/react ；https://www.npmjs.com/package/vite ；https://www.npmjs.com/package/typescript ；https://www.npmjs.com/package/zod ；https://www.npmjs.com/package/pdfjs-dist ；https://www.npmjs.com/package/lucide-react | 版本及完整传递依赖见前端package-lock；本窗口未逐条核实许可证 |
| Inter字体 | https://www.npmjs.com/package/@fontsource/inter ，来源声明见 `frontend/public/fonts/README.md` | 本窗口观察到来源声明，未审查完整字体授权文本 |
| 学校教师PDF | 本人本机网络学堂，非公开下载链接 | 仅授权本机导入与指定片段模型验收；不纳入提交源码，不推断有权公开或开源原课件 |
| 用户附件任务书／AB契约／README(1).md | 用户在本会话提供的本机附件 | 用于项目要求与提交说明，权利与公开范围由用户／集成人确定 |

## 二、复用程度与对应文件

本窗口接续已有后端和已有集成前端，没有从零独立重写整个作品。已有 `backend/service.py`、`storage.py`、`server.py`、`learn.py`、`courses.py`、`course_store.py` 与前端业务来自本队其他开发窗口；本窗口仅维护说明、打包／验收工具并参数化已有学校模型验收脚本。前端保留zch基线 `04c1baac` 及本地联调修改，后端记录lsx基线 `4ad7865`；源码包以逐文件SHA-256确定实际内容。OneTHU仅作协议行为参考，第三方Python/npm依赖直接调用，不将其实现计为本队原创。

## 三、本队现场工作与本窗口AI生成

本窗口可核实的现场任务为：整合固定契约与安装说明、实现本机学校HTTP验证、验证重复导入和重连继续、修订源码白名单并隔离启动验证、参数化私人ID、组装源码候选与记录风险。其他窗口的学校协议适配、模型引用校验、课程存储、前端工作由主窗口汇总，不冒称为本窗口独立完成。

本窗口AI辅助生成单列：README与验收记录文字；`verify_school_live.py`；`package_handoff.py`与`tests/verify_handoff.py`修改；`verify_school_course_qa.py`参数化修改；`assemble_candidate.py`收录AB契约的白名单一行修改；正式提交根README与本自查。以上通过相应工具检查后由团队作为提交内容采用，AI参与不等于免除团队核查责任。

## 四、Git简述

本机根目录没有可用Git元数据，`git rev-parse HEAD` 实际失败，故本窗口没有伪造新提交、提交次数或作者统计；未commit、push或创建PR。主窗口提供的基线号用于说明来源，最终可复现版本采用源码包SHA-256清单。候选哈希列于本文“最终候选”。

## 五、原创评分

**不给分。** 本窗口未取得全部开发窗口的关键完整历史对话、所有来源许可核查与完整Git历史，缺少评分所需关键证据；因此不报原创百分比或分数。可核实的本窗口贡献与AI生成内容已分别列明，其他来源与全队整体原创度由主窗口依完整记录自查。

## 200字声明

本记录仅覆盖本并行窗口可见的任务、文件和工具结果，不代表其他窗口或全部开发历史。我们列出已有代码、外部依赖、接口参考与AI辅助生成内容；无法核实的许可、历史和整体原创比例均保留说明，不虚构分数。本窗口未读取学校密码、验证码或Cookie，未将教师原课件、密钥、会话及个人数据打入源码包。真实学校验证与模型测试分别记录，测试桩不冒充真实服务。公开展示、后续开源和第三方授权以全体队员确认及完整声明为准。

## 本窗口完成的工作

- 阅读用户提供的《AB-本轮集成契约.md》《B-后端独立任务书.md》，据其范围维护 B 后端 README、无凭据环境示例、显式源码白名单打包、隔离验收脚本与 `docs/B-验收记录.md`。
- 新增 `backend/verify_school_live.py`：本人已登录后仅调用本机 HTTP，核对学期／课程／目录、两份原 PDF 签名与页数、重复导入去重、请求重放与 ready 项重试不重复处理。
- 根据主窗口授权完成主演示后端重启后的本人重连验证：确认批次待认证，显式重试后完成，复用原材料和版本，课程材料总数不增加；未再次重启主演示后端。
- 将 `backend/verify_school_course_qa.py` 中私人课程／材料 ID 改为必须显式传入的 CLI 参数，问题可由 `--question` 指定；只运行参数化脚本的 CLI 检查，没有重新调用真实模型。
- 维护后端候选源码包并运行隔离验证；通过 assembler 复制后端／记录到 integration，未修改前端业务源码。将 AB 契约列入统一候选包，最终检查 ZIP 与清单哈希。

## 可复核证据

| 项目 | 本窗口实际观察 |
| --- | --- |
| 真实学校 HTTP | 15 检查通过；4 学期、目标学期10课程、目标课程26文件且目录完整；2 PDF 页数8／7 |
| 去重与幂等 | 第二批相同文件复用原 material/version；课程仍2材料；同requestId同批次；ready项重试不重复处理 |
| 主演示重启与本人重连 | 7 检查通过；旧批次和材料恢复，新批次2项待认证，本人登录后显式继续完成 |
| 隔离后端包 | 9 检查通过；35个白名单文件；无凭据启动、原PDF解析、完整进程重启后状态／材料恢复 |
| 完整离线回归 | 主窗口转达最终48项全过；本窗口早先39项运行发现1项worker清理竞争并反馈，主窗口修复后重跑 |
| 学校真实模型与卡片白板 | 主窗口及QA窗口转达20检查通过；本窗口检查到对应脚本与私有报告，不声称由本窗口重新调用模型 |
| 前端 | 主窗口转达zch基线17单测、12UI、构建与真实契约只读验证通过；本窗口未亲自执行前端测试 |

私有学校报告仅保存在本机 `backend/test-results/`，不进入提交源码包。报告包含课程／文件／材料身份，仅用于本人本机复核，不在本文复述身份 ID 或原课件文本。

## AI 使用与来源核对

本窗口使用 Codex Agent 辅助撰写 Python 验收／打包工具、README与验收记录，使用工具执行本机检查及打包。未自行选择或切换其他模型；真实平台问答由另一已获授权窗口执行。本窗口没有向第三方发送学校材料片段。

本人负责学校账号登录与二次认证。本窗口没有读取或记录密码、验证码、Cookie、CSRF 或学校认证页面，没有把凭据放入源码。后端源码原有 OneTHU 固定版本协议参考声明得到保留；本窗口未复制 OneTHU 源码。Python／前端依赖由原清单保留，其许可由团队最终核对，不能仅凭本窗口推断全部依赖已完成开源合规审查。

候选包采用显式路径白名单，不递归打包 `vendor/`、`data/`、真实 `.env`、报告、日志、教师原 PDF、node_modules 或会话。只附自制 PDF 示例。最终统一候选 ZIP 已检查完整性、全部 SHA-256 清单、AB 契约、参数化模型脚本，并扫描未发现本轮三个私人学校课程／材料 ID。

## 最终候选

- `backend/deliverables/zhiye-integrated-candidate.zip`
- 87个清单文件，281310字节。
- SHA-256：`7a3eed5f5327f327ad92e12b8f3f73feb51521b52952fe39f4081f788826bc1b`。
- 后续正式提交封装会改变外层包哈希；以上哈希只标识该统一源码候选。

## 保留项

学校限流、WebVPN、macOS实机以及十张卡片白板样本未验收，不标记成功。本人重连7检查包含重启后待认证和继续导入，不冒称所有网络失效方式均已覆盖。本窗口未取得全体队员开源同意，也未代为上传或正式提交；队伍信息、全量对话、后续开源授权与手册最终逐条审查由主窗口及用户确认。


---

# 子窗口原样自查附件：本窗口自查-主集成.md

# 主集成窗口自查答复

## 一、外部内容使用清单

最终作品前端以React/React DOM、PDF.js、Lucide、Zod、Inter、Vite等通用依赖构建，版本与出处见队伍原始声明和源码锁文件。Python后端以pypdf（https://github.com/py-pdf/pypdf，BSD-3-Clause）提取文本、Playwright（https://github.com/microsoft/playwright-python，Apache-2.0）控制本人学校登录浏览器，其余为Python标准库。

学校协议参考OneTHU固定提交56484fd91a49ae5304f2ac6a000c39928a6bbb67（https://github.com/smartThise/OneTHU/tree/56484fd91a49ae5304f2ac6a000c39928a6bbb67）。参考URL、CSRF提取及课程目录字段，由本窗口AI另行实现Python适配，未复制Tauri、登录认证代码；上游许可含附加条件，完整适用性未核实。Heptabase/21st.dev交互参考由前端原始声明登记；本窗口未逐一核验其许可。早期FreeBBS/iDunhuang属于设计调研，不应描述为已运行的集成后端。

## 二、复用程度

React提供前端框架，PDF.js为阅读独立模块，pypdf为文本提取独立模块，Playwright为浏览器控制工具。本窗口接续队内lsx后端基线并合并队内zch前端04c1baac。新增学校适配在backend/learn.py，身份/导入持久化在course_store.py、courses.py，多材料问答/引用约束在service.py，课程卡片/白板一致性在storage.py，路由在server.py。文件支持存在实质新增功能；未取得全项目与所有可能外部模板逐行对照的证据，不作“绝无复用”保证。当前证据不支持“仅换名或界面”的判断。

## 三、本队现场完成的工作

用户提供后端任务书、AB契约、集成前端要求，亲自进行学校登录、课程片段外发授权与全员开源授权。本窗口AI及子Agent实现学校连接、CSRF多形态兼容、课程目录、串行批次、去重/新版本/失败重试、重启恢复、中文检索、多材料严格引用、课程白板与卡片一致性，以及前端联调、自动化验收和交付文档。以上AI生成与修改不可记为队员逐行手写。基线前后端由何成员逐行实现须核对各原开发窗口，本窗口不推断个人工作量。

最终记录：后端48项测试、前端17项与12项桌面/移动UI测试、生产构建通过；学校HTTP15项、重连7项、隔离包9项通过。自制材料模型检查与学校两材料模型引用验证分别记录，后者20项检查通过。三个卡片和三节点/两边的HTTP与重启恢复完成；没有10卡、WebVPN或Mac实机成功的证据。学校与模型实测报告包含私人课程内容，仅本机保存，不纳入提交包。

## 四、Git历史简述

现有集成以前端zch 04c1baac、后端lsx 4ad7865为基线，并添加本轮未推送修改；较早前端历史见队伍原始声明。最终以压缩包逐文件SHA-256固定内容，不把打包时间当作开发时间，也不伪造覆盖所有代码的最终提交记录。

## 五、原创度自评

有文件/测试支持新增学校接入、持久化、引用校验和课程白板等事实；队员分工、早期方案与所有原开发过程仍缺关键完整AI窗口对话，依统一提示词不提供0—100分。可访问的用户/助手答复与本轮子Agent自查随附，不能替代全部窗口完整历史。需队伍补充其他窗口原始记录和未核实来源许可。

## 200字以内声明

本队使用React、PDF.js、pypdf、Playwright等通用依赖，参考Heptabase、21st.dev交互及OneTHU学校协议，未复制其登录代码。AI协助新增学校导入、多材料引用问答、理解卡片、课程白板与持久化，并完成联调测试。源码基于队内zch/lsx分支加本地修改，以哈希清单固定；全部AI窗口历史及部分参考许可仍未核实，不作原创评分。


---

# 子窗口原样自查附件：本窗口自查-课程问答.md

# 本窗口自查：课程问答

核查日期：2026-10-18（北京时间）。本窗口只报告亲见源码、测试输出及本窗口对话可支持的结论；本次未运行模型、未读取或输出凭据、未摘录教师原文。

核查对象为最终组装候选 `backend/deliverables/zhiye-integrated-candidate.zip` 及其对应 `integration/frontend/`、当前 `backend/` 源码，不把根目录其他练习或旧包计入参赛作品。核查时该 ZIP 有 88 个条目，SHA-256 为 `7a3eed5f5327f327ad92e12b8f3f73feb51521b52952fe39f4081f788826bc1b`；后续重新组包时须更新身份。本窗口确认包中有课程问答测试、学校课程验收脚本和 Inter 许可，未见 `backend/data/`、真实 `.env`。本说明是本窗口证据，不能代替各窗口汇总后的完整自查。

## 一、外部内容使用清单

| 外部内容与来源 | 在最终作品中的用途、改动及核实程度 |
| --- | --- |
| [OneTHU](https://github.com/smartThise/OneTHU/tree/56484fd91a49ae5304f2ac6a000c39928a6bbb67) | `backend/learn.py` 文件头明确记载参考固定提交中的学校接口端点、字段和流程；本地 `integration/docs/OneTHU参考与课程知识库方案.md` 记载读取过 `urls/client/types` 等文件。当前 Python 适配器实现本机浏览器会话、课程目录和导入流程，未见导入 OneTHU/Tauri/info-lib 模块。固定提交及“独立实现、未复制”的来源是代码注释和既有记录，本窗口没有取回上游逐行比对。上游许可的独立复核为“未核实”：既有文档提示根许可有附加限制，不能仅写成无条件 MIT。 |
| Python 标准库；[pypdf](https://pypi.org/project/pypdf/)、[Playwright](https://pypi.org/project/playwright/)、[ReportLab](https://pypi.org/project/reportlab/) | `backend/requirements.txt` 固定 pypdf 6.10.0、Playwright 1.55.0；开发依赖要求 ReportLab >=4,<5。分别用于 PDF 解析、受控本机浏览器和自制测试 PDF，未见修改依赖源码。当前运行环境元数据确认 pypdf 6.10.0 为 BSD-3-Clause，ReportLab 4.4.9 标注 BSD；Playwright Python 包的本地许可元数据本窗口未核实。标准库承担 HTTP、SQLite、线程、JSON 等。 |
| [React](https://www.npmjs.com/package/react)、[Zod](https://www.npmjs.com/package/zod)、[PDF.js](https://www.npmjs.com/package/pdfjs-dist)、[Lucide](https://www.npmjs.com/package/lucide-react) | 最终前端 `package.json`、`src/App.tsx`、`src/domain.ts`、`src/components/PdfReader.tsx` 等显示：React 组织界面，Zod 校验契约，PDF.js 阅读和跳页，Lucide 提供图标；未见修改依赖源码。本地安装包元数据分别为 React/ReactDOM 19.3.1 MIT、Zod 4.6.7 MIT、pdfjs-dist 5.7.284 Apache-2.0、lucide-react 0.468.0 ISC；这些是本地元数据证据，完整传递依赖许可尚未逐项核查，最终安装版本以包内锁文件为准。 |
| Vite、TypeScript、Vitest、Playwright Test、axe-core 等普通开发依赖（来源见最终 `frontend/package.json` 与锁文件） | 分别用于开发构建、类型检查、单元测试、浏览器验收与无障碍检查，没有作为课程产品整体模板接入。本地元数据为 Vite 7.3.7 MIT、TypeScript 5.9.3 Apache-2.0、Vitest 3.2.7 MIT、Playwright Test 1.64.1 Apache-2.0、axe-core/playwright 4.14.0 MPL-2.0；传递依赖及分发义务尚未逐项核实。 |
| [Inter](https://github.com/rsms/inter)、[@fontsource/inter](https://www.npmjs.com/package/@fontsource/inter) | `frontend/public/fonts/README.md` 记载来源为 @fontsource/inter 5.2.8，使用 Latin 400/500/600 三种字重；`tokens.css` 引用字体，中文使用系统回退。原字体未见修改；包内保留 `Inter-LICENSE.txt`，正文为 SIL OFL 1.1。字体来源版本是本地说明记录，本窗口未对上游字体二进制做哈希比对。 |
| FreeBBS 前期方案参考：[freebbs-web](https://github.com/Free-BBS/freebbs-web/tree/a51f90fd6e4b6637a6b595c88686003847a64b31)、[freebbs-agent](https://github.com/Free-BBS/freebbs-agent/tree/5fb7651c192d1034bc3a30022947d05994ec14e9) | 既有架构文档引用这两个固定版本，表明它们影响过前期接入设想。最终 README 明确未接入 FreeBBS，当前后端 import 和前端依赖中未见其模块；不能据此前期文档认定实际复用了它们的实现。是否曾复制过片段、上游许可及前期对设计的具体影响，本窗口未核实。 |

额外模板、整套起步项目、直接复制的代码片段、付费素材、具体教程：本窗口未找到可独立验证的新增来源记录，统一记为“未核实”，不能据此宣布绝不存在。`examples/signals-systems-demo.pdf` 的生成路径有 `backend/make_demo.py`、`tests/fixtures.py` 支持，本窗口亲自使用过自制样本；教师材料仅作为获授权的本地验收输入，不属于源码包内原创素材。

## 二、复用程度

- 学校接口部分属于参考接口行为后编写本机适配器，对应 `backend/learn.py`；已有记录不支持“接入 OneTHU 完整项目”这一说法，但本窗口未做上游相似性扫描。
- React、PDF.js、Zod 等为独立通用模块；PDF.js 构成阅读器底层能力，Playwright 构成浏览器自动化底层能力，不能把这两项底层能力表述为本队原创。产品业务由 `backend/courses.py`、`course_store.py`、`service.py` 及前端课程、卡片和白板组件组合实现。
- 前端确实以 React/Vite 生态构建，但当前可见证据不足以确认最早是否使用某个额外界面模板；项目名、页面布局和本地组件本身不能证明模板来源。
- 本窗口亲见课程问答归属、引用校验、幂等、检索范围和隔离验收的实质代码改动，故不能将本窗口工作描述成只改名称或文案。对于整件作品是否由完整外部项目换皮而来，当前未见支持证据；因缺少最早基线与全部对话，也不能给出排除一切复用的保证。

## 三、本队现场完成的工作

**有本窗口直接记录支持的事实：**用户要求并行完成后端，本窗口受分工负责课程问答。现场由 AI 编写并修改 `backend/courses.py` 中课程问答的请求校验、材料范围规范化、重复请求判定及实际 `selectedScope`；修改 `backend/service.py::verify_answer`，拒绝未知材料、错误或缺失版本、越界页码、重复片段及编造摘录。新增 `backend/tests/test_course_qa_extra.py` 的 8 项回归。本窗口实际运行当时的 32 项后端回归并全部通过；此数字属于当时源码快照，不能代替之后最终版完整测试数字。

本窗口还由 AI 编写 `backend/verify_school_course_qa.py`，在只读备份的临时副本和随机 HTTP 端口中验证限定片段问答、两文件出处、重复请求、三张卡片、三节点两条线和重启恢复；亲见自制两 PDF 的真实模型验证，以及获明确授权的学校材料必要片段验证。后者外发上下文为 5142 字符、预算 6500，核对五条引用；19 项核心检查及修复 SQLite 句柄后的清理检查共 20 项通过。此处只报告统计，不提供教师原文、私人 ID 或凭据。SQLite 清理缺陷也由本窗口 AI 修复，未因此重复调用模型。

**只能由源码和其他窗口记录支持、并非本窗口亲历全过程的部分：**学校认证适配、批次导入与去重、稳定课程映射、状态冲突与白板原子保存、前端阅读器和完整界面、最终集成与交付脚本。对应文件存在，`docs/B-验收记录.md` 记录最终 48 项回归及其他验收，但本窗口未亲自执行这些后续全量步骤。本窗口不能把它们全部归为自己完成，也不能逐项确认人工成员与其他 AI 的贡献比例。

AI 使用单独说明：本窗口上述代码、测试、验收脚本和本自查由 Codex AI 在现场依据用户与集成分工指令生成或修改；用户负责目标、授权及本人认证，集成窗口负责契约、合并与最终交付。AI 生成不等于人手逐行编写，也不自动证明未含第三方相似实现。正常使用 AI、通用依赖和明确引用的接口参考不应单独视为抄袭。

## 四、Git 历史简述

实际开发目录 `C:/Users/PC/Desktop/EE Hackathon` 无可用 `.git` 元数据，本窗口不能还原它的现场提交序列。集成 README 记载前端 `04c1baac`、后端 `4ad7865` 等基线，但本窗口没有对应仓库日志证据，故这些只能视为集成记录，不能补造为亲自核实的历史。另一个目录的空 Git 仓库不是最终作品的开发历史，不纳入结论。当前可核验的是候选包 SHA-256、包内清单及本窗口可见改动和测试记录，不是完整 Git 时间线。

## 五、原创度自评

**本窗口不给 0—100 分。**最终源码可访问，且本窗口实质新增工作有代码和对话支持；但最早起步源码、所有关键开发窗口的完整 AI 对话、外部源码相似性与上游许可的独立复核仍不齐全，符合“明显缺少关键开发对话时不要给分”的条件。对“本窗口存在实质新增”的可信度为高；对“全队整体原创比例”的可信度为低，无法据此推算整件作品分数。

需汇总各窗口自查与完整关键对话、确认起步基线及其来源、补查 OneTHU 等实际参考文件的许可与代码复用边界后，再对最终同一哈希版本统一评分。任何“完全原创”“未复制任何片段”的队伍口述，在没有对应记录前均不能升级为本窗口已证实事实。

## 《开源与 AI 使用声明》（不超过 200 字）

本作品使用 React、Python、pypdf、PDF.js、Playwright 等通用库，学校接口行为参考 OneTHU，字体使用 Inter。团队与 AI 在现场完成课程导入、限定范围问答、出处校验、卡片白板及保存恢复等工作。本窗口无可核验的完整 Git 提交历史；部分早期来源、上游许可和跨窗口完整对话仍待汇总核实，未据此宣称全部原创。


---

# 子窗口原样自查附件：前端集成-自查.md

# 前端集成窗口自查

范围：只依据本窗口可见对话、工具结果及当前 `integration/` 最终源码；不是全队全部对话或完整开发过程审计。本窗口负责前端合并、契约适配和验证，不据其他窗口转述替其认定原创。以下文件均相对最终候选 `integration/`。本次只新增本记录，未修改代码或服务。

## 一、外部内容使用清单

| 外部内容与来源 | 最终用途 / 对应文件 | 许可核查情况 |
| --- | --- | --- |
| React / React DOM：https://github.com/facebook/react | `frontend/package.json`、`src/**/*.tsx`，组件框架与渲染 | 本机安装包 package.json 标注 MIT；未逐文件审计上游版权 |
| Lucide：https://github.com/lucide-icons/lucide | `frontend/src/App.tsx`、各组件图标 | 安装包标注 ISC；图标是外部资源，不计本队绘制 |
| PDF.js：https://github.com/mozilla/pdf.js | `frontend/src/components/PdfReader.tsx`、`scripts/copy-pdf-assets.mjs`，PDF解析/渲染、worker、CMaps、字体和WASM资源 | 安装包标注 Apache-2.0；附带资源各自条款未在本窗口逐项复核 |
| Zod：https://github.com/colinhacks/zod | `frontend/src/domain.ts`、`api.ts`，接口字段与关联验证 | 安装包标注 MIT |
| Inter / Fontsource：https://github.com/rsms/inter；https://www.npmjs.com/package/@fontsource/inter | `frontend/public/fonts/*.woff2` | 已读本地 `Inter-LICENSE.txt`：SIL OFL 1.1；README注明Fontsource 5.2.8来源 |
| Vite / Vitest：https://github.com/vitejs/vite；https://github.com/vitest-dev/vitest | 构建与单元测试配置 | 安装包均标注 MIT |
| TypeScript：https://github.com/microsoft/TypeScript；Playwright：https://github.com/microsoft/playwright | 类型检查、浏览器测试；Python Playwright用于学校受控浏览器 | 前端安装包标注 Apache-2.0；Python分发许可本窗口未另核 |
| axe-core Playwright：https://github.com/dequelabs/axe-core-npm | 前端可访问性测试依赖 | 安装包标注 MPL-2.0；不作为本队原创 |
| pypdf：https://github.com/py-pdf/pypdf；ReportLab：https://www.reportlab.com/ | `backend/pdf_worker.py`提取PDF；开发依赖用于样本 | requirements明确依赖；本窗口未读取对应安装包许可证，许可未核实 |
| OneTHU：https://github.com/smartThise/OneTHU/tree/56484fd91a49ae5304f2ac6a000c39928a6bbb67 | `backend/learn.py`头注明确参考其learn客户端/URL端点和字段，现为Python适配；详见`docs/OneTHU参考与课程知识库方案.md` | 文档记载MIT文本加非商业等附加限制，另有第三方条款；本窗口未独立复核实际上游许可及活动适用性，不能声称无条件MIT或已获完整授权 |
| 21st.dev视觉/交互参考：https://21st.dev/@kokonutd/components/background-paths；https://21st.dev/@shadcn/components/sidebar；https://21st.dev/@dhxwhy/components/cited-answer-chat-input；https://21st.dev/@elements-/components/sources；https://21st.dev/@yadwinder/components/vercel-tabs；https://21st.dev/@sean0205/components/card | `docs/21st-UI选型.md`记录视觉思路，对应首页、侧栏、问答输入、来源、标签与卡片布局；最终源码使用现有React/CSS | 文档记载当日详情页标注MIT；本窗口未打开上游核许可，也未做完整源码相似度比对，不能据文档直接认定完全未复制 |
| 上传布局参考：https://21st.dev/@ephraimduncan/components/file-upload-04 | 同上文档记载仅参考布局 | 文档称页面未显示许可；本窗口未核实，不能主张可复制分发 |
| 清华网络学堂：https://learn.tsinghua.edu.cn | `backend/learn.py`访问的外部学校服务；课程PDF属于用户获准访问的材料 | 本窗口未取得教材公开分发许可；不将其算原创内容。本人只执行过只读响应契约检查 |

补充：`frontend/package-lock.json`含间接依赖，上表不是全部传递依赖的逐包法律审计。`@types/react`、`@types/react-dom`、`@vitejs/plugin-react`也在package.json中，具体许可本窗口未逐一读取。系统中文字体使用运行环境回退，没有作为字体文件在本窗口新增。

## 二、复用程度与“整项目换皮”检查

- 框架/工具复用：React、PDF.js、Zod、Lucide及构建测试工具直接作为依赖使用。PDF解析、渲染内核和图标不能宣称为本队自研。
- 队内已有前端复用：本窗口直接复用zch分支前端，覆盖`frontend/src/App.tsx`、`api.ts`、`domain.ts`、`hooks/useStudyState.ts`、`components/{LearnImport,Whiteboard,CardsPanel,MaterialLibrary,PdfReader,SourceList,StudyTabs,ui}.tsx`及CSS、测试。它们不是本窗口从零生成；其更早来源仅凭本窗口不能完整认定。
- 视觉参考与业务实现：最终`App.tsx`连接真实课程/材料/问答API，`useStudyState.ts`处理revision串行保存与409恢复，`Whiteboard.tsx`存储节点/边，`backend/learn.py`、`service.py`有实际学校适配、材料和状态业务。最终依赖中未引入shadcn、Tailwind、Radix或Motion；这一点不证明全部界面代码均独立原创。
- 整项目换皮核查结论：本窗口未执行、也未观察到将第三方完整成品替换名称后提交的操作；可见改动涉及真实课程数据、引用校验、状态并发、卡片与白板和端到端验证，超出品牌文字/样式更换。但没有全部早期对话、仓库历史和上游全量源码比对，不能排除更早阶段的整包复用，更不能出具“全项目100%原创”结论。

## 三、本队现场工作与AI生成单列

本窗口能直接证明的现场工作：读取AB契约；从zch最新提交下载前端，按原候选与新版进行合并审查；处理API、状态、材料库与测试等冲突；修复课程刷新默认回首份PDF的问题，恢复已选文件及页码；核对状态/白板保存revision必须恰好加1；将浏览器测试启动方式改为Windows/Linux兼容；补充真实后端只读契约测试与课程阅读恢复测试；更新A验收记录和启动说明。保留原候选已有真实材料联调测试并补courseId字段，默认不运行真实材料/模型写入测试。

AI生成/修改：上述本窗口的合并脚本、代码修复、测试补充、说明与本自查均由AI助手生成或修改；现有zch前端中的AI参与比例，本窗口证据不足，不作量化。本窗口没有宣称这些文字或代码为队员手工逐行独立编写。

直接执行的验证：17个前端单测通过；12个桌面/手机隔离桩流程通过；TypeScript/Vite构建通过；前端同一API客户端对真实8000服务进行1个只读契约用例通过。隔离桩覆盖导入/问答/卡片/白板流程，但不等于真实学校、真实模型或后端重启验证。本窗口没有把真实学校材料发往模型，亦未以其他窗口报告替代自己的验证。

## 四、Git历史简述

本窗口最初候选记录的zch基线为`1db26693d66a7d203834abc4fd0257cf47e7c891`。通过GitHub只读API确认zch最新为`04c1baaca3ba90a8bd2aba320a4b4da583962e86`，比较结果显示新增1个提交，提交信息为`add sth`，包含课程导入、白板、契约与验收等前端更新。本窗口只取前端和A验收记录，未整分支覆盖后端；合并后修改留在本地候选，未推送、未创建PR。更早完整提交链、各提交作者与实际编写者关系、其他分支全部历史未在本窗口独立核验。

## 五、原创度评分

不评分。缺少本项目关键的全部对话、完整早期开发记录与逐源许可/代码相似度核验，不能给出可信的百分比、等级或原创度分数。以上是证据范围声明，不是对全项目来源作最终裁定。

## 声明（200字以内）

本项目使用开源框架、PDF工具、字体及视觉和学校接口参考。本窗口完成zch前端合并、契约修复与测试，相关代码和文档有AI参与。所列结论仅基于本窗口证据；未核实许可已注明，不把依赖、课程材料或队内既有代码宣称为本窗口原创。缺少完整开发记录，故不提供全项目原创度评分。


# 本轮追加声明（AI白板版 v2）

# AI白板与直接建卡更新

本轮根据队伍要求新增：

- AI回答可以直接创建卡片，不要求修改正文；仍可先编辑再创建。
- 新AI卡片标记origin=ai、默认待复习；本人主动标记已自检。旧卡片无来源记录时为unknown。
- 课程白板输入生成要求（可留空使用默认），AI依据当前课程已就绪材料生成最多8个概念卡片及有依据的关系。展示预览后一次创建卡片、节点和连线，追加到已有图。
- 手动连线可以直接在节点点击“从这里连线”，再点击另一节点“连接到这里”；可填写关系说明，避免重复连线。
- PDF闪动修复随本版一并交付：完成重绘后替换画布、固定滚动条占位、加载提示悬浮。

## 接口补充

`POST /api/courses/:courseId/board/generate`：请求包含requestId、可选instruction与materialScope。返回previewId、courseId、cards、nodes、edges、selectedScope、limitations。卡片和节点ID由服务端生成；引用按真实片段、材料版本和摘录校验。生成仅保存预览，不修改当前学习状态或白板。

`POST /api/courses/:courseId/board/apply`：请求包含previewId、stateRevision、boardRevision；返回state和board。在同一个SQLite事务中追加卡片和图结构，任一版本冲突返回409并保留预览供刷新后重试。重复应用同一previewId不会重复追加。预览、卡片与白板可随本机数据库恢复。

卡片增加可选origin字段：ai、manual、unknown；保留旧客户端兼容。来源标识不表示内容已被用户核实。

## 真实模型验证

以自制Signals and Systems讲义验证，未外发学校课件。实际模型生成3张卡片、2条关系线。11项检查通过：有引用的生成结果、AI来源与待复习状态、预览不改学习状态、生成重试、原子应用、两个revision推进、重复应用无重复卡片、状态与白板重开数据库恢复。首次请求收到502，后续请求成功；不能承诺模型平台始终可用。

引用摘录与来源归属由代码校验，概念解释和关系含义仍需用户核对；模型无依据时可不生成关系。自动化界面测试使用显著标记的合成接口桩，与上述真实模型验收分开记录。

## 演示

进入已有材料的课程 → 课程白板 → AI生成白板 → 查看预览 → 创建卡片并加入白板。可直接点击两张卡片的连线按钮添加关系。问答结果下点击“直接创建卡片”，无需人为改写。

本轮实现由Codex主窗口和后端、白板界面、直接建卡三个子Agent协作完成；完整其他历史窗口记录的缺口仍沿用原声明，不伪造原创评分。

最终本轮回归：后端58项通过；前端20项单测、20项桌面/手机UI回归通过；生产构建通过。真实模型自制讲义11项验证通过。

主窗口及三个子Agent分别负责集成/契约/真实模型验收、后端原子生成应用、白板交互、AI直接建卡。新增代码由AI辅助生成，来源依赖不变。GitHub main已发布前版，并在本轮继续提交。前述“未推送”仅为原提交时记录。历史审计内容原样保留，不代表更新后仍强制改写。
