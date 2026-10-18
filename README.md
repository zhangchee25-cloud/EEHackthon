# 清大搭 THU O PAL

第11队（507队）｜校园学习生活赛道｜关键词：成长、专注。

队长：杨坤烨；队员：杨坤烨、张弛衡、卢汕郗。整理日期：2026年10月18日。

把课程材料变成有出处、可改写、能持续复习的个人学习空间。围绕当前目标阅读材料、核对问答引用、用自己的话保存卡片，再用课程白板组织关系；目标与专注模式减少切换，改写、自检和下次目标积累个人理解。

## 本次更新（AI白板版 v4）

AI回答可直接创建卡片，原样保存无需改写。进入课程白板可让AI生成带引用的卡片、节点和关系，预览后一次追加保存；手动连线直接点击两个节点即可；点击已有连线或关系文字可弹窗选择关系类型、编辑说明、反转方向或删除。支持白板全屏、缩放和适合视图，方便查看完整知识图。旧手动编辑流程仍可使用。AI内容默认待复习，用户可以随时修改。

本版同时包含PDF定位闪动修复。验证：后端58项、前端20项单测、桌面/手机UI、生产构建通过；真实模型自制讲义生成3张卡片2条连线并通过11项检查。详情见 [本轮更新](docs/AI白板与直接建卡更新.md)。

## 先前版本验收记录

最终前后端源码在 **[项目根目录](.)**，本 README 与队伍介绍、开源与 AI 使用声明、允许后续开源文件位于提交包最外层。接口以 [AB 本轮集成契约](docs/AB-本轮集成契约.md) 为准，详情见 [后端说明](backend/README.md)、[前端说明](frontend/README.md) 与 [B 验收记录](docs/B-验收记录.md)。源码中历史名称“知页／FreeBBS”不改变作品正式名称；本轮不接 FreeBBS。

| 功能／检查 | 最终可核查结果 |
| --- | --- |
| 后端离线回归 | 48 项全部通过，包含课程范围、来源校验、状态迁移、并发 revision、白板及学校传输异常 |
| 真实网络学堂 | 本人登录后4学期、目标学期10课程、目标课程26文件目录；2份PDF自动导入，原件页数8／7；15项HTTP检查通过 |
| 去重与本人重连 | 重复导入复用材料与版本；主演示后端重启恢复旧批次、2材料；新批次待认证后本人重连并显式重试完成，7项通过 |
| 真实课程模型与持久化 | 经本人授权，实际向配置平台发送两PDF的5142字符相关片段；双材料5引用逐条核对原页和摘录；3卡片、3节点2边及独立测试服务重启恢复，共20项通过 |
| 前端 | zch `04c1baac` 基线加联调修复；17单测、12桌面／手机UI、生产构建与真实后端只读契约验证通过 |
| 后端隔离源码包 | 9项通过：清单哈希、无凭据启动、PDF解析及完整进程重启后状态／材料恢复 |

UI自动测试使用显著标记的接口桩，其结果与真实学校／模型证据分别记录。引用的归属、页数、逐字摘录已校验，结论语义仍需本人核对。学校限流、WebVPN、macOS实机及十张卡片白板样本未验收；真实白板HTTP样本为三张卡片。旧16:58未集成工作区的失败记录已由上述最终候选结果替代，不作为本包状态。

## 必要环境与启动

需要 Python 3.10+、Node.js 20.19+（20.x）或22.12+、npm及现代浏览器。首次安装须访问Python/npm包源和Playwright浏览器下载源。前端PDF worker与字体资源在安装后复制到本地，无需外部CDN。

先进入提交包的 ``，创建Python环境并安装依赖。Windows PowerShell：

```powershell
# 当前目录为项目根目录
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m playwright install chromium
Copy-Item backend/.env.example backend/.env
# 编辑 backend/.env 后启动
.\.venv\Scripts\python.exe -m backend
```

macOS终端：

```bash
# 当前目录为项目根目录
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m playwright install chromium
cp backend/.env.example backend/.env
# 编辑 backend/.env 后启动
python -m backend
```

Windows学校窗口默认启动已安装Edge；没有Edge时按后端README配置 `LEARN_BROWSER_EXECUTABLE` 为Chromium／Chrome可执行文件完整路径。macOS默认用Playwright Chromium，尚无Mac实机成功承诺。后端统一入口为 `python -m backend`，服务仅监听本机8000；保持该终端开启。

后端 `backend/.env` 必填：

```dotenv
MODEL_BASE_URL=https://your-authorized-provider.example/v1
MODEL_API_KEY=在本机填写
MODEL_NAME=平台实际支持的模型ID
MODEL_API_STYLE=responses
```

按平台可将协议改为 `chat_completions`，不要把Base URL填成 `/chat/completions`。默认文件上限5MB／20页，上下文预算45000字符。可选 `DATA_DIR`、`ALLOWED_ORIGINS`、`LEARN_BROWSER_EXECUTABLE` 见示例；配置变更后重启后端。健康接口 `http://127.0.0.1:8000/api/health` 的 `modelConfigured` 仅表示配置齐全，真实问答成功才证明模型可用。API密钥只由后端读取，绝不放浏览器环境或提交包。

新开终端，进入 `frontend/`：

```bash
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173/#study>。同源 `/api` 默认代理本机8000；如需改变地址，在前端 `.env.local` 设置 `BACKEND_URL`，不放模型密钥。生产检查为 `npm test`、`npm run build`；构建后 `npm run preview` 打开 <http://127.0.0.1:4173/#study>，仍需后端。不要双击dist页面。

## 两分钟演示

演示前启动真实前后端，确认页面没有“接口测试桩”标识。由账号本人打开材料栏的学校连接页，在独立学校窗口完成登录／二次认证并进入课程列表，返回刷新连接状态；预先选择一门课和两份支持PDF，等待真实导入就绪。新设备没有已有学校会话或教师课件，不能把认证与网络下载时间压入两分钟承诺。

| 时间 | 操作与核验 |
| --- | --- |
| 0:00–0:20 | 进入学习空间，填写本次目标，展示当前课程及两份已就绪材料，打开原PDF核对页序 |
| 0:20–0:55 | 提交需要两份材料的问题；等待真实模型，点开两份材料的引用，核对版本、页数和摘录；无证据部分应明确不足 |
| 0:55–1:20 | 将回答转为草稿，用自己的话改写并保存卡片；确认已保存，而非只展示本机草稿 |
| 1:20–1:45 | 将已保存卡片加入白板，移动并连线；标记自检后修改正文，展示回到待复习 |
| 1:45–2:00 | 刷新核对卡片和白板，导出Markdown；说明完整后端重启恢复已有独立HTTP证据，不在此时中断演示 |

没有学校账号时，可“独立上传材料”使用包内 [自制三页示例](examples/signals-systems-demo.pdf) 演示上传、单材料问答、改写与导出；独立材料不冒充课程导入，课程白板需真实课程卡片。模型失败时保留问题并展示错误，不替换成固定成功答案。

## 保存、隐私与源码边界

运行数据存于 `backend/data/`，包括材料、SQLite状态及课程关联；关闭服务前后可恢复材料与学习状态，临时学校会话需本人重连。备份先正常停服务再复制完整data目录。状态与白板使用独立revision，冲突保留草稿，读取最新数据再由用户合并。

提交源码不含真实密钥、Cookie、登录态、个人运行数据、教师原课件、node_modules、vendor或私有报告，仅附自制PDF。真实问答会把所选材料的相关文本发往本人配置的平台，学校材料须先取得相应授权。第三方来源、AI使用、可见开发对话及后续开源授权见包外层对应声明；无法由本README替代团队许可与完整对话审查。
