# 知页 · 21st.dev UI 选型

核对日期：2026-10-18。结合当前 `frontend` 的 React 19、Vite、原生 CSS、Lucide，以及材料阅读、问答、出处核对、理解卡片流程筛选。

## 推荐：静谧书房

暖白底、墨色正文、低饱和松绿强调色；细边框、少阴影、中等圆角。左侧材料、中间讲义、右侧问答，阅读区获得最多空间。主操作集中在「提问」和「保存为我的理解」。

备用：极简工作台。中性白灰、黑色主按钮，导航压成顶部栏，采用阅读和助手双栏，适合更窄屏幕。两种方案均为本次原创组合预览，参考下列组件的布局和交互思路，不是原站截图或原组件源码副本。

## 首页补充：Background Paths

推荐 [Background Paths · Kokonut UI / Kokonut Baffier](https://21st.dev/@kokonutd/components/background-paths)。已查看原站实际预览：居中大标题、双侧流动细线、单个醒目主按钮。详情页标注 MIT，依赖 framer-motion；属于首页首屏组件，并非完整多页面模板。

知页适配方案：石墨与薄荷绿配色、宽留白、细线背景；主标题「让每一次阅读，都留下理解。」；主按钮「开始我的学习」，次按钮「看看如何使用」。首屏下方展示讲义、问答、出处的产品预览，以具体学习流程解释项目价值。首页与已选「静谧书房」工作台共用书本图标与绿色强调色。

配套会话预览为原创适配稿，使用 CSS 细线与跟随指针的柔光展示视觉方向，没有复制第三方组件实现，也没有添加依赖或修改业务页面。当前预览随系统切换浅色／深色。后续已使用原创 SVG 路径和 CSS 动效正式接入首页，补齐 reduced-motion、离屏及隐藏暂停；主按钮连接现有学习空间，次按钮滚动到明确标记的流程示意，跟随操作入口打开真实工作台指引。

## 已筛选的组件

| 优先级 | 组件与原始链接 | 在项目中的用途 | 采用与调整 | 页面许可标注 |
| --- | --- | --- | --- | --- |
| P0 | [Sidebar · shadcn](https://21st.dev/@shadcn/components/sidebar) | `App.tsx` 的空间导航与材料侧栏 | 分组标题、图标菜单、当前项；材料列表独立，避免把工具 Tab 当成全局路由 | MIT |
| P0 | [Cited Answer AI Chat Input with Sources · DHxWhy](https://21st.dev/@dhxwhy/components/cited-answer-chat-input) | `App.tsx` 的问答区 | 固定底部输入框、回答内引用编号、可展开来源；统一引用颜色，不照搬其彩色来源块 | MIT |
| P0 | [AI Sources · Cameron Kelliher](https://21st.dev/@elements-/components/sources) | 引用摘录与 `openCitation` | 折叠来源列表；把网站域名换成讲义名、PDF 页码；保留 materialId/versionId 的真实关联 | MIT |
| P1 | [Vercel Tabs · Yadwinder Singh](https://21st.dev/@yadwinder/components/vercel-tabs) | 问答／我的理解切换 | 细下划线、安静的选中态；实际接入补齐方向键与面板语义，沿用已有 tab 状态 | MIT |
| P1 | [Card · ReUI / Sean Hello](https://21st.dev/@sean0205/components/card) | `CardsPanel.tsx` 的理解卡片 | 借鉴标题／正文／底部操作分区；换成自己的理解、来源、复习状态 | MIT |
| 参考 | [File Upload Drag & Drop · Ephraim Duncan](https://21st.dev/@ephraimduncan/components/file-upload-04) | `App.tsx` 的上传区 | 参考虚线投放区和状态布局；示例接受表格文件，项目必须继续限制文本 PDF、20 MB | 页面未显示许可 |

上述 MIT 为组件详情页当日标注，实际复制源码时保留相应作者和许可证。上传组件仅参考界面布局，不纳入第三方源码。

## 适配当前项目

当前前端没有 Tailwind、shadcn、Radix 或 Motion。推荐用现有 React、Lucide 和 CSS 实现这些视觉模式；无须为了更换外观引入整套依赖。直接复制示例则需要处理 `@/` 别名、Tailwind token 和各组件依赖。

- Sidebar 页面列出 Lucide、Radix Slot、class-variance-authority；AI Sources 列出 Lucide 与 Radix Collapsible。
- Cited Answer 页面说明仅依赖 React 与 Lucide，不需要动画库；其演示回答是模拟内容，组件本身不发请求。
- ReUI 的用法示例含 `next/link`，在 Vite 项目应改为已有路由或普通链接，不能原样粘贴。
- 项目 API 当前是一次返回回答，视觉上用「正在阅读材料」即可；不要模拟逐字流式响应或没有后端依据的读取百分比。
- 保留真实保存、错误、断线、草稿恢复状态。引用点击继续调用现有 `openCitation`，不能换成只展示静态来源卡片。

## 视觉规格

| 项目 | 推荐值 |
| --- | --- |
| 页面底色／卡片底色 | `#F7F8F5` / `#FFFFFF` |
| 正文／次要文字 | `#242B27` / `#69736B` |
| 主色／浅选中底 | `#3F6251` / `#EAF1EB` |
| 边框 | `#E1E6DF`，1px |
| 字体 | 系统无衬线；正文 14px，辅助信息 12px，页面标题 24px |
| 阅读内容 | 16px、1.9 行高；文档阅读允许衬线字体 |
| 圆角／间距 | 面板 12px、按钮 8px；8 / 12 / 16 / 24 / 32px |
| 桌面布局 | 材料栏 208px；助手栏 340px；中间自适应，最小 420px |
| 响应式 | 1200px 以下收起材料栏；900px 以下阅读／问答切换；手机输入框保持至少 16px |
| 动效 | hover 和选中态 150ms；遵循 reduced-motion |

改版前 CSS 存在大量 7–11px 辅助文字；2026-10-18 已接入统一字号、对比度与精简工具栏。浅色方案优先；深色配色需另外检查 PDF 画布与出处高亮。

## 可直接交给前端的实施说明

> 基于当前知页 React + Vite 项目实现「静谧书房」UI。参考上述 Sidebar、Cited Answer、AI Sources、Vercel Tabs 和 ReUI Card 的模式，使用原生 CSS 和现有 Lucide。采用暖白、松绿、细边框、舒适字号；保持左材料、中阅读、右助手的空间关系，压缩重复顶部导航。按 tokens 文件统一颜色、间距、圆角。问答来源绑定已有 citation 数据，卡片绑定现有编辑与复习状态。保留所有真实服务、保存、草稿、异常和 PDF 行为。不要加入示例组件里的假进度、自动演示回答、虚构课程或不存在的按钮功能。

配套 [zhiye-ui-tokens.css](ui-references/zhiye-ui-tokens.css) 保留最初带作用域的变量草案。2026-10-18 已将变量适配为 `frontend/src/tokens.css` 并由 `main.tsx` 导入，首页与工作台样式已接入；没有新增第三方组件依赖。浏览器验收见 [UI 改版验收](UI改版验收.md)。
