"""Explicit, opt-in real-provider acceptance check using self-authored test material."""
import argparse
from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid

from .config import Config
from .errors import AppError
from .server import create_server
from .tests.fixtures import make_pdf


def run(config, report_path, full=True, pdf_path=None):
    report = {"kind": "real_provider_acceptance", "model": config.model, "apiStyle": config.api_style,
              "provider": config.base_url,
              "material": "Self-authored 3-page Signals and Systems test PDF; not teacher material",
              "checks": [], "answers": [], "passed": False}
    def checkpoint():
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    checkpoint()
    with tempfile.TemporaryDirectory(prefix="learning-agent-acceptance-") as directory:
        config = replace(config, data_dir=Path(directory))
        server = None
        thread = None
        def start():
            nonlocal server, thread
            server = create_server(config, port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            return f"http://127.0.0.1:{server.server_port}"
        def stop():
            nonlocal server, thread
            if server:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)
                server = None
        base = start()
        def request(path, value=None, method=None, raw=None, headers=None):
            data = raw
            headers = headers or {}
            if value is not None:
                data = json.dumps(value, ensure_ascii=False).encode("utf-8")
                headers["Content-Type"] = "application/json"
            try:
                with urllib.request.urlopen(urllib.request.Request(base + path, data=data, method=method, headers=headers), timeout=config.model_timeout * 2 + 25) as response:
                    data = response.read()
                    if response.headers.get_content_type() == "application/json":
                        return json.loads(data)
                    return data
            except urllib.error.HTTPError as exc:
                try:
                    body = json.loads(exc.read())
                    error = body["error"]
                    raise AppError(error["code"], error["message"], exc.code) from None
                except (ValueError, KeyError):
                    raise AppError("ACCEPTANCE_HTTP_ERROR", f"验收 HTTP {exc.code}", exc.code) from None
        def check(name, condition):
            report["checks"].append({"name": name, "passed": bool(condition)})
            checkpoint()
            print(json.dumps({"check": name, "passed": bool(condition)}, ensure_ascii=False), flush=True)
            if not condition:
                raise AppError("ACCEPTANCE_FAILED", name, 500)
        try:
            health = request("/api/health")
            check("model configuration present", health["modelConfigured"])
            pdf = Path(pdf_path).read_bytes() if pdf_path else make_pdf()
            if pdf_path:
                report["material"] = "Self-authored Chinese demo PDF: " + Path(pdf_path).name
            boundary = "boundary_" + uuid.uuid4().hex
            raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="signals-systems-self-authored.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode() + pdf + f'\r\n--{boundary}--\r\n'.encode())
            material = request("/api/materials", raw=raw, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
            check("upload and parse 3 actual PDF pages", material["status"] == "ready" and material["pageCount"] == 3)
            check("original PDF preserved", request(material["fileUrl"]) == pdf)
            questions = [
                ("材料中，一个系统要满足哪些条件才是线性的？请用中文解释。", True),
                ("根据材料，y(t)=t*x(t) 是不是线性系统、是不是时不变系统？", True),
                ("根据材料，2026 年这门课的期末考试时间、教室和任课教师是谁？", False),
            ]
            if not full:
                questions = questions[:1]
            for index, (question, supported) in enumerate(questions):
                started = time.monotonic()
                answer = request("/api/ask", {"materialId": material["materialId"], "question": question,
                                 "requestId": "live_acceptance_" + str(index)})
                report["answers"].append({"question": question, "seconds": round(time.monotonic() - started, 2), "response": answer})
                check(f"question {index + 1}: expected support state", answer["supported"] is supported)
                check(f"question {index + 1}: citations or explicit insufficiency",
                      bool(answer["citations"]) if supported else bool(answer["limitations"]) and not answer["citations"] and not answer["answerSegments"])
                if index < 2:
                    check(f"question {index + 1}: expected original page",
                          any(c["pageStart"] == index + 1 for c in answer["citations"]))
            first = report["answers"][0]["response"]
            state = request("/api/state")
            state.update({"goal": "分清线性与时不变", "nextStep": "复习因果性",
                "readingPosition": {"materialId": material["materialId"], "versionId": material["versionId"], "page": 2},
                "cards": [{"id": "live_card", "title": "我的线性理解（自动验收写入）",
                    "body": "线性要求叠加性和齐次性同时成立：输入相加或倍乘时输出也按同样方式变化。",
                    "sourceRefs": first["citations"], "reviewStatus": "to_review"}]})
            saved = request("/api/state", state, "PUT")
            check("card and source snapshots saved", saved["cards"][0]["sourceRefs"] == first["citations"])
            check("refresh preserves complete state", request("/api/state") == saved)
            checked_input = deepcopy(saved)
            checked_input["cards"][0]["reviewStatus"] = "self_checked"
            checked = request("/api/state", checked_input, "PUT")
            check("self-check can be recorded", checked["cards"][0]["selfCheckedAt"] is not None)
            checked["cards"][0]["body"] += "这与时间平移后的规则是否保持不变是两个不同条件。"
            changed = request("/api/state", checked, "PUT")
            check("editing resets self-check", changed["cards"][0]["reviewStatus"] == "to_review")
            stop()
            base = start()
            check("restart restores goal/page/cards", request("/api/state") == changed)
            check("restart restores original PDF", request(material["fileUrl"]) == pdf)
            exported = request("/api/export").decode("utf-8")
            check("export contains edited card and sources", all(x in exported for x in ("我的线性理解", "文件第", material["versionId"], changed["cards"][0]["body"])))
            report["passed"] = True
        except AppError as exc:
            report["failure"] = exc.payload()["error"]
        except Exception as exc:
            report["failure"] = {"code": type(exc).__name__, "message": "验收进程失败，未包含上游内容或凭据。"}
        finally:
            stop()
    report["humanReviewRequired"] = "人工核对答案主要结论是否由原文支持；自动引用校验不能替代语义评估。"
    checkpoint()
    print(json.dumps({"passed": report["passed"], "model": config.model, "apiStyle": config.api_style,
        "checksPassed": sum(c["passed"] for c in report["checks"]), "report": str(report_path),
        "failure": report.get("failure")}, ensure_ascii=False), flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="真实模型验收：会发送自制测试材料并产生平台模型用量")
    parser.add_argument("--report", default="backend/test-results/live-acceptance.json")
    parser.add_argument("--smoke", action="store_true", help="只验证一个材料内问题及保存恢复")
    parser.add_argument("--api-style", choices=("chat_completions", "responses"))
    parser.add_argument("--pdf", help="使用指定的自制三页信号与系统 PDF 做真实验收")
    args = parser.parse_args()
    config = Config.from_env()
    if args.api_style:
        config = replace(config, api_style=args.api_style)
    raise SystemExit(run(config, Path(args.report), not args.smoke, args.pdf))
