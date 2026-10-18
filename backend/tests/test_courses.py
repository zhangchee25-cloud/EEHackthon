from copy import deepcopy
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from backend.config import Config
from backend.course_store import CourseStore
from backend.courses import retrieve
from backend.errors import AppError
from backend.learn import LearnClient, school_error
from backend.server import create_server
from backend.service import WorkspaceService, identifier, text_field
from backend.tests.fixtures import make_pdf


class MultiModel:
    def __init__(self):
        self.calls = 0
        self.output = None

    def generate(self, question, chunks):
        self.calls += 1
        if self.output is not None:
            return deepcopy(self.output), {}
        by_material = {}
        for c in chunks:
            by_material.setdefault(c["materialId"], c)
        return {"supported": True, "answerSegments": [{"text": "综合两份材料。", "sources": [
            {"segmentId": c["segmentId"], "quote": c["text"].split("\n")[-2].strip() if "\n" in c["text"] else c["text"][:30]}
            for c in by_material.values()]}], "limitations": []}, {}


class SchoolFixture:
    mode = "test-fixture"

    def __init__(self):
        self.transport = self
        self.downloads = []
        self.fail = {}
        self.payloads = {"f1": make_pdf(["Additivity means combining the outputs for the two inputs."]),
                         "f2": make_pdf(["Homogeneity means scaling the output by the input scale."])}

    def status(self):
        return {"status": "connected", "message": "test-fixture", "loginUrl": "/api/learn/connect", "mode": self.mode}

    def courses(self, semester):
        return [("upstream_course", "测试课程")]

    def semesters(self):
        return [{"id": "2026-2027-1", "name": "test-fixture"}]

    def files(self, course):
        return {"files": [{"fileId": fid, "courseId": course["courseId"], "title": fid + ".pdf", "fileType": "pdf",
            "sizeBytes": len(content), "supported": True, "unsupportedReason": None} for fid, content in self.payloads.items()],
            "complete": True, "warnings": [], "mode": self.mode}

    def download(self, fid):
        self.downloads.append(fid)
        if fid in self.fail:
            raise self.fail[fid]
        return self.payloads[fid]

    def close(self):
        pass


class CourseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = Config(data_dir=Path(self.tmp.name), model="test-fixture")
        self.model = MultiModel()
        self.w = WorkspaceService(self.config, self.model)
        self.school = SchoolFixture()
        self.w.courses.learn = self.school
        self.c = self.w.courses
        self.course = self.c.list_courses("2026-2027-1")["courses"][0]
        self.cid = self.course["courseId"]
        self.c.list_files(self.cid)

    def tearDown(self):
        self.c.close()
        self.tmp.cleanup()

    def error(self, code, function, *args):
        with self.assertRaises(AppError) as e:
            function(*args)
        self.assertEqual(e.exception.code, code)

    def wait(self, bid):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            b = self.c.repo.batch(bid)
            if b["status"] != "running":
                # Let worker release its lock before a retry.
                worker = self.c.workers.get(bid)
                if worker:
                    worker.join(timeout=2)
                return b
            time.sleep(0.02)
        self.fail("import timeout")

    def imported(self, request="batch_1"):
        b = self.c.start_import({"courseId": self.cid, "fileIds": ["f1", "f2"], "requestId": request})
        b = self.wait(b["batchId"])
        self.assertEqual(b["status"], "completed", b)
        return b

    def test_stable_identity_import_versions_dedup_and_restart(self):
        self.assertEqual(self.c.repo.upsert_course("2026-2027-1", "upstream_course", "改名")["courseId"], self.cid)
        other = self.c.repo.upsert_course("2025-2026-1", "upstream_course", "测试课程")
        self.assertNotEqual(other["courseId"], self.cid)
        first = self.imported()
        self.assertEqual(len(self.w.store.list_materials()), 2)
        duplicate = self.imported("batch_2")
        self.assertEqual([i["materialId"] for i in first["items"]], [i["materialId"] for i in duplicate["items"]])
        same = self.c.start_import({"courseId": self.cid, "fileIds": ["f2", "f1"], "requestId": "batch_1"})
        self.assertEqual(same["batchId"], first["batchId"])
        self.error("REQUEST_ID_CONFLICT", self.c.start_import, {"courseId": self.cid, "fileIds": ["f1"], "requestId": "batch_1"})
        self.school.payloads["f1"] = make_pdf(["A revised lecture: new content does not overwrite old sources."])
        self.imported("batch_3")
        self.assertEqual(len(self.c.repo.materials(self.cid)), 3)
        self.assertEqual(len(self.c.repo.materials(self.cid, current=True)), 2)
        old = first["items"][0]
        self.assertTrue(self.w.file(old["materialId"])[0].read_bytes().startswith(b"%PDF-"))
        restarted = WorkspaceService(self.config, self.model)
        self.assertEqual(restarted.courses.repo.batch(first["batchId"]), first)
        self.assertEqual(len(restarted.courses.materials(self.cid)["materials"]), 3)

    def test_fail_retry_only_failed_and_auth_pause(self):
        self.school.fail["f2"] = AppError("LEARN_NEEDS_AUTH", "重新登录", 401)
        b = self.c.start_import({"courseId": self.cid, "fileIds": ["f1", "f2"], "requestId": "auth_batch"})
        b = self.wait(b["batchId"])
        self.assertEqual(b["status"], "needs_auth")
        self.assertEqual(b["items"][0]["status"], "ready")
        del self.school.fail["f2"]
        self.c.retry(b["batchId"], {"itemIds": [i["itemId"] for i in b["items"]]})
        done = self.wait(b["batchId"])
        self.assertEqual(done["status"], "completed")
        self.assertEqual(self.school.downloads.count("f1"), 1)
        self.assertEqual(self.school.downloads.count("f2"), 2)

    def test_bad_pdf_unsupported_and_interruption(self):
        self.school.payloads["f2"] = b"<html>login</html>"
        b = self.c.start_import({"courseId": self.cid, "fileIds": ["f1", "f2"], "requestId": "bad_batch"})
        b = self.wait(b["batchId"])
        self.assertEqual(b["status"], "partial_failed")
        self.assertIn("PDF_INVALID", b["items"][1]["error"])
        self.error("FILE_NOT_IN_COURSE", self.c.start_import, {"courseId": self.cid, "fileIds": ["foreign"], "requestId": "foreign_batch"})
        pending = self.c.repo.create_batch(self.cid, ["f1"], "interrupt_batch")
        self.c._item(pending["batchId"], pending["items"][0]["itemId"], status="downloading")
        restarted = WorkspaceService(self.config, self.model)
        self.assertEqual(restarted.courses.repo.batch(pending["batchId"])["items"][0]["status"], "failed")

    def test_multi_material_citations_scope_and_card_source(self):
        self.imported()
        answer = self.c.ask(self.cid, {"question": "综合线性条件", "requestId": "q1"})
        self.assertEqual(len({c["materialId"] for c in answer["citations"]}), 2)
        self.assertEqual(len(answer["selectedScope"]), 2)
        self.assertEqual(self.c.ask(self.cid, {"question": "综合线性条件", "requestId": "q1"}), answer)
        self.assertEqual(self.model.calls, 1)
        state = self.w.store.state()
        state["cards"] = [{"id": "card1", "courseId": self.cid, "title": "线性", "body": "本人理解", "sourceRefs": answer["citations"], "reviewStatus": "to_review"}]
        saved = self.w.save_state(state)
        self.assertEqual(saved["cards"][0]["sourceRefs"], answer["citations"])
        other = self.c.repo.upsert_course("2026-2027-1", "other", "其他课")["courseId"]
        self.error("INVALID_SCOPE", self.c.ask, other, {"question": "q", "requestId": "q2", "materialScope": answer["selectedScope"]})
        saved["cards"][0]["courseId"] = other
        self.error("INVALID_SOURCE", self.w.save_state, saved)
        self.model.output = {"supported": True, "answerSegments": [{"text": "fake", "sources": [{"segmentId": "p1s1", "quote": "fabricated"}]}], "limitations": []}
        self.error("INVALID_CITATION", self.c.ask, self.cid, {"question": "q", "requestId": "q3"})

    def test_chinese_retrieval_budget_no_hit_and_insufficiency(self):
        chunks = [{"segmentId": f"m{i}_v_p1", "materialId": str(i), "versionId": "v", "page": 1,
                   "text": ("电容储存电荷，电压和电流存在微分关系。" if i == 2 else "历史人物与古代文学研究。") * 40} for i in range(8)]
        chosen, limited = retrieve(chunks, "电容电流与电压关系", 1500)
        self.assertTrue(limited)
        self.assertEqual(chosen[0]["materialId"], "2")
        self.assertLessEqual(len(json.dumps(chosen, ensure_ascii=False)), 1500)
        self.assertEqual(retrieve(chunks, "zebra_xyz", 1500)[0], [])
        empty = self.c.ask(self.cid, {"question": "无材料", "requestId": "empty_question"})
        self.assertFalse(empty["supported"])
        self.assertEqual(empty["citations"], [])
        self.assertTrue(empty["limitations"])
        self.assertEqual(self.model.calls, 0)

    def test_board_atomic_revision_validation_and_restart(self):
        state = self.w.store.state()
        state["activeCourseId"] = self.cid
        state["cards"] = [{"id": f"card{i}", "courseId": self.cid, "title": f"卡{i}", "body": "手写理解",
            "sourceRefs": [], "reviewStatus": "to_review"} for i in range(3)]
        saved = self.w.save_state(state)
        board = self.c.repo.board(self.cid)
        board.update(nodes=[{"id": f"n{i}", "cardId": f"card{i}", "x": i * 120, "y": i * 30} for i in range(3)],
                     edges=[{"id": "e1", "source": "n0", "target": "n1", "label": "前提"}, {"id": "e2", "source": "n1", "target": "n2", "label": "结论"}])
        write = lambda b: self.c.repo.save_board(self.cid, b, identifier, text_field)
        result = write(board)
        self.error("BOARD_CONFLICT", write, board)
        for mutate, code in [(lambda b: b["nodes"][0].update(cardId="absent"), "INVALID_BOARD_CARD"),
                              (lambda b: b["nodes"][0].update(x=float("nan")), "INVALID_BOARD"),
                              (lambda b: b["edges"][0].update(target="missing"), "INVALID_BOARD_EDGE")]:
            bad = deepcopy(result)
            mutate(bad)
            self.error(code, write, bad)
        restarted = WorkspaceService(self.config, self.model)
        self.assertEqual(restarted.courses.repo.board(self.cid), result)
        result.update(nodes=[], edges=[])
        write(result)
        self.assertEqual(len(self.w.store.state()["cards"]), 3)
        saved["cards"][0]["reviewStatus"] = "self_checked"
        checked = self.w.save_state(saved)
        checked["cards"][0]["body"] = "重新理解"
        self.assertEqual(self.w.save_state(checked)["cards"][0]["reviewStatus"], "to_review")

    def test_school_protocol_validation(self):
        for status, content, kind, code in [(200, b"<html>login</html>", "text/html", "LEARN_NEEDS_AUTH"),
            (403, b"", "", "LEARN_FORBIDDEN"), (429, b"", "", "LEARN_RATE_LIMITED")]:
            self.error(code, school_error, status, content, kind)
        class Transport:
            def request(self, path, binary=False):
                return {"object": [{"wjid": "file_1", "bt": "test.pdf", "wjlx": "pdf", "fileSize": "6MB"}] * 200}
        client = LearnClient(self.config, Transport())
        self.error("LEARN_SCHEMA_CHANGED", client.files, self.course)
        self.assertEqual(client._size("4.5 MB"), 4718592)
        self.assertIsNone(client._size("unknown"))

    def test_school_file_precheck_uses_expanded_configured_capacity(self):
        class Transport:
            def request(self, path, binary=False):
                return {"object": [
                    {"wjid": "large", "bt": "large.pdf", "wjlx": "pdf", "fileSize": "60MB"},
                    {"wjid": "oversize", "bt": "oversize.pdf", "wjlx": "pdf", "fileSize": "101MB"},
                ]}
        files = LearnClient(self.config, Transport()).files(self.course)["files"]
        self.assertTrue(files[0]["supported"])
        self.assertFalse(files[1]["supported"])
        self.assertIn("100 MB", files[1]["unsupportedReason"])

    def test_http_contract(self):
        server = create_server(self.config, self.w, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        def req(path, body=None, method=None):
            data = json.dumps(body).encode() if body is not None else None
            try:
                with urllib.request.urlopen(urllib.request.Request(base + path, data=data, method=method,
                    headers={"Content-Type": "application/json", "Origin": "http://localhost:4173"}), timeout=10) as r:
                    raw = r.read()
                    return r.status, json.loads(raw) if "application/json" in r.headers["Content-Type"] else raw
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read())
        try:
            self.assertIn(b"<!doctype html>", req("/api/learn/connect")[1])
            self.assertEqual(req("/api/learn/status")[1]["mode"], "test-fixture")
            self.assertEqual(req("/api/learn/semesters")[0], 200)
            self.assertEqual(req("/api/learn/courses?semesterId=2026-2027-1")[0], 200)
            self.assertEqual(req(f"/api/learn/courses/{self.cid}/files")[0], 200)
            status, batch = req("/api/learn/imports", {"courseId": self.cid, "fileIds": ["f1", "f2"], "requestId": "http_batch"})
            self.assertEqual(status, 202)
            self.wait(batch["batchId"])
            self.assertEqual(req("/api/learn/imports/" + batch["batchId"])[1]["status"], "completed")
            self.assertEqual(len(req(f"/api/courses/{self.cid}/materials")[1]["materials"]), 2)
            self.assertEqual(len(req(f"/api/learn/imports?courseId={self.cid}")[1]["batches"]), 1)
            status, answer = req(f"/api/courses/{self.cid}/ask", {"question": "综合", "requestId": "http_ask"})
            self.assertEqual(status, 200, answer)
            self.assertEqual(len(answer["citations"]), 2)
            board = req(f"/api/courses/{self.cid}/board")[1]
            self.assertEqual(req(f"/api/courses/{self.cid}/board", board, "PUT")[1]["revision"], 1)
            self.assertEqual(req(f"/api/courses/{self.cid}/board", board, "PUT")[0], 409)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
