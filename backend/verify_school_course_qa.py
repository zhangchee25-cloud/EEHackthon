"""Opt-in HTTP acceptance for the two specifically authorized school PDFs.

Only retrieved excerpts go to the configured api.muzeai.top model. The live
workspace is backed up read-only into a disposable local copy, never modified.
"""
import argparse
from contextlib import closing
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import uuid

from .config import Config
from .courses import retrieve
from .errors import AppError
from .model import ModelClient
from .server import create_server
from .service import WorkspaceService, identifier, normalized

DEFAULT_QUESTION = "综合这两份材料说明它们各自的主要结论与适用条件；材料没有直接支持的比较请明确指出证据不足。"


def run(config, report_path, course_id, material_ids, question=DEFAULT_QUESTION):
    course_id = identifier(course_id, "courseId")
    material_ids = [identifier(mid, "materialId") for mid in material_ids]
    if len(material_ids) != 2 or len(set(material_ids)) != 2:
        raise ValueError("Exactly two distinct, explicitly authorized material IDs are required")
    if not isinstance(question, str) or not question.strip() or len(question) > config.max_question_chars:
        raise ValueError("A non-empty question within the configured question limit is required")
    report = {"kind": "authorized_school_course_http_acceptance", "passed": False,
              "providerHost": "api.muzeai.top", "model": config.model,
              "contextBudget": 6500, "checks": [], "liveWorkspaceModified": False,
              "schoolDownloadAcceptance": False,
              "notice": "Uses two previously imported school PDFs; no login or school download is performed."}
    started = time.monotonic()
    report_path = Path(report_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    def checkpoint():
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    def check(name, condition):
        report["checks"].append({"name": name, "passed": bool(condition)})
        checkpoint()
        if not condition:
            raise AppError("ACCEPTANCE_FAILED", name, 500)

    server = thread = None
    temporary_root = None

    def stop():
        nonlocal server, thread
        if server:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            server.workspace_service.courses.close()
            server = thread = None

    try:
        if urlsplit(config.base_url).hostname != "api.muzeai.top":
            raise AppError("PROVIDER_NOT_AUTHORIZED", "This check only authorizes api.muzeai.top.", 422)
        source_dir = config.data_dir.resolve()
        source_db = source_dir / "workspace.sqlite3"
        with tempfile.TemporaryDirectory(prefix="school-qa-private-", dir=report_path.parent,
                                         ignore_cleanup_errors=True) as temporary:
            target = Path(temporary)
            temporary_root = target
            try:
                # sqlite connection context managers commit transactions but do
                # not close handles; Windows requires both handles closed before
                # deleting this disposable directory.
                with closing(sqlite3.connect(source_db.as_uri() + "?mode=ro", uri=True)) as source:
                    with closing(sqlite3.connect(target / "workspace.sqlite3")) as destination:
                        source.backup(destination)
                (target / "materials").mkdir()
                for mid in material_ids:
                    shutil.copy2(source_dir / "materials" / (mid + ".pdf"), target / "materials" / (mid + ".pdf"))
                isolated = replace(config, data_dir=target, max_context_chars=6500)
                initial = WorkspaceService(isolated)
                actual_materials = [initial.store.material(mid) for mid in material_ids]
                scope = [{key: m[key] for key in ("materialId", "versionId", "title")} for m in actual_materials]
                report["requestedScope"] = scope
                selected = []
                for material in actual_materials:
                    check("material belongs to authorized course: " + material["materialId"],
                          initial.courses.repo.contains(course_id, material["materialId"], material["versionId"]))
                    chunks = [dict(c, courseId=course_id) for c in initial.courses.repo.chunks(material)]
                    excerpts, _ = retrieve(chunks, question, 3200)
                    check("relevant excerpts found: " + material["materialId"], bool(excerpts))
                    selected.extend(excerpts)
                check("combined retrieved context within 6500 characters", len(json.dumps(selected, ensure_ascii=False)) <= 6500)
                # Restrict only this disposable copy's derived index. Full original
                # pages remain available locally for independent quote validation.
                with initial.store.connect() as db:
                    for material in actual_materials:
                        db.execute("DELETE FROM course_chunks WHERE material_id=?", (material["materialId"],))
                    db.executemany("INSERT INTO course_chunks VALUES (?,?,?,?,?)", [
                        (c["materialId"], c["versionId"], c["segmentId"], c["page"], c["text"]) for c in selected])

                class BoundedModel:
                    def __init__(self):
                        self.delegate = ModelClient(isolated)

                    def generate(self, question, chunks):
                        allowed = {c["segmentId"] for c in selected}
                        check("only preselected relevant excerpts sent", all(c["segmentId"] in allowed for c in chunks))
                        size = len(json.dumps(chunks, ensure_ascii=False))
                        check("actual sent course context within budget", size <= 6500)
                        report["sentContextChars"] = size
                        report["sentSegments"] = [{k: c[k] for k in ("segmentId", "materialId", "versionId", "page")} for c in chunks]
                        checkpoint()
                        return self.delegate.generate(question, chunks)

                initial.model = BoundedModel()

                def start(service=None):
                    nonlocal server, thread
                    server = create_server(isolated, service, port=0)
                    thread = threading.Thread(target=server.serve_forever, daemon=True)
                    thread.start()
                    return "http://127.0.0.1:" + str(server.server_port)

                base = start(initial)

                def request(path, body=None, method=None):
                    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
                    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
                    try:
                        with urllib.request.urlopen(req, timeout=config.model_timeout * 2 + 25) as response:
                            return json.loads(response.read())
                    except urllib.error.HTTPError as exc:
                        error = json.loads(exc.read()).get("error", {})
                        raise AppError(error.get("code", "HTTP_ERROR"), error.get("message", "HTTP acceptance request failed"), exc.code) from None

                body = {"question": question, "requestId": "school_acceptance_" + uuid.uuid4().hex, "materialScope": scope}
                answer = request("/api/courses/" + course_id + "/ask", body)
                check("HTTP answer is supported", answer["supported"] is True)
                check("citations cover both actual PDFs", {c["materialId"] for c in answer["citations"]} == {m["materialId"] for m in actual_materials})
                material_map = {m["materialId"]: m for m in actual_materials}
                verified = []
                for citation in answer["citations"]:
                    material = material_map[citation["materialId"]]
                    pages = {p["page"]: p["text"] for p in material["pages"]}
                    page = citation["pageStart"]
                    valid = (citation["versionId"] == material["versionId"] and citation["pageEnd"] == page and
                             page in pages and normalized(citation["quote"]) in normalized(pages[page]))
                    check("original PDF page and quote verified: " + citation["id"], valid)
                    verified.append({**{k: citation[k] for k in ("id", "materialId", "versionId", "pageStart", "pageEnd")},
                                     "quoteChars": len(citation["quote"]), "quoteSha256": hashlib.sha256(citation["quote"].encode()).hexdigest(),
                                     "quoteVerified": valid})
                report["answer"] = {k: answer[k] for k in ("supported", "answerSegments", "selectedScope", "limitations")}
                report["verifiedCitations"] = verified
                check("same HTTP request reuses answer", request("/api/courses/" + course_id + "/ask", body) == answer)
                state = request("/api/state")
                state.update(activeCourseId=course_id, goal="验收课程依据与比较边界", nextStep="本人复核三张卡片",
                             readingPosition={"materialId": answer["citations"][0]["materialId"], "versionId": answer["citations"][0]["versionId"], "page": answer["citations"][0]["pageStart"]})
                state["cards"] = [{"id": "school_qa_card_" + str(i), "courseId": course_id,
                    "title": title, "body": text, "sourceRefs": answer["citations"], "reviewStatus": "to_review"}
                    for i, (title, text) in enumerate([
                        ("叠加定理的适用条件", "这是验收草稿：先确认电路满足线性条件，再使用叠加定理。"),
                        ("MOSFET的逻辑模型", "这是验收草稿：按材料区分逻辑门使用的开关与电阻近似。"),
                        ("比较结论的依据边界", "这是验收草稿：跨材料推论需要另外验证，不能把类比当成材料直接结论。")], 1)]
                saved = request("/api/state", state, "PUT")
                check("three cited course cards saved through HTTP", len(saved["cards"]) == 3 and all(c["sourceRefs"] == answer["citations"] for c in saved["cards"]))
                board = request("/api/courses/" + course_id + "/board")
                board.update(nodes=[{"id": "node_" + str(i), "cardId": card["id"], "x": i * 180, "y": i * 60} for i, card in enumerate(saved["cards"])],
                             edges=[{"id": "edge_1", "source": "node_0", "target": "node_2", "label": "适用条件"},
                                    {"id": "edge_2", "source": "node_1", "target": "node_2", "label": "模型边界"}])
                board = request("/api/courses/" + course_id + "/board", board, "PUT")
                check("three nodes and two edges saved through HTTP", len(board["nodes"]) == 3 and len(board["edges"]) == 2)
                stop()
                base = start()
                check("HTTP study state survives test service restart", request("/api/state") == saved)
                check("HTTP course board survives test service restart", request("/api/courses/" + course_id + "/board") == board)
                report["persisted"] = {"cards": 3, "nodes": 3, "edges": 2, "stateRevision": saved["revision"], "boardRevision": board["revision"]}
                report["passed"] = True
            finally:
                stop()
    except AppError as exc:
        report["passed"] = False
        report["failure"] = {"code": exc.code, "message": exc.message}
    except Exception as exc:
        report["passed"] = False
        report["failure"] = {"code": type(exc).__name__, "message": "Acceptance process failed; no source document text or credentials included."}
    report["cleanupCompleted"] = temporary_root is None or not temporary_root.exists()
    if not report["cleanupCompleted"]:
        report["cleanupWarning"] = "Windows retained the private temporary copy; exclude school-qa-private-* from packages and remove it after its file handles close."
    report["seconds"] = round(time.monotonic() - started, 2)
    report["humanReviewRequired"] = "Review semantic support and whether the cross-material comparison explicitly states missing direct evidence."
    checkpoint()
    print(json.dumps({k: report.get(k) for k in ("passed", "model", "sentContextChars", "seconds", "failure")}, ensure_ascii=True), flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Explicitly authorized school-course HTTP/model check using an isolated local copy")
    parser.add_argument("--report", default="backend/test-results/school-course-qa-live.json")
    parser.add_argument("--course-id", required=True, help="Explicitly authorized local course ID")
    parser.add_argument("--material-ids", nargs=2, required=True, help="Two explicitly authorized imported material IDs")
    parser.add_argument("--question", default=DEFAULT_QUESTION, help="Question used for both retrieval and the model request")
    args = parser.parse_args()
    raise SystemExit(run(Config.from_env(), Path(args.report), args.course_id, args.material_ids, args.question))
