# 清大搭 · A 前端交付

React / TypeScript / Vite 独立本机课程学习空间。实现网络学堂导入界面、课程知识库、多文件带出处问答、个人知识卡片和课程白板。暂不接 FreeBBS。当前接口以 [A/B 本轮集成契约](../docs/AB-本轮集成契约.md) 为准。

## 启动真实页面

需要 Node.js 20.19+（20.x）或 22.12+。已在 Node 25.5.0 验证。

```sh
cd frontend
npm ci
npm run dev
```

打开 http://127.0.0.1:5173/#study 。默认代理 `/api` 到 http://127.0.0.1:8000 。B 的启动方式以其交付说明为准。可复制 `.env.example` 为 `.env.local` 配置 `BACKEND_URL`；修改后重启。前端不需要模型密钥。

真实后端不可用时明确报错，不回退测试数据。学校认证完全在 B 的 `/api/learn/connect` 本机页面完成；A 不收集密码、Cookie 或验证码。

## 功能与边界

- 展开“从网络学堂导入”，连接 → 刷新状态 → 选择学期和课程 → 选择文件 → 一键导入。显示不支持原因、目录不完整提示、逐项进度、成功计数、失败/认证失效重试；刷新恢复批次。
- 课程材料自动刷新；默认向当前课全部已就绪材料提问，也可限定当前文件。答案按各来源材料的版本和页数校验；点击引用打开正确文件页序与摘录。
- “独立上传材料”保留本地 PDF 流程，默认 5 MB / 20 页，容量读取健康接口。课程文件通过网络学堂导入，独立上传不会冒充课程资料。
- AI 草稿须本人改写后保存；卡片按课程过滤，持久化始终包含所有课程卡片。正文变更恢复待复习。导出当前课程卡片、来源版本及摘录，不含原 PDF 或未提交编辑。
- 每课一块白板：加入已保存卡片，拖动标题或方向键移动，选择两个节点手动连线，填写关系文字，删除连线或移除节点，打开卡片/出处。移除节点不删除卡片，正文从同一份卡片数据读取。
- 状态和白板独立 revision / 串行保存队列。650ms 合并学习状态输入；白板在拖动结束保存。请求期间后续输入保留；503 可重试；409 停止自动保存，重读后明确选择服务端版本或用本机草稿替换。替换是全量覆盖，不自动合并他人修改。
- 问题和卡片编辑草稿按课程保存；切换课程清除旧回答。板上只能加入已确认保存的课程卡片。
- 保留现有首页、PDF.js 阅读器、缩放/翻页/出处、键盘标签、专注模式及手机阅读/助手切换。独立上传的完整历史列表无后端接口，刷新只恢复当前文件。

## 检查

```sh
npm test
npm run build
npm run test:ui
```

`test:ui` 为本轮 A 验收：使用本机 Chrome，独立启动 8012 接口桩和 4175 前端，不复用其他服务。结果、截图和失败 trace 仅输出在 `frontend/test-results/`。测试覆盖桌面和 375px 手机。`test:ui:legacy` 保留旧 UI 重构测试入口，尚未按本轮新增课程契约全面复验，不作为本轮验收依据。

`npm run preview` 在 4173 提供构建产物，仍需后端代理。PDF worker、字体、CMaps、WASM 安装后复制到本地资源，不依赖外部 CDN。不能双击 dist/index.html 启动。

## 手动隔离接口桩

分别在 frontend 目录的两个终端执行：

```sh
npm run test:fixture
```

```sh
BACKEND_URL=http://127.0.0.1:8011 npm run dev -- --port 5174
```

打开 http://127.0.0.1:5174/#study ，顶部应显示“接口测试桩”。选择“电路原理”，默认四个可导入文件中两个直接成功、一个下载失败、一个登录失效；连接后重试可全部就绪。视频明确不支持。问题包含“失败”模拟模型错误，“量子”模拟依据不足；上传 broken.pdf 模拟坏文件。

**桩只有内存状态和合成 PDF，无真实学校下载、模型或服务重启持久化。**浏览器刷新恢复测试不等于后端重启恢复。真实联调情况见 [A 验收记录](../docs/A-验收记录.md)。

## A 源码交接

```sh
npm run package:a
```

生成 `frontend/artifacts/A-frontend-handoff.zip`，含 frontend 源码、锁文件、本地字体和必要资源说明、固定契约副本及 A 验收记录；不含 backend、node_modules、dist、测试运行缓存、真实 .env、密钥或学校会话。集成人将包内 frontend/ 与 B 的 backend/、examples/ 组装；不要用整分支覆盖 B。

早期 UI 设计记录仍在仓库 DESIGN_SYSTEM.md、UI_AUDIT.md 和 docs/UI_REFACTOR_ACCEPTANCE.md。当前 A 开发只修改 frontend/ 与 docs/A-验收记录.md。

### Windows 本轮集成补充

`npm run test:ui` 已使用跨平台启动配置，无需 POSIX 环境变量语法。本机若 npm 未加入 PATH，可使用自有 Node/npm 安装；已安装依赖时直接执行 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173` 也可启动。

只读验证真实后端契约（不发问答、不写状态）：PowerShell 设置 `$env:STUDY_READ_URL='http://127.0.0.1:8000'` 后运行 `node node_modules/vitest/vitest.mjs run tests/read-contract.integration.test.ts`。需要本人先连接网络学堂。默认 `npm test` 会跳过该外部服务检查。
