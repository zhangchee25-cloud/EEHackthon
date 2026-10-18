# 知页全站 UI 重构计划与文件范围

日期：2026-10-18。**用户已确认执行，A–D已实施；逐阶段检查点、文件与验证见 docs/UI_REFACTOR_ACCEPTANCE.md。**

## 执行边界

基于现有 React/Vite/CSS 渐进修改，保留全部实际路由和现有业务组件。保持 Python 后端、API契约、载荷、状态模型和localStorage键兼容。允许在前端完善 HTTP 错误展示，不通过隐藏错误或替换测试数据制造成功。

材料库受现有接口限制：先提供本次会话真实材料列表、当前项恢复、处理和失败反馈；不声称具备服务器完整历史列表。新增“列出全部历史材料”不在本次 API 不变的范围内。

## Git 检查点与每阶段交付

1. 阶段开始前复查工作区；本轮进入时55个暂存变更已在审计期间进入新HEAD `34b1cbb`，本轮未执行提交。使用独立临时 Git index 与 `codex/zhiye-ui-checkpoint-A/B/C/D` 检查点引用保存已审查文件快照，记录提交 SHA；不改原暂存区，不重置或丢弃已有内容，不切换当前分支。快照排除密钥、依赖、构建产物和运行数据。
2. 只实施当前阶段范围；共享组件的必要调用替换允许触及业务页面，不改业务契约。
3. 运行 `npm test` 与 `npm run build`；运行与变更相关的浏览器交互回归。
4. 每阶段至少对首页、工作台、指引入口在1440/768/375px截图。视口建议1440×900、768×1024、375×812；空态、错误及该阶段相关成功/编辑状态另补截图，明确真实后端或隔离测试桩。
5. 检查层级、长文本、文档横向溢出、局部滚动、键盘、焦点、状态播报、禁用态、触摸入口。记录修改文件、检查点 SHA、命令结果、截图路径与未验证项。

不把已有测试桩通过当作真实后端成功。真实服务不可用时继续完成可独立验证的界面与前端交互，最终报告真实链路待联调。

## 阶段 A：设计系统、全局样式、基础组件

实施内容：指定六色、语义状态色、Inter/中文字体回退、字号、4px间距、圆角、控件尺寸、焦点和减少动画。整理现有CSS并抽出小型基础组件，先统一视觉基础；沿用现有Tabs键盘逻辑。Dialog/Tooltip先完成基础能力，C阶段接入草稿交互。

修改：

- frontend/src/tokens.css、frontend/src/styles.css：完整token与通用规则，消除散落硬编码。
- frontend/src/main.tsx：仅在基础样式独立拆分时调整导入。
- frontend/src/components/StudyTabs.tsx：统一样式和可访问关系。
- frontend/src/App.tsx、components/{LandingPage,PdfReader,CardsPanel,SourceList}.tsx：必要的基础控件接入，业务行为保持。
- 新增 frontend/src/components/ui.tsx、frontend/src/ui.css：Button、Input/Textarea、Panel、Badge、Alert、Toast、Tooltip、Dialog、Empty/Loading/Skeleton/Error薄封装；不重复实现Tabs或引用列表。
- 条件新增 frontend/public/fonts/Inter*.woff2 和字体许可：仅有合法可交付资源时本地部署，系统回退始终可用。
- DESIGN_SYSTEM.md：同步实际变量和组件用法。

验证：构建、原10项测试；三宽截图；表单标签、按钮状态、键盘焦点、Tabs与基础Dialog焦点返回。不会为纯颜色或间距写镜像式单元测试。

## 阶段 B：导航、三栏结构、材料与空态

实施内容：紧凑品牌/面包屑/保存/导出；目标信息栏；主工作台高度分配；清晰材料行和真实状态；PDF工具栏和上传CTA空态；首页/流程使用相同视觉语言；保留专注和面板切换。

修改：

- frontend/src/App.tsx、frontend/src/styles.css：布局、目标、导航、材料、连接Alert、引导结构。
- 新增 frontend/src/components/MaterialLibrary.tsx：从App提取材料显示与上传入口；只显示已确认的真实材料，当前选择有明确语义。
- frontend/src/components/PdfReader.tsx：工具栏、空态上传回调；保留PDF.js加载/渲染、onPage、onLoaded和原文件兜底。
- frontend/src/components/LandingPage.tsx、frontend/src/landing.css：首页去装饰和紧凑化，保留实际入口和流程示意标识。
- frontend/src/Site.tsx：仅在锚点恢复/前进后退问题复现时做小范围修正；保留工作台挂载机制。

验证：三栏/双栏/窄屏切换，材料展开、专注、助手开关；真实断线Alert和禁写；空态CTA；真实上传返回后的材料选择。隔离测试可验证前端处理/失败状态，成功解析需真实后端。

## 阶段 C：AI、引用、理解卡片与反馈

实施内容：紧凑推荐问题和输入；清晰的提问范围、请求中与失败重试；AI草稿与理解区分；编号与来源；不遮挡阅读的摘录；卡片改写、复习、导出、确认Dialog；统一成功与错误播报。

修改：

- frontend/src/App.tsx、frontend/src/styles.css：问答、引用详情、状态与操作反馈。
- frontend/src/components/{CardsPanel,SourceList,StudyTabs}.tsx：卡片、确认、筛选、来源与焦点。
- frontend/src/components/ui.tsx、frontend/src/ui.css：依据实际场景完善变体。
- frontend/src/api.ts：仅补充实际HTTP状态与说明的错误呈现；不改请求与校验协议。
- frontend/tests/api.test.ts：针对JSON HTTP500、非JSON错误和重试所需上下文的有效回归。
- frontend/src/domain.ts、hooks/useStudyState.ts作为重点回归对象，默认不改；若界面接入暴露数据风险，先记录证据再做必要修复。

验证：问答失败保留问题；真实引用与页序；历史来源不改范围；AI草稿未改写禁存/改写可存；编辑正文重置待复习；自检/筛选；保存失败重试与草稿恢复；Markdown实际下载内容。真实模型与引用支持关系仍需真实材料验证。

## 阶段 D：全路由、响应式和验收记录

实施内容：所有实际hash入口、直接打开与返回；1440/768/375px主要状态；长文件名/长摘录/长回答/多卡片；窄屏输入和滚动；键盘与触摸；完整保留功能回归。

修改：

- 必要的 frontend/src/{Site,App}.tsx、components/*.tsx、styles.css、landing.css、ui.css，限于已复现缺陷。
- 新增 frontend/playwright.config.ts、frontend/tests/ui.spec.ts：可复现的截图/交互验收；Vitest继续只运行原*.test.ts。
- frontend/package.json、frontend/package-lock.json：显式声明已验证兼容的Playwright测试依赖和脚本，解决当前“本机有、锁文件无”的复现问题；不顺便升级框架。
- 新增 docs/UI_REFACTOR_ACCEPTANCE.md、docs/screenshots/ui-refactor/{A,B,C,D}/：逐阶段证据、真实/测试模式、文件列表、测试结果与限制。
- frontend/README.md：更新实际启动/验收说明；原历史验收记录保留，不改写旧事实。

浏览器回归从A阶段即运行；D阶段将已跑通的检查整理为项目内可复现配置，不等到最后才开始截图。若环境不可用，明确说明受阻项，不宣称截图验收完成。

## 不纳入的修改

Python服务与API契约、鉴权/登录、课程目录等新增页面、完整服务端材料索引、扫描件OCR、流式问答、多标签冲突合并、数据库迁移、部署上线和与本次UI无关的打包优化。

## 实施前交付与范围确认记录

实施前新增 UI_AUDIT.md、DESIGN_SYSTEM.md、REFACTOR_PLAN.md，以及9张重构前截图和baseline.json；当时未修改frontend/src、依赖声明、API契约或后端，未提交/重排已有Git暂存内容。

已按确认范围执行 A → B → C → D，并在每阶段修改前建立检查点；真实会话材料列表与当前材料恢复保持无新增API。本文保留为实施范围记录，最终结果见验收文档。
