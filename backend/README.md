# 电脑 B 交付：课程学习 Agent 后端

本机单用户服务。负责文本 PDF 上传与逐页解析、材料范围内真实问答、服务端引用校验、学习状态与卡片持久化、复习状态规则、Markdown 导出。电脑 A 负责 React 页面。未实现 FreeBBS 登录、网络学堂、多人权限或白板。

## 当前电脑启动

在项目根目录 PowerShell 执行：

~~~powershell
./backend/start.ps1
~~~

地址：http://127.0.0.1:8000/api/health 。status=ok 表示服务已启动，modelConfigured=true 只表示配置齐全，平台是否真正可用以问答结果为准。停止使用 Ctrl+C。

脚本先查项目 .venv，再查系统 Python，最后查 Codex 随附 Python，不需要 npm。前台运行，终端关闭后服务停止。若 PowerShell 阻止脚本，不必修改全局策略，可以直接执行：

~~~powershell
python -m backend
~~~

当前电脑没有系统 python 命令时，可用已核对存在的运行时：

~~~powershell
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" -m backend
~~~

## 另一台电脑安装

需要 Python 3.10+。复制 backend/、docs/api-contract.md 和 .gitignore；不要复制真实 .env、data/、日志或 __pycache__/。

在项目根目录执行：

~~~powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
~~~

在电脑 A 本地编辑 backend/.env，填写活动允许的平台配置：

~~~dotenv
MODEL_BASE_URL=https://your-provider.example/v1
MODEL_API_KEY=在本机填写
MODEL_NAME=平台实际支持的模型ID
MODEL_API_STYLE=chat_completions
~~~

Base URL 填根地址或 /v1 根，不要填 /chat/completions。后端拼接 /v1/models、/v1/chat/completions 或 /v1/responses。平台重定向不会自动跟随，避免转发凭据。支持的模型、协议以实际平台为准。

密钥只由后端读取，浏览器不会获得；不记录问题正文、密钥或原始平台错误。环境变量优先于 .env。修改配置后重启。

~~~powershell
./.venv/Scripts/python.exe -m backend --check-config
./.venv/Scripts/python.exe -m backend --list-models
./backend/start.ps1
~~~

--check-config 不发请求；--list-models 只查询平台模型名称。查询列表成功不等于对应模型的问答通过。

## 对接电脑 A

完整接口字段见 docs/api-contract.md。前端只请求相对路径 /api/*。Vite 开发代理示意，合入 A 现有配置，不覆盖整份文件：

~~~javascript
server: {
  proxy: {
    '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true }
  }
}
~~~

默认允许本机 5173 和 3000 页面来源，其他端口用 ALLOWED_ORIGINS 指定。后端只绑定本机，最终演示在 A 同时运行前后端。

接入顺序：

1. GET /api/health，显示模型配置状态和“本机演示”。
2. POST /api/materials，FormData 的 file 字段；不要手动设置 multipart Content-Type。
3. 将 fileUrl 交给 PDF 阅读器，以文件页序跳页；原文件支持 Range 和 HEAD。
4. POST /api/ask，传本次 materialId、question、可选 requestId，将响应标为“AI 草稿”。
5. GET /api/state，编辑后带当前 revision 完整 PUT 回去，成功后再显示已保存。
6. 打开 /api/export 下载卡片 Markdown。

不要把密钥放到 Vite 环境变量或前端包，不要在失败时显示固定成功答案。

## 数据与卡片规则

- 默认 backend/data/ 保存 SQLite workspace.sqlite3 与 materials/ 中按服务端唯一 ID 命名的 PDF。
- 目标、下次目标、阅读位置、卡片及来源快照原子保存，重启恢复，不依赖 localStorage。
- 保存须带 revision；过期版本返回 409。前端保留草稿、重新读取再合并，保存请求串行发送。
- 修改已保存卡片正文后，服务端强制恢复 to_review，清除当前自检时间；再次标记已自检需要独立保存。
- 创建与更新时间由服务端产生；无变化卡片不虚增更新时间。
- 完整 cards 数组中漏掉旧卡片即删除，前端须合并全部应保留卡片再保存。
- requestId 可重放已成功问题，同一 ID 改材料或问题返回冲突。失败不会保存成成功答案。
- 同内容重复上传复用材料；同名不同内容生成新 ID，不覆盖旧文件。旧卡片的来源仍可打开。
- 数据迁移前先正常停服务，复制完整 data/，不要只拷贝运行中的单个 SQLite 文件。交付包不含个人数据。

## 问答与出处边界

每次仅一份选定材料。默认上传上限 5 MB、20 页，上下文上限 45,000 字符，问题上限 4,000 字符。超限提示拆分 PDF，不静默截断后声称读完整份材料。

PDF 在子进程逐页提取，25 秒超时终止。扫描件、无文字、加密、坏文件分别提示错误；部分空页/失败页记录 warnings 并进入问答限制。按页拆片段，不跨页。

模型生成结论段、片段 ID、逐字摘录；服务端映射真实文件、版本和页序，拒绝材料外 ID、伪摘录、无引用结论。摘录比较允许 PDF 提取的空白差异。关联有效不保证语义被支持，仍须人工核对主要结论。

材料不足返回 supported=false、空答案与引用，以及明确 limitations，不联网补答。前端将所有回答与材料当作非可信文本，Markdown 禁用原始 HTML，不直接注入页面。

## 验证

离线测试不消耗真实额度，模型桩仅存在于 tests；PDF、数据库、HTTP 与协议传输真实执行：

~~~powershell
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/tests -v
~~~

真实验收会发送项目自制三页讲义到本机配置的平台，消耗模型额度：

~~~powershell
python -m backend.verify_live
~~~

报告：backend/test-results/live-acceptance.json。流程通过 HTTP 验证上传 → 材料内两问 → 材料外一问 → 保存 → 自检 → 改写重置 → 重启恢复 → 导出。支持 --smoke 少问两个问题，--api-style responses 显式换协议；不会静默换模型或供应商。真实报告与模型桩测试分别记录。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| config.py | 配置、URL、容量限制 |
| server.py | HTTP、multipart、PDF Range、来源限制、错误响应 |
| pdf_worker.py | 独立进程按页提取 PDF |
| model.py | 真实平台请求、两种协议适配 |
| service.py | 材料、出处、卡片、状态与导出业务 |
| storage.py | SQLite 元数据、答案和状态持久化 |
| tests/ | 离线集成测试与自制 PDF |
| verify_live.py | 明确启用的真实平台验收 |

这是电脑 B 的后端交付；电脑 A 还需要 PDF 页面控制、按钮/状态交互和浏览器界面验收。

## 当前平台实测与交接

已切换到用户新提供的接口，实际验证 gpt-6.1-sol 的 Responses 协议。模型列表查询、中文 PDF 真实问答和完整学习记录链路均已通过。本机私有配置选择 responses。

2026-10-18 验证结果：16 项离线集成测试全部通过；新平台真实 HTTP 三问验收的 18 个检查点全部通过，包括材料内两问、材料外拒答、正确页序、卡片与来源保存、自检、改写重置、重启恢复和导出。详见 docs/backend-acceptance.md 与 docs/backend-verification.json。旧平台的并发错误报告仅作排错历史，不再代表当前结果。

复现真实验收：python -m backend.verify_live --pdf examples/signals-systems-demo.pdf 。遇到平台 429，服务仅等待 3 秒重试一次，仍失败就明确报错，不无限循环消耗请求。真实运行仍依赖平台网络、密钥和额度。

平台地址、密钥、个人材料不进入交接包。使用 python -m backend.package_handoff 在 deliverables/ 生成明确白名单的源码包，自动扫描确保不含本机密钥或 data/。电脑 A 可以直接复制 docs/frontend-api.ts 到自己的前端接口层，再按 api-contract.md 接入。
