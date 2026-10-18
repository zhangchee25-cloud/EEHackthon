# EEHackthon
A software that helps researchers read papers

## 本轮交付：学习 Agent 后端（电脑 B）

本机单用户课程学习助手后端，支持 PDF 上传和逐页解析、真实模型问答、服务端引用校验、卡片与阅读位置持久化、复习状态、Markdown 导出。前端页面由电脑 A 接入；完整 FreeBBS 登录、网络学堂和白板不在本轮范围内。

- Windows 启动：在仓库根目录执行 `.\backend\start.ps1`。
- 首次配置与依赖安装：[backend/README.md](backend/README.md)。复制 `backend/.env.example` 为 `backend/.env` 后填写各自的模型配置。
- 前端契约：[docs/api-contract.md](docs/api-contract.md)；可复制客户端：[docs/frontend-api.ts](docs/frontend-api.ts)。
- 三小时分工：[学习Agent-双电脑三小时分工.md](学习Agent-双电脑三小时分工.md)。分工文档描述开工时排期，实际完成情况以验收报告为准。
- 验收：[docs/backend-acceptance.md](docs/backend-acceptance.md)。16 项离线集成测试、18 个真实模型接口检查点全部通过；交接包另通过 7 项隔离验证。
- 示例材料：[examples/signals-systems-demo.pdf](examples/signals-systems-demo.pdf)。
- 独立交接包：[deliverables/learning-agent-backend.zip](deliverables/learning-agent-backend.zip)。

离线测试：`python -m unittest discover -s backend/tests -v`。真实验收：`python -m backend.verify_live --pdf examples/signals-systems-demo.pdf`（需要配置模型并产生平台用量）。

本分支不包含真实密钥、上传材料、运行数据库或测试临时文件。新电脑需要自行配置凭据。
