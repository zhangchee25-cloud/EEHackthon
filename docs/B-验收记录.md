# B 后端验收记录

记录日期：2026-10-18（北京时间）。固定依据：《AB-本轮集成契约.md》2026-10-18 版。交付范围仅 `backend/`、`examples/` 与本文。

## 当前结论与未验收项

**真实学校目录、两份 PDF 自动入库和去重、本人重连后继续导入、课程综合问答、卡片与白板保存恢复均通过。** 离线48项、学校HTTP15项、获本人授权的课程片段模型与HTTP持久化20项、主演示服务重启与本人重连7项均通过。学校限流、WebVPN及macOS实机未验收。白板真实HTTP样本为三张卡片，十张样本未验收。前端已合并zch最新04c1baac，17单测、12桌面/手机UI、生产构建和真实后端只读接口联调通过。

## 源码版本

在本机目录 `C:/Users/PC/Desktop/EE Hackathon` 继续开发，该目录无可用 Git 元数据，不能伪造候选提交 ID。源码范围包括新增 `learn.py`、`course_store.py`、`courses.py` 及 `tests/test_courses.py`；候选包以 `HANDOFF-MANIFEST.json` 中每个源码文件的 SHA-256 固定版本。打包后需重新运行隔离包验证，不能把旧包结果当作本轮结果。

## 已知验证证据

| 检查 | 当前结果 | 证据／限制 |
| --- | --- | --- |
| 原后端回归 | 主执行 Agent 已运行 16 项通过 | `backend/tests/test_backend.py`；学校／模型桩不代表真实访问 |
| 新课程后端测试 | 主执行 Agent 已运行 8 项通过 | `backend/tests/test_courses.py`；课程、批次、隔离、中文检索与白板路径，具体以测试名称为准 |
| 增补课程问答与状态白板测试 | 本次 15 项通过 | `test_course_qa_extra.py` 8 项、`test_state_board_extra.py` 7 项；覆盖中文检索预算、双材料范围、伪引用拒绝、迁移、冲突与来源归属 |
| 本轮完整回归 | 最终48项全部通过，35.192秒 | 含原16项、课程8项、问答8项、状态白板7项、学校传输9项；覆盖退出与重试排队竞态、认证响应与非法输入 |
| 真实学校本人登录 | 后端状态 connected | 由本人完成认证，不记录凭据、Cookie、学校网页或认证 URL |
| 真实学校目录与两份 PDF | 15 个真实 HTTP 检查通过 | 4 学期；目标学期 10 门课；电路原理C目录 26 文件、complete=true；两份 PDF 自动导入，原件签名有效，页数 8／7 与材料元数据相符 |
| 重复导入／幂等 | 真实 HTTP 通过 | 第二批同文件导入完成，复用 material/version、课程材料仍仅 2 份；同 requestId 返回同批次；retry 不重复处理 ready 项 |
| 主演示重启／本人重连／显式继续 | 最终真实 HTTP 7 项通过 | 新进程恢复旧 completed 批次及2材料；新批次2项 needs_auth；本人登录后 connected，显式重试后 completed；材料／版本复用且总数仍2。私有报告 `backend/test-results/school-reconnect.json` |
| 同课多材料真实模型 | 自制材料及获授权学校材料均通过 | 自制材料4项；学校材料20项HTTP/模型检查通过：实际发送5142字符相关片段（6500预算），gpt-6.1-sol返回覆盖两PDF的5条引用，原页与摘录逐条匹配，明确说明无直接比较与完整证明 |
| 课程隔离、引用拒绝、无证据不足 | 离线测试覆盖 | `test_courses.py`、`test_course_qa_extra.py` 使用模型桩；不冒充真实模型检查 |
| 本轮测试服务重启恢复 | 真实HTTP通过 | 学校材料的独立本地副本中，保存3张带来源卡、3节点2边，停服务重启后完整恢复；原8000学习状态未修改；主演示进程的课程映射、导入与材料恢复亦另行通过 |
| 最终后端源码包隔离验证 | 9 检查全部通过 | 35 个白名单源码／示例／记录文件；ZIP完整性、精确白名单、无私有目录、SHA-256、无凭据启动、学校API初始断开、真实中文PDF解析、完整进程重启后状态／材料恢复；学校模型验收脚本已参数化，私人课程／材料 ID 不入源码 |

历史单材料真实平台验收使用自制中文三页 PDF，18 个检查点通过，报告保留在本机旧 `docs/backend-verification.json`。它证明旧上传／单材料问答／状态／导出链路，不证明本轮真实学校或多材料能力。报告不进入 B 源码包。

## 验证命令与失败边界

在项目根目录、同一 Python 环境执行：

```bash
python -m unittest discover -s backend/tests -v
python -m backend.package_handoff
python -m backend.tests.verify_handoff
```

保持本人学校窗口已登录后，使用已经完成且获授权的课程及批次 ID 执行：`python -m backend.verify_school_live --course-id <本机课程ID> --batch-id <已完成批次ID>`。脚本仅访问本机 HTTP、核对学校目录与原 PDF，并对同批文件创建第二批导入验证去重／幂等；不调用模型、不读取浏览器认证字段、不停止 8000 服务。计数、批次／文件／材料 ID 及页数只记在排除出包的 `backend/test-results/school-live.json`，不把学校身份 ID 固化到交付源码。

真实单材料模型回归：`python -m backend.verify_live --pdf examples/signals-systems-demo.pdf`，会使用本机私有配置并消耗模型额度。真实学校验证必须保持本人登录窗口；学校状态以 `/api/learn/status` 为准，登录 HTML／过期／限流／下载或解析异常应明确失败。登录失效的批次需要本人重连后显式重试，不自动伪造成功。

真实双材料课程模型复现命令：`python -m backend.verify_school_course_qa --course-id <本机课程ID> --material-ids <获授权材料ID1> <获授权材料ID2> --question "你的综合问题"`。必须先获得本人对两份材料和模型发送的明确授权；参数化脚本不包含私人课程／材料 ID。此前20检查通过的实测报告仍对应获授权的具体问题与5142字符片段；本次参数化后只验证语法／CLI，不重复调用模型。

候选包输出于 `backend/deliverables/learning-agent-backend.zip`，显式源码白名单，排除真实 `.env`、`data/`、`vendor/`、会话、教师 PDF 和本机报告。只带自制示例 PDF；集成人保留 A 的 frontend 与 B 的 backend/examples，不覆盖对方业务目录。Mac／Windows 的依赖、浏览器安装及统一 `python -m backend` 入口见 `backend/README.md`。默认容量调整为 **100 MB，PDF 页数不限**。

## 取消 PDF 页数限制回归（2026-10-18）

后端 51 项离线测试通过；前端 17 项单元测试及生产构建通过。新增样本覆盖 251 页文本 PDF、带 6 MB 附件的有效 PDF、超过 30 万字符的提取文本；验证旧 MAX_PDF_PAGES 不影响不限页数，以及学校目录对 60 MB 文件允许导入、101 MB 文件按当前 100 MB 上限提示。上述验证未访问学校账号或外部模型。
