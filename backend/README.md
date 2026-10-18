# B 后端交付：课程学习 Agent

本机单用户 Python 服务，统一入口为项目根目录下的 `python -m backend`，默认地址 `http://127.0.0.1:8000`。本轮接口以集成人提供的 **《AB-本轮集成契约.md》（2026-10-18）** 为准；旧 `docs/api-contract.md` 只可参考旧单材料能力，不能替代本轮课程／白板契约。

支持学校连接页、学期／课程／文件目录、串行批次导入、课程多材料问答、单材料上传与问答、学习状态／卡片、课程白板和 Markdown 导出。实现存在不等于真实学校验收完成；当前实测范围与未验收项见 `docs/B-验收记录.md`。

## Windows 安装与启动

需要 Python 3.10+，在包含 `backend/` 的项目根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python -m playwright install chromium
Copy-Item backend/.env.example backend/.env
# 在本机编辑 backend/.env 后执行
python -m backend --check-config
python -m backend
```

Windows 登录窗口默认启动已安装的 Microsoft Edge。若没有 Edge，在 `backend/.env` 将 `LEARN_BROWSER_EXECUTABLE` 设为已安装 Chromium／Chrome 的完整可执行文件路径；Playwright Chromium 的缓存路径可用 `python -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path); p.stop()"` 查询。安装依赖与浏览器必须使用同一个 Python。

若 PowerShell 不允许激活脚本，直接使用 `.\.venv\Scripts\python.exe` 替代命令里的 `python`，不必修改全局执行策略。`backend/start.ps1` 是可选快捷方式，使用相同模块入口。

## macOS 安装与启动

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m playwright install chromium
cp backend/.env.example backend/.env
# 在本机编辑 backend/.env 后执行
python -m backend --check-config
python -m backend
```

macOS 默认启动 Playwright 安装的 Chromium；也可配置 `LEARN_BROWSER_EXECUTABLE`。统一入口已给出，macOS 的实际启动／本人学校认证尚需在目标机器验收。浏览器二进制由目标机器安装，交付 ZIP 不包含本机 `vendor/` 或浏览器缓存。

## 本机配置

在真实 `backend/.env` 填写活动允许的平台 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME`，按平台选 `MODEL_API_STYLE=responses` 或 `chat_completions`。Base URL 使用根地址或 `/v1`，不要填 `/chat/completions`。环境变量优先；修改后重启服务。真实密钥只由后端读取，不放前端环境或交付包。

`GET /api/health` 的 `modelConfigured=true` 仅表示配置齐全；模型是否可用以真实问答为准。`python -m backend --list-models` 只查询模型列表，不代替问答验收。默认 PDF 上限 **100 MB，PDF 页数不限**，上下文预算 45,000 字符；超限明确失败，目录中的 `supported` 仅代表类型／已知大小预检。

## 学校连接与接口接入

1. 启动后打开 `http://127.0.0.1:8000/api/learn/connect`。本人选择校园直连或 WebVPN，并在独立学校窗口完成登录与二次认证、进入课程列表；不要向 AI 提供密码、验证码、Cookie 或认证截图。
2. 查询 `GET /api/learn/status`，以响应状态为准。A 仅打开连接页和刷新状态，不实现学校认证。关闭独立浏览器或服务重启后可能需要本人重新认证。
3. 顺序读取 `/api/learn/semesters`、`/api/learn/courses?semesterId=…`、`/api/learn/courses/:courseId/files`；必须保留服务端 `courseId`，不要从标题推算。`complete=false` 必须提示目录可能不完整。
4. `POST /api/learn/imports` 提交 `{courseId,fileIds,requestId}`，HTTP 202；每 2 秒查询 `/api/learn/imports/:batchId`，终态停止。`GET /api/learn/imports?courseId=…` 恢复已有批次。重连后通过 `/api/learn/imports/:batchId/retry` 显式重试 `failed`／`needs_auth`，已成功项保留。
5. `/api/courses/:courseId/materials` 列出已关联材料；向 `/api/courses/:courseId/ask` 提交 `{question,requestId,materialScope?}`。范围省略时使用该课程已就绪材料；固定范围须保留材料 ID 与版本。回答携带 `selectedScope`、`answerSegments`、`citations`、`limitations`，以真实页序从 1 跳页。正文以纯文本渲染。
6. `/api/state` 完整读写并保留 `revision`、`activeCourseId`、所有课程卡片及 `card.courseId`。每种保存队列只允许一个在途 PUT。409 `STATE_CONFLICT` 后保留草稿，读取最新状态再由用户合并。
7. `/api/courses/:courseId/board` 完整读写 `revision/nodes/edges`，拖动结束再保存。节点引用该课程已保存卡片，删除节点不删卡片；409 `BOARD_CONFLICT` 保留草稿。`GET /api/export` 导出 Markdown。

保留旧入口 `POST /api/materials`（multipart `file`）、`POST /api/ask`、`GET /api/materials/:materialId` 和 `/file`。不要手动设置 multipart boundary。失败统一为 `{error:{code,message,details?}}`；不能把登录 HTML、解析失败或模型失败标为成功材料／答案。

A 访问同源 `/api`，开发／预览代理目标 `http://127.0.0.1:8000`。默认允许本机 5173、4173、3000 来源；其他端口设置 `ALLOWED_ORIGINS`。本服务绑定本机，不需要公网部署。

## 数据与出处

默认 `backend/data/` 保存 SQLite、材料 PDF 与课程关联；不要交付它。停服务后复制完整目录备份，不单拷运行中的 SQLite 文件。同内容复用材料、变化内容保留旧版本。中断导入重启后恢复为可重试失败，不长期停在下载中。

每条引用都经材料／版本／课程归属、片段和逐字摘录校验；页序映射原 PDF。材料不足返回空答案与空引用及明确限制。超预算使用中文字符／双字及英文词汇检索，并说明仅检索部分片段；正确归属和摘录不等于语义已获证明，仍需本人核对主要结论。

状态迁移给缺失的课程字段补 null；服务端产生时间戳，正文改写强制恢复 `to_review`。保存完整 cards 时漏掉旧卡片即删除，前端须保留未显示课程的卡片。白板验证节点卡片课程归属、唯一 ID、有限坐标及合法边端点后原子保存。

## 验证与交付

```bash
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/tests -v
python -m backend.package_handoff
python -m backend.tests.verify_handoff
```

离线测试中的学校／模型桩只用于测试，不能代替真实学校访问或真实模型验收。隔离包验证不携带凭据，只检查源码完整性、实际 PDF 解析、HTTP 状态保存与进程重启恢复。

以下命令会调用本机配置的真实平台、消耗额度，仅使用自制示例材料：

```bash
python -m backend.verify_live --pdf examples/signals-systems-demo.pdf
```

该命令验证旧单材料问答与状态链路，**不代表真实学校两份 PDF 或课程多材料问答验收通过**。本轮真实学校与课程模型结果分别记录到 B 验收记录，待实测项明确标注。

学校实测脚本 `python -m backend.verify_school_live --course-id <本机课程ID> --batch-id <已完成批次ID>` 复用本人已登录的本机服务，核对目录、已导入原 PDF／页数，并对同批文件重复导入检查去重与 requestId／ready 项重试幂等。它会创建一个重复导入批次，不调用模型或读取认证字段；本机报告 `backend/test-results/school-live.json` 不进入交付包。

仅在本人明确授权把指定 PDF 的相关片段发送到该脚本限定的平台后，运行：`python -m backend.verify_school_course_qa --course-id <本机课程ID> --material-ids <获授权材料ID1> <获授权材料ID2> --question "你的综合问题"`。它以只读备份建立临时工作区，检索总预算 6,500 字符的相关片段，调用真实模型并通过 HTTP 验证来源、三张卡片、三节点两条线及测试服务重启恢复；不修改主演示学习状态。报告、临时副本和所有私人课程／材料 ID 均不入包，脚本源码不固化私人 ID。该命令会消耗模型额度，不在普通离线测试中自动运行。

课程模型验收见 `python -m backend.verify_school_course_qa --help`。只在独立本地副本中检索两份已导入PDF的必要片段，预算6500字符；运行前须本人授权将课程片段发送到配置平台。随后通过HTTP保存三张卡和三节点两条线，再重启测试服务核对恢复。私有报告与临时副本不进入源码包。

`python -m backend.package_handoff` 在 **`backend/deliverables/learning-agent-backend.zip`** 生成 B 候选源码包与文件 SHA-256 清单，供集成人组装最终包。显式白名单仅含 `backend/` 源码、`examples/` 自制材料和 `docs/B-验收记录.md`；排除 `vendor/`、`data/`、真实 `.env`、报告、会话、日志、教师 PDF、frontend 和根文档。目标机重新安装依赖／浏览器并填写自己的配置。

容量配置：`MAX_FILE_MB` 默认 100（可继续调大），PDF 不设页数或提取文字总量上限；旧 `MAX_PDF_PAGES` 已停用。解析超时默认 120 秒，可用 `PDF_PARSE_TIMEOUT_SECONDS` 调整。单文件问答仍有上下文预算，课程问答使用相关片段检索；导入成功不代表模型每次读取全部页面。


## v5 真题复习与常用文件

课程内可直接上传 PDF、DOCX、PPTX、Markdown（.md/.markdown）、TXT。旧 .doc/.ppt 需要本机安装 LibreOffice，缺失时提示另存为新格式；不自动安装。非PDF保留原件并生成文字阅读版PDF，PPTX引用页对应幻灯片序号，Word/文本引用页是重排的阅读页。图片、公式、图表与原始排版不完整保留，扫描/OCR仍不支持。

课程工具栏“真题与练习”中上传或选已有材料，填写年份和期中/期末，加入真题库。可选1–10份真题，分析最多12个考点，并请求1–5道原创类似题。真题引用与讲义引用分别校验，报告保存在SQLite；真题不参与默认讲义范围。相关卡片基于标题关键词匹配，结果需自行核对。分析预算有限时明确标注只覆盖代表片段，不作完整考点频率统计或考试预测。

接口：POST /api/courses/:id/materials（multipart file）；GET/POST /api/courses/:id/exams；POST /api/courses/:id/exams/analyze（requestId, examMaterialIds, instruction, practiceCount）。练习答案为AI参考解答，默认折叠。重复同requestId返回已有报告，不重复调用模型。

真实模型验收：python -m backend.verify_exams，仅使用脚本自制Markdown材料，不读取个人课程；会调用配置平台。2026-10-18该验收7项通过，得到2个考点及2道原创练习。
