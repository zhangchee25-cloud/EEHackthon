# 知页 UI / UX 审计

日期：2026-10-18。本文保留**实施前审计基线**；用户后续已确认执行，重构结果见 [验收记录](docs/UI_REFACTOR_ACCEPTANCE.md)。以下技术与问题描述对应修改前状态。

本轮检查源码、锁文件、构建、单元测试和实际浏览器页面；未修改产品源码。设计规范见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)，实施范围见 [REFACTOR_PLAN.md](REFACTOR_PLAN.md)。

## 1. 实际技术栈

| 项目 | 核实结果 |
| --- | --- |
| 应用 | React + TypeScript + Vite 单页应用；不是 Next.js |
| React / React DOM | package.json 声明 `^19.2.0`；package-lock.json 锁定 **19.3.1** |
| Vite / TypeScript | 声明 `^7.1.0` / `~5.9.3`；锁定 **7.3.7 / 5.9.3** |
| PDF | pdfjs-dist **5.7.284**；实际 Canvas 渲染，worker、CMaps、字体、WASM 本地提供 |
| 图标 / 校验 | lucide-react **0.468.0**；Zod **4.6.7** |
| 样式 | 原生 CSS；入口按 tokens.css → styles.css → landing.css 导入；无 Tailwind 配置 |
| 组件库 | 无 Radix、shadcn、Ant Design 等；现有业务组件自行实现 |
| 状态 | React useState/useRef/useEffect + useStudyState；无 Redux/Zustand |
| 路由 | Site.tsx 监听 hashchange，无 React Router |
| 测试 | Vitest **3.2.7**，Node 环境；2 个测试文件、10 项测试 |
| 浏览器测试 | 本机可解析 Playwright / @playwright/test **1.64.1**，但未声明在 package.json 或锁文件；Chrome **155.0.8059.80** 可运行 |
| 后端 | 当前代码库没有 Python 后端源码；/api 由 Vite 代理至 BACKEND_URL 或 127.0.0.1:8000 |

未在仓库及所检查的上级目录发现适用的 AGENTS.md。当前分支 `zch`；进入任务时 HEAD 为 `11ecab6`，已有55个暂存文件变更。审计期间 HEAD 更新为 `34b1cbb`（feat: add Zhiye study workspace and responsive UI），检查结束时暂存区与已跟踪文件无差异。本轮未执行 commit、暂存或重置操作；实施前须重新检查 Git 状态。

## 2. 路由与页面

| 入口 | 实现及状态 |
| --- | --- |
| `/`、`/#home` | LandingPage：首页、进入工作台、学习流程说明 |
| `/#how-it-works` | 同一首页内的流程锚点，不是独立页面 |
| `/#study` | App：三栏学习工作台 |
| `/#study/guide` | 同一工作台显示步骤指引，不是独立业务路由 |

Site 会保留已打开工作台的挂载状态；返回首页后，进行中的请求和编辑草稿仍保留。直接打开流程锚点、前进后退及隐藏页面的焦点行为需在 D 阶段检查。当前没有登录、设置、课程目录等页面，不新增虚构路由。

## 3. 组件与数据链路

| 文件 | 当前职责及必须保留的交互 |
| --- | --- |
| frontend/src/App.tsx | 顶栏、目标、上传、材料当前项、问答、引用摘录、导出、连接/恢复/保存反馈、响应式面板切换；同时承担较多视觉结构 |
| components/PdfReader.tsx | 读取真实原文件、PDF.js 渲染、缩放、页序输入、翻页、引用定位、原 PDF 兜底打开、失败重试 |
| components/StudyTabs.tsx | 通用 Tabs，含 ArrowLeft/Right、Home/End 和 roving tabindex；优先复用 |
| components/SourceList.tsx | 可折叠引用列表、页序、摘录、点击回源；优先复用 |
| components/CardsPanel.tsx | 手写/AI 草稿编辑、改写门槛、来源快照、复习筛选与状态、草稿保护 |
| components/LandingPage.tsx | 首页与流程示意；背景路径动效有 reduced-motion 和离屏暂停 |
| api.ts | fetch、超时、Zod 响应校验、保存确认、问答范围校验；不得改 API 路径及载荷 |
| domain.ts | 数据模型、引用归属校验、正文改动重置复习状态、Markdown 导出 |
| hooks/useStudyState.ts | 串行 PUT 保存队列、650ms 防抖、失败保留最新状态、手动重试、草稿恢复决策 |

API 包括 GET /health、GET/PUT /state、POST /materials、GET /materials/:id/file、POST /ask，统一前缀 /api。上传真实 FormData，问答非流式；问答 120 秒、上传 90 秒超时。新材料成功后才替换阅读范围，上传和问答互斥。回答按段落关联引用，旧来源临时打开不会更改当前问答范围。

持久化包括服务端 goal、nextStep、readingPosition、cards；本地 `zhiye:pending-state:v1`、`zhiye:question-draft:v1`、`zhiye:card-draft:v1` 保护未保存状态和编辑内容。服务端未成功读取或草稿冲突待处理时禁止写入。PUT 必须确认 `saved: true` 才显示成功。这些逻辑及存储键保持兼容。

## 4. 视觉与交互问题及优先级

P0 是真实性和数据安全；P1 是本次主要体验问题；P2 是一致性完善。

| 优先级 | 问题与证据 | 修改方向 / 阶段 |
| --- | --- | --- |
| P0 | 实际 /api/state、/api/health 返回 HTTP 500；当前真实服务未连通，页面如实阻止写入 | 保留错误与重试；不可改成演示成功。真实模型、解析与重启恢复单独待联调 / 全阶段 |
| P0 | api.ts 对 JSON 错误优先抛后端说明，可能丢失 HTTP 状态；非 JSON 错误已有状态码 | 在现有 ApiError 中保留并展示 HTTP 状态与可读说明，增加有意义回归测试；不改契约 / C |
| P0 | 材料栏只有一个 current；没有 GET 材料列表，也无服务端材料集合状态 | 显示真实已知材料，明确范围；不得伪造全量历史库或自动解析轮询 / B |
| P1 | token 仍是暖绿：背景 #f7f8f5、正文 #242b27、主色 #3f6251；大量背景/边框硬编码 | 换为指定六色及语义变量，统一到 tokens.css / A |
| P1 | 字号含 9/10/11/15/17/19/23/28px，权重含 450/550/580/650；间距 token 从 8px 开始且大量未使用 | 收敛到 12/13/14/16/20/24px、400/500/600、4px 网格；字体栈补 Inter / A |
| P1 | 按钮、输入框、标签和错误反馈分散，send-button/ask-ai-button 等有独立规则；缺少统一 Dialog/Tooltip | 提取薄基础层，复用原生语义与现有 Tabs、SourceList / A、C |
| P1 | 桌面头部实测 77px，目标栏 56px，控制栏 66px，再叠错误及引导；1440px 阅读区从 y=307 开始，引导页从 y≈467 开始 | 顶栏 48–56px、目标信息栏 40–44px，面板工具栏合并，指引按需展开 / B |
| P1 | 手机头部 99px、目标栏 78px；错误状态下阅读区从 y≈469 开始，引导页从 y≈657 开始 | 压缩导航与辅助信息、可换行 Alert、短引导、保证切换入口可达 / B、D |
| P1 | learning-grid 使用固定视口减数，min-height 540px，随 Alert/引导增高而超出首屏；手机最小高 510px | 用页面结构与 flex/grid 分配可用高度，保留必要的页面滚动，避免重复滚动与输入区遮挡 / B、D |
| P1 | 上传区长期占高，缺少可切换真实材料行、选中语义，processing/failed 主要依赖临时文字 | 紧凑上传入口和真实材料行，清楚显示处理中、失败、就绪；失败不覆盖旧材料 / B |
| P1 | 无材料阅读空态有倾斜图标和假投影，没有直接上传操作；手机文案仍称“拖到左侧” | 中性 Empty State + 上传 CTA，窄屏使用正确指引；保留断线禁用与重新连接 / B |
| P1 | 右栏固定 340px，装饰性介绍和推荐问题占高；回答字号16px/行高1.9、卡片正文1.9，阅读节奏偏松 | 右栏建议 360px；压缩说明、正文14px/行高22px，推荐问题紧凑可填入输入框 / C |
| P1 | AI 草稿与用户理解已有文本区分，尚缺统一状态徽标；原生 window.confirm 打断编辑流程 | 明确“AI 草稿 · 待改写”“我的理解”“待复习/已自检”；可访问确认 Dialog / C |
| P1 | 引用摘录绝对定位在 PDF 上方，max-height 50%，手机58%；可能覆盖阅读内容 | 改为不遮挡页码和关键内容的可收起来源区域，核查长摘录与历史来源返回 / C、D |
| P2 | 首页 88px 导航、46–76px 大标题、路径背景和大面积留白，与专业工作台语言不统一 | 保留首页和清晰入口，改为紧凑产品介绍、有限字号层级、静态流程说明 / B |
| P2 | 多处辅助文字小于12px；普通透明禁用态、原生 title 提示、可折叠 summary 焦点需核查 | 统一可读字号、焦点、语义提示；色彩不作为唯一状态依据 / A、D |
| P2 | CSS 多数规则压在单行，改动审查困难；通用 .primary/.small 等选择器容易互相影响 | 在必要的修改范围内格式化并约束组件规则，避免追加覆盖补丁 / A–D |

## 5. 基础组件现状

| 类型 | 现有能力 | 处理 |
| --- | --- | --- |
| Button / Input / Textarea / Panel | 原生元素和 CSS 类 | 统一变量与样式，提供小型共用封装，保留原生属性和 ref |
| Tabs | StudyTabs 已含键盘交互 | 沿用，修正隐藏/显示 panel 与 aria-labelledby 的对应关系 |
| Dialog | window.confirm 用于放弃/替换草稿 | 采用原生 dialog 小封装，焦点进入/返回、Escape、明确取消 |
| Toast / Alert | App 内联 toast、各式 banner 与错误块 | 统一组件；成功用 status，错误用 alert，持久失败不自动消失 |
| Tooltip | 原生 title | 统一支持键盘与鼠标，关联 aria-describedby，不承载唯一必要说明 |
| Badge | 多种 tag、count、review-tag | 统一中性、品牌、warning、danger 变体 |
| Empty / Loading / Error | 分散在阅读、问答、卡片 | 共用结构；加载可用 Skeleton + status，不能假装已有内容 |

## 6. 本轮实际验证

- `npm test`：**2 个文件 / 10 项全部通过**，覆盖队列合并/重试、复习状态、导出、引用校验、错误及保存确认。
- `npm run build`：**通过** TypeScript 与 Vite 构建。有既有 Zod 注释警告和 >500kB chunk 提示；不为消除提示扩大本次重构。
- 沙箱内服务监听和 Chrome 启动受限，使用工具允许的沙箱外执行后，两者成功运行。本轮没有自动审批拒绝。
- 使用实际构建预览 `http://127.0.0.1:4173`，Playwright + Chrome；三个宽度 **1440 / 768 / 375px**，本轮基线高度统一900px，DPR1，减少动画。
- 首页、工作台、引导页共 **9 张重构前截图**；9/9 文档 scrollWidth 等于 viewport，未发现页面脚本异常。
- 实际工作台 /api/state、/api/health 均 HTTP500；截图保留完整错误，未注入测试桩或假成功。Vite日志为连接127.0.0.1:8000 ECONNREFUSED，因此本次500来自代理目标不可达，不能解释为已收到Python业务异常。
- 本轮截图只覆盖真实首页与断线/空态，**没有验证成功解析、真实问答、真实引用正确性或服务重启持久化**。
- 旧 docs/UI改版验收.md 的成功流程说明和旧截图仅作历史参考，不作为本次重新验收结论。

截图与机器记录：

| 页面 | 1440px | 768px | 375px |
| --- | --- | --- | --- |
| 首页 | [截图](docs/screenshots/ui-audit-2026-10-18/home-1440.png) | [截图](docs/screenshots/ui-audit-2026-10-18/home-768.png) | [截图](docs/screenshots/ui-audit-2026-10-18/home-375.png) |
| 工作台 | [截图](docs/screenshots/ui-audit-2026-10-18/study-1440.png) | [截图](docs/screenshots/ui-audit-2026-10-18/study-768.png) | [截图](docs/screenshots/ui-audit-2026-10-18/study-375.png) |
| 引导页 | [截图](docs/screenshots/ui-audit-2026-10-18/guide-1440.png) | [截图](docs/screenshots/ui-audit-2026-10-18/guide-768.png) | [截图](docs/screenshots/ui-audit-2026-10-18/guide-375.png) |

详细测量、请求状态与页面错误见 [baseline.json](docs/screenshots/ui-audit-2026-10-18/baseline.json)。
