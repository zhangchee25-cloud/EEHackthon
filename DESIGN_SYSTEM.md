# 知页 Design System

日期：2026-10-18。状态：**已实施**。变量位于 frontend/src/tokens.css，基础控件位于 frontend/src/components/ui.tsx 和 frontend/src/ui.css，布局规则位于 styles.css / landing.css。

## 1. 设计方向

浅色、精致、高信息密度、低噪声的学习工作台。借鉴 Linear 的层级与交互节奏，保留知页品牌和学习任务的可读性。通过位置、字重、间距和细边框建立层级；品牌绿只用于主操作、当前项及必要状态。

首页、学习指引、材料、PDF、问答、卡片共用一套变量。避免装饰性图标、渐变背景、玻璃拟态和成片阴影。PDF 内容按原文显示，不修改其字体或颜色。

## 2. 颜色变量

沿用现有 `--study-*` 命名，降低迁移成本。下列六色固定；状态衍生色统一定义，不分散硬编码。

| Token | 值 | 用途 |
| --- | --- | --- |
| --study-bg | #F7F8FA | 页面和工作区背景 |
| --study-surface | #FFFFFF | 面板、输入、菜单 |
| --study-text | #18181B | 主文字 |
| --study-muted | #71717A | 次级文字 |
| --study-border | #E5E7EB | 1px 分割线和边框 |
| --study-primary | #376C58 | 品牌和主要行动 |
| --study-primary-text | #FFFFFF | 主按钮文字 |
| --study-primary-hover | #2D5949 | 主按钮 hover |
| --study-selected | #EDF3F0 | 选中背景 |
| --study-hover | #F1F3F5 | 中性 hover |
| --study-border-strong | #858B95 | 需明确识别的控件边界 |
| --study-focus | #376C58 | 焦点环 |
| --study-danger / --study-danger-bg | #B42318 / #FEF3F2 | 失败、HTTP/API 错误 |
| --study-danger-border | #FDA29B | 错误边框 |
| --study-warning / --study-warning-bg | #92400E / #FFFBEB | 待处理、AI 草稿、材料不足 |
| --study-warning-border | #FCD34D | 警示边框 |

成功采用品牌绿，普通标签采用浅灰背景配主文字色，以满足对比度；状态必须同时有文字。错误默认常驻直至解决，不能用 Toast 替代关键错误。

边框 #E5E7EB 用于低噪声分区。需要独立辨认的输入、交互状态和焦点使用强边界或清晰文字，阶段 D 逐项核查文本/控件对比度。

## 3. 字体与排版

字体栈：`Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`。已随项目提供 @fontsource/inter 5.2.8 的 Latin 400/500/600 WOFF2，使用 font-display: swap；资源与 SIL Open Font License 位于 frontend/public/fonts/，中文采用系统回退。不通过第三方字体 CDN 阻塞页面。

| 角色 | 字号 / 行高 | 字重 |
| --- | --- | --- |
| 辅助说明、状态、徽标 | 12 / 16px | 400、500 |
| 按钮、工具栏、列表元信息 | 13 / 20px | 400、500 |
| 默认正文、问答、卡片 | 14 / 22px | 400 |
| 面板标题、重要正文 | 16 / 24px | 500、600 |
| 页面标题 | 20 / 28px | 600 |
| 首页主标题、空态标题上限 | 24 / 32px | 600 |

手机可编辑文本保持16px，避免 iOS 自动缩放，属于14px基础字号的明确交互例外。正文允许选择和换行；页码/计数用 tabular-nums。正常权重只用400/500/600，不用极细或不稳定的中间权重。长标题省略时仍有可访问完整文本；段落、来源摘录和错误详情自然折行。

## 4. 间距、尺寸与层级

- 4px 基础网格；间距4/8/12/16/20/24/32/40/48。1px边框和2px焦点环为必要例外。
- 保持现有 space-1…5 的8/12/16/24/32语义，补 space-unit=4px、space-0-5=4px、space-3-5=20px 等，避免同名变量改义。
- 圆角：6px按钮/输入/徽标/工具提示，8px小卡片，12px大面板/Dialog；不使用无意义胶囊。
- 按钮：默认32px、小28px、触摸优先40px；图标按钮32px，手机主要目标至少40px且留足间距。
- 输入与选择：默认32px、手机40px；Textarea 最小88px，编辑正文最小200px；面板内边距16px、密集行12px、页面边距16–24px。
- 面板工具栏40–44px；顶栏桌面48–56px；目标栏40–44px，窄屏允许合理换行。
- 面板使用1px边框；常规卡片不加阴影。仅 Dialog、浮层提示允许轻量单层阴影；页面导航与面板不透明。
- 层级变量：普通内容0、粘性工具栏10、提示30；Dialog 使用浏览器 top layer，避免任意堆叠 z-index。

## 5. 工作台布局

桌面 ≥1200px 保留材料 / PDF / 助手三栏，建议材料224px、助手360px、中栏 minmax(0,1fr)，栏间距12–16px。1440px 时可为中间留出约760px；宽屏助手可到384px。

900–1199px 默认阅读+助手双栏，材料通过明确入口展开；768px 与375px使用阅读/助手视图切换和按需展开材料。保留专注模式、助手开关、上传、导出与回源能力；不把窄屏挤成三条不可读的列。

布局按内容和可用视口分配高度，Alert/指引加入正常文档流；不依靠固定减数计算全部区域。PDF 放大允许只在阅读容器内横向滚动，页面本身不横向溢出。软键盘出现时输入与发送操作保持可达。

## 6. 组件规范

| 组件 | 约定 |
| --- | --- |
| Button | primary / secondary / quiet / danger；明确 hover、active、focus-visible、disabled、loading；图标按钮有 aria-label；默认 type=button，提交显式 submit |
| Input / Textarea | 关联 label；错误用 aria-invalid + aria-describedby；保留原生输入/ref/快捷键，不吞 IME 事件 |
| Card / Panel | 面板标题、工具栏、内容、底部操作；单一细边框，不层层套卡片 |
| Tabs | 复用 StudyTabs；方向键/Home/End，选中项可聚焦；id、aria-controls 与 panel 唯一对应，隐藏面板不可聚焦 |
| Dialog | 原生 dialog + 可复用封装；有标题/说明，打开焦点进入、关闭返回触发器、Escape取消；放弃/替换草稿明确确认，无静默丢失 |
| Toast | 简短非关键反馈，role=status，约4.5秒；保存“已提交”与服务端“已保存”不能混淆 |
| Alert / ErrorState | 显示可读原因与实际 HTTP 状态（存在时），保留上下文，提供相应重试；role=alert；详情长时可折叠但主要错误一直可见 |
| Tooltip | hover与focus均可见，aria-describedby，Escape关闭；正文12px；触摸设备不依赖悬浮来完成任务 |
| Badge | neutral / brand / warning / danger；processing、ready、failed、AI草稿、待复习、已自检统一映射 |
| EmptyState | 1个小功能图标 + 标题 + 一句说明 + 可操作入口；断线时解释为何暂不可操作 |
| Loading / Skeleton | 区分状态读取、上传解析、PDF加载/定位、AI请求与保存；标注aria-busy/status；Skeleton为装饰且不播报假内容；支持减少动画 |

优先复用 StudyTabs、SourceList、PdfReader、CardsPanel。基础组件保持薄封装，不引入大组件库或另一套状态框架。已有原生 details/summary 能完成的折叠继续沿用。

## 7. 学习状态与真实性

- 材料：真实上传等待中 → ready 或失败；解析未完成不得启用问答。失败文件不得伪装成已就绪，原材料仍可阅读。没有轮询契约就不新增假进度或伪轮询。
- 材料列表只纳入本次会话真实上传返回的材料和实际恢复的当前材料。明确标注会话范围；刷新恢复当前材料和阅读页，完整历史库需将来独立后端支持。历史卡片引用依原有方式临时回源。
- 问答：问题草稿 → 正在请求 → AI草稿 / 材料不足 / 失败。推荐问题只填入输入，不生成固定答案。段落只显示其实际引用；错误保留问题并可重试。
- 引用：编号、真实标题、文件页序、摘录与版本可核查；跳页后窄屏显示阅读器；历史来源不改变当前问答范围。
- 理解：AI正文必须改写才能保存为“我的理解”；已提交卡片与未提交草稿视觉分开。保存后待复习，正文修改重置待复习，“已自检”为本人标记。
- 持久化：pending/saving/saved/error分别展示，保存失败草稿保留；恢复冲突决策不能被普通关闭操作绕过。
- 导出：继续导出实际已提交状态、来源与复习状态，不混入编辑草稿，不伪造后端持久化成功。
- 接口测试桩只用于显式标记的自动测试，其截图和报告明确注明；真实问答、解析和持久化成功必须单独通过真实后端验证。

## 8. 可访问性与验收

正文对比度目标 WCAG AA 4.5:1，必要非文本控件3:1；键盘可达、焦点可见、标签关联和状态播报清晰。交互不能只靠颜色或 hover；Dialog 与窄屏折叠区域正确管理焦点。

每阶段构建和必要测试后，用 Playwright 在1440、768、375px截图并记录浏览器、视口高度与数据模式。截图不足以替代交互验收；另检查回源页码、草稿、保存重试、导出和响应式控制。环境不可用时明确列为未验证，禁止沿用旧截图声称本阶段完成。

## 9. 实际组件入口

基础组件从 components/ui.tsx 导入。Tabs继续使用StudyTabs，来源继续使用SourceList；Panel和Card分别使用统一panel / study-card样式。Button支持React19原生ref，提交按钮须显式type="submit"；Dialog由open控制，不写入业务草稿。

移动端主要操作40px；PDF工具栏部分图标采用32px并保留间距。桌面顶栏52px，手机保存状态独占一行；目标信息栏窄屏保持单行，必要时自然换行。实际验收见docs/UI_REFACTOR_ACCEPTANCE.md。
