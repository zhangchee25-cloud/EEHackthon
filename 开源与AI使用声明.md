# 队长汇总：《开源与AI使用声明》

507队使用React、PDF.js等通用依赖，参考Heptabase及21st.dev交互设计；在AI辅助下实现目标、材料阅读、引用核对、理解卡片、自检和导出。Git可见赛前初始提交及现场两次功能提交，另有未提交修改。当前缺后端与完整AI记录，真实闭环及部分来源未核实；不作原创度评分。

队长：杨坤烨；队员：杨坤烨、张弛衡、卢汕郗；作品：清大搭 THU O PAL；日期：2026年10月18日。

**收集状态：本文件已整理声明与来源核查；各 AI 开发窗口的全部历史记录及逐窗附件三答复尚未收齐。下文的文件核查与提示词不能替代完整对话。此状态须在原文收齐后更新。**

依据：选手手册第五节、附件二、附件三，以及队伍提供的附件原文。手册链接：<https://www.kdocs.cn/l/cjY5KOlufgFO>。

## 一、外部内容使用清单

以下范围为本次可见工作区。依赖版本依据 `frontend/package-lock.json` 与本机已安装包的元数据核对；普通依赖按模块合并说明，传递依赖的具体版本和许可仍以各自随包文件为准。

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
| [OneTHU](https://github.com/smartThise/OneTHU)，调研记录固定提交 `56484fd91a49ae5304f2ac6a000c39928a6bbb67` | 既有调研记录为 MIT 文本附非商业等限制，第三方另有条款；本次未独立复核 | `docs/OneTHU参考与课程知识库方案.md` | 网络学堂接入的调研参考；当前目录未见可运行的对应后端。若后续实际加入源码，须按具体文件补充复用与许可，不能统称无附加条件的 MIT |
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

上述是代码存在的证据，不等于最终集成验收通过。当前未交付真实后端，且本轮构建与测试有失败；网络学堂导入、多材料知识库、白板等合同或规划中的功能，不能仅因存在类型或接口定义而列为完成。

## 三、AI 使用及现场工作说明

AI 辅助范围包含方案与技术资料整理、前端代码和样式实现、接口约定、测试与验收材料、提交文档整理，具体采用内容须由各开发窗口完整记录核对。本次文档整理窗口使用 Codex 读取项目、核对手册与依赖、复核构建和测试、撰写四份提交文档；本窗口没有可用于证明其他窗口全部开发过程的完整历史。

AI 生成的代码或文案不应被写成队员逐行手写的成果。队员承担需求选择、交互取舍、运行核验、修改与最终采用责任；哪些文件由哪个窗口生成、各成员具体工作量、实际模型名称与额度来源，当前无法逐项核查，须在下方原文与队长汇总中补全。不能仅根据安装了某个工具推断其实际使用。

本轮核查结论：可确认前端文件、第三方依赖、Git 记录及部分历史验收材料存在；缺少最终冻结源码标识、真实后端和全部开发对话，无法完整核查现场原创过程与最终系统效果。**不提供原创度分数。**

## 四、Git 历史简述

当前可见历史包含 2026年10月17日的初始提交 `11ecab6`，以及 10月18日 16:00 的学习工作台提交 `34b1cbb`、16:44 的 UI 和课程学习更新提交 `1db2669`（时间为 UTC+08:00）。核查时工作区另有未提交修改，尚未形成覆盖最终提交包的冻结提交。

赛前初始提交不能全部算作现场开发；Git 时间来自本机记录，不能单独证明每行代码的开发时间或原创归属。最终提交前应记录实际冻结提交，并将后来加入的后端或其他代码纳入来源与 AI 记录核查；无需粘贴完整 Git 日志。

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
