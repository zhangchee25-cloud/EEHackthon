"""Synthetic evidence only: generation, atomic apply and isolation."""
from copy import deepcopy
import unittest
import json
import threading
import urllib.request

from backend.tests import test_courses
from backend.server import create_server
from backend.service import WorkspaceService


class BoardModel:
    def __init__(self):
        self.calls = 0
        self.tamper = None

    def generate(self, question, chunks, system_prompt=None):
        self.calls += 1
        selected = chunks[:2]
        output = {"supported": True, "answerSegments": [
            {"title": "概念" + str(i), "text": c["text"], "sources": [
                {"segmentId": c["segmentId"], "quote": c["text"][:30]}]}
            for i, c in enumerate(selected)], "limitations": [],
            "relations": [{"source": 0, "target": 1, "label": "联合描述线性性质"}]}
        if self.tamper:
            self.tamper(output)
        return output, {}


class AIBoardTests(unittest.TestCase):
    setUp = test_courses.CourseTests.setUp
    tearDown = test_courses.CourseTests.tearDown
    wait = test_courses.CourseTests.wait
    imported = test_courses.CourseTests.imported
    error = test_courses.CourseTests.error

    def prepare(self):
        self.imported()
        self.model = BoardModel()
        self.w.model = self.model

    def test_generate_apply_retry_and_preserve_existing(self):
        self.prepare()
        before = self.w.store.state()
        preview = self.c.generate_board(self.cid, {"requestId": "g1"})
        self.assertEqual(self.w.store.state(), before)
        self.assertEqual(len(preview["cards"]), 2)
        self.assertEqual(len(preview["edges"]), 1)
        self.assertTrue(all(c["origin"] == "ai" and c["sourceRefs"] for c in preview["cards"]))
        self.assertEqual(preview, self.c.generate_board(self.cid, {"requestId": "g1"}))
        self.assertEqual(self.model.calls, 1)
        body = {"previewId": preview["previewId"], "stateRevision": 0, "boardRevision": 0}
        result = self.c.apply_board(self.cid, body)
        self.assertEqual(result["state"]["revision"], 1)
        self.assertEqual(result["board"]["revision"], 1)
        self.assertEqual(result, self.c.apply_board(self.cid, body))
        second = self.c.generate_board(self.cid, {"requestId": "g2"})
        result2 = self.c.apply_board(self.cid, {"previewId": second["previewId"], "stateRevision": 1, "boardRevision": 1})
        self.assertEqual(len(result2["state"]["cards"]), 4)
        self.assertEqual(len(result2["board"]["nodes"]), 4)
        self.assertGreater(result2["board"]["nodes"][2]["y"], result2["board"]["nodes"][0]["y"])
        # Old idempotent retries must not return stale workspace snapshots.
        self.assertEqual(result2, self.c.apply_board(self.cid, body))

    def test_conflicts_are_atomic_and_preview_remains_available(self):
        self.prepare()
        preview = self.c.generate_board(self.cid, {"requestId": "g"})
        before = self.w.store.state()
        body = {"previewId": preview["previewId"], "stateRevision": 1, "boardRevision": 0}
        self.error("STATE_CONFLICT", self.c.apply_board, self.cid, body)
        body.update(stateRevision=0, boardRevision=1)
        self.error("BOARD_CONFLICT", self.c.apply_board, self.cid, body)
        self.assertEqual(self.w.store.state(), before)
        self.assertEqual(self.c.repo.board(self.cid)["nodes"], [])
        body.update(boardRevision=0)
        self.assertEqual(len(self.c.apply_board(self.cid, body)["state"]["cards"]), 2)

    def test_untrusted_model_citations_and_endpoints_rejected(self):
        self.prepare()
        self.model.tamper = lambda o: o["answerSegments"][0]["sources"][0].update(segmentId="foreign")
        self.error("INVALID_CITATION", self.c.generate_board, self.cid, {"requestId": "g1"})
        self.model.tamper = lambda o: o["relations"][0].update(target=88)
        self.error("INVALID_BOARD_GENERATION", self.c.generate_board, self.cid, {"requestId": "g2"})
        self.assertEqual(self.w.store.state()["cards"], [])

    def test_scope_ownership_request_id_and_empty_course(self):
        self.prepare()
        other = self.c.repo.upsert_course("other", "other", "other")["courseId"]
        self.error("NO_READY_MATERIALS", self.c.generate_board, other, {"requestId": "empty"})
        material = self.c.repo.materials(self.cid)[0]
        self.error("INVALID_SCOPE", self.c.generate_board, other, {"requestId": "scope", "materialScope": [material]})
        preview = self.c.generate_board(self.cid, {"requestId": "g"})
        self.error("REQUEST_ID_CONFLICT", self.c.generate_board, self.cid, {"requestId": "g", "instruction": "different"})
        self.error("PREVIEW_NOT_FOUND", self.c.apply_board, other,
                   {"previewId": preview["previewId"], "stateRevision": 0, "boardRevision": 0})

    def test_direct_ai_card_save_needs_no_rewrite(self):
        self.prepare()
        preview = self.c.generate_board(self.cid, {"requestId": "g"})
        state = self.w.store.state()
        state["cards"] = deepcopy(preview["cards"])
        saved = self.w.save_state(state)
        self.assertEqual(saved["cards"][0]["body"], preview["cards"][0]["body"])
        self.assertEqual(saved["cards"][0]["origin"], "ai")
        self.assertIn("内容来源：AI 生成", self.w.export_markdown())
        saved["cards"][0]["origin"] = ""
        saved["cards"][1].pop("origin")
        saved = self.w.save_state(saved)
        self.assertTrue(all(card["origin"] == "ai" for card in saved["cards"]))

    def test_legacy_missing_and_empty_origin_save_as_unknown(self):
        state = self.w.store.state()
        state["cards"] = [{"id": "legacy", "title": "旧卡片", "body": "原有内容", "sourceRefs": [],
                           "reviewStatus": "to_review"}]
        saved = self.w.save_state(state)
        self.assertEqual(saved["cards"][0]["origin"], "unknown")
        saved["cards"][0]["origin"] = None
        saved = self.w.save_state(saved)
        self.assertEqual(saved["cards"][0]["origin"], "unknown")
        self.assertIn("内容来源：未标记", self.w.export_markdown())

    def test_http_preview_survives_restart_and_applies(self):
        self.prepare()
        preview = self.c.generate_board(self.cid, {"requestId": "persisted", "instruction": ""})
        self.c.close()
        restored = WorkspaceService(self.config, self.model)
        server = create_server(self.config, restored, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(server.server_address[1])
        def post(action, body):
            request = urllib.request.Request(base + f"/api/courses/{self.cid}/board/" + action,
                data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=10) as response:
                return json.loads(response.read())
        try:
            self.assertEqual(preview, post("generate", {"requestId": "persisted", "instruction": ""}))
            result = post("apply", {"previewId": preview["previewId"], "stateRevision": 0, "boardRevision": 0})
            self.assertEqual(len(result["state"]["cards"]), 2)
            self.assertEqual(len(result["board"]["edges"]), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
