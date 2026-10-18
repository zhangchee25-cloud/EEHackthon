# 知页 UI 重构验收

日期：2026-10-18。数据模式分别记录，接口桩不代表真实后端通过。

## A · 基础系统

- 修改前检查点：`ee7155dae1069dfe0a083eb26a67c8d85e8cd7e1`，`codex/zhiye-ui-checkpoint-A`。
- 文件：tokens.css、ui.css、components/ui.tsx、main.tsx、styles.css、App.tsx、CardsPanel.tsx、PdfReader.tsx、scripts/ui-screenshots.mjs。
- 指定六色、4px间距、字号、通用按钮/输入/面板/徽标/反馈、Tooltip和Dialog基础。字体目前使用Inter优先的系统回退栈，未假称已下载Inter。
- `npm test`：10/10；`npm run build`：通过，保留既有Zod注释和大包提示。
- Playwright / Chrome：1440×900、768×1024、375×812；首页/工作台/指引9张，加窄屏助手2张；无页面横向溢出、无脚本异常，窄屏Tabs方向键通过。已查看三宽工作台截图。
- 截图：[A目录](screenshots/ui-refactor/A/)，测量：[report.json](screenshots/ui-refactor/A/report.json)。真实代理仍返回500，错误保持可见。Dialog交互将在C接入并验证。

## B · 布局与材料

- 修改前检查点：`b83f32ace35ddf827231b546344c1108ff1bf45a`。
- 文件：App.tsx、components/MaterialLibrary.tsx、PdfReader.tsx、LandingPage.tsx、styles.css、landing.css。
- 顶栏52px、目标栏40px；工作台使用flex/grid分配高度，上传CTA空态、会话材料列表、真实处理/失败反馈；首页统一为静态紧凑介绍。
- `npm test`：10/10；`npm run build`通过。三宽9张实际页面+2张助手截图，无文档横向溢出/脚本异常，已查看三宽工作台截图。
- 另在4174显式接口桩验证两份材料、选中切换、返回第2页、坏文件失败保留原材料；截图materials-fixture-1440.png。仅验证前端，不代表真实解析通过。
- 截图：[B目录](screenshots/ui-refactor/B/)，测量：[report.json](screenshots/ui-refactor/B/report.json)。默认4173真实入口仍显示HTTP500。

## C · AI、引用、卡片与反馈

- 修改前检查点：`8c3a7ef9e5992daf6e27b39ea3c1e4e5711ae12d`。
- 文件：App.tsx、CardsPanel.tsx、api.ts、styles.css、tests/api.test.ts、scripts/ui-flow.mjs。
- AI/用户理解徽标、请求Skeleton、可操作失败Alert、JSON错误保留HTTP状态、草稿确认Dialog、IME快捷键保护、非遮挡引用区域。
- `npm test`：11/11，新增JSON500状态与真实重试回归；`npm run build`通过。
- 默认真实入口三宽截图9张+助手2张，无文档溢出/脚本异常。另三宽各运行完整显式接口桩学习流程并截图：请求失败保留问题/重试、依据不足、PDF引用定位第2页、AI未改写禁存、Dialog取消及焦点返回、卡片编辑/复习/筛选、503保存失败本地保护/重试、Markdown内容、刷新恢复、首页往返草稿保留，全部通过。
- 已查看1440px回答、768px编辑、375px引用截图，引用区位于PDF下方，不遮盖页码。
- 截图：[C目录](screenshots/ui-refactor/C/)，实际入口：[report.json](screenshots/ui-refactor/C/report.json)，接口桩结果：[fixture-flows.json](screenshots/ui-refactor/C/fixture-flows.json)。成功流程仅证明前端，不证明真实AI或服务重启持久化。

## D · 全路由、响应式与可访问性

- 修改前检查点：`239b09620e2863a6024cb69aa553c81eceb7f896`。
- 文件：App.tsx、Site.tsx、CardsPanel.tsx、PdfReader.tsx、MaterialLibrary.tsx、ui.css、styles.css、tokens.css、index.html；新增playwright.config.ts、tests/ui.spec.ts；package.json/锁文件显式加入Playwright1.64.1、axe4.14.0及验收脚本；本地Inter字体与SIL许可；README及设计/计划文档同步。
- 修复直接进入流程锚点、跳过导航不改hash、引用焦点转入阅读区、卡片退出焦点、PDF滚动区键盘可达、窄屏下次目标入口。灰底徽标采用主文字色，强控件边框改为#858B95；不隐藏任何错误。
- 最终构建通过；单元测试11/11。Playwright三项目共12项全部通过（无跳过、无flaky），包括每宽的完整学习流程、全部实际hash入口、材料/失败/历史来源/恢复/长内容及自动WCAG AA检查。
- axe覆盖首页、真实断线工作台、接口桩空态、编辑、Dialog、回答/展开来源、已保存卡片；最终所检状态无自动违规。自动检查不等于完整WCAG认证；未使用真实iOS/Android设备或实体软键盘验证。
- D阶段41张截图：实际首页/工作台/指引三宽9张+窄屏助手2张；三宽接口桩错误/引用/回答/编辑/卡片/保存失败18张；长历史来源3张、Dialog3张、上传处理中3张、AI请求中3张。
- 已查看最终首页、1440px回答、375px引用及Dialog等截图；三宽无文档横向溢出。PDF放大滚动限于阅读容器，长标题/摘录折行。
- 记录：[D截图](screenshots/ui-refactor/D/)、[实际入口测量](screenshots/ui-refactor/D/report.json)、[Playwright JSON结果](screenshots/ui-refactor/D/playwright-results.json)。A/B/C/D共93张阶段截图，另有9张重构前基线截图。

## 保留能力及验证边界

| 能力 | 本轮验证 |
| --- | --- |
| PDF上传与解析入口 | 接口桩验证上传请求、处理中/就绪/422失败、旧材料保留；真实解析待后端 |
| PDF实际阅读/页码/缩放/兜底 | 实际PDF.js渲染接口桩提供的自制PDF、回源页序与HTTP500重试；原文件链接保留 |
| AI真实请求与引用 | 保留原/api/ask请求及校验；接口桩验证失败/重试/不足/段落引用跳页，真实模型与原文支持关系待后端 |
| 卡片改写/编辑/复习/筛选 | 三宽通过，未改写AI禁存、正文变更重置待复习、自检本人标记 |
| 阅读/目标/状态持久化 | 前端SaveQueue和存储键不变；保存失败草稿/重试、刷新恢复、冲突选择通过；服务重启磁盘持久化待后端 |
| Markdown | 下载实际内容检查正文、来源摘录、页码、版本、复习状态，草稿不混入 |
| API失败 | 默认入口真实HTTP500持续可见；JSON错误状态码已补齐，隔离503/502/422与PDF500重试通过 |
| 路由/响应式/键盘 | /、#home、#how-it-works、#study、#study/guide，1440/768/375px均检查 |

Python后端与docs/api-contract.md未修改，domain.ts及useStudyState.ts未修改。默认后端127.0.0.1:8000仍不可达，真实模型、解析和重启恢复不能宣称通过。接口桩只在8011+独立4174代理使用并明确显示测试标识，默认4173未替换为测试服务。

保留构建中的既有Zod注释和大包警告，未为消除提示变更框架或业务契约。Git主分支和用户暂存区未改动；每阶段快照通过独立临时index建立。审计期间出现的用户文件不纳入本次修改。
