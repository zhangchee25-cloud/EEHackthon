"""Course QA regressions; all material text is authored for these tests."""
from copy import deepcopy
from pathlib import Path
import json
import tempfile
import unittest

from backend.config import Config
from backend.courses import retrieve
from backend.errors import AppError
from backend.service import WorkspaceService


class EvidenceModel:
    def __init__(self):
        self.calls = 0
        self.chunks = []

    def generate(self, question, chunks):
        self.calls += 1
        self.chunks = deepcopy(chunks)
        return {"supported": True, "answerSegments": [{"text": "两份材料给出两个条件。", "sources": [
            {"segmentId": c["segmentId"], "quote": c["text"][:30]} for c in chunks
        ]}], "limitations": []}, {}


class CourseQAExtraTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.model = EvidenceModel()
        self.w = WorkspaceService(Config(data_dir=Path(self.tmp.name), model="test-fixture"), self.model)
        self.addCleanup(self.w.courses.close)
        self.c = self.w.courses
        self.cid = self.c.repo.upsert_course("2026", "self_authored", "自制测试课")["courseId"]
        self.materials = [self.material("one", "叠加性要求输入之和对应输出之和。"),
                          self.material("two", "齐次性要求输入缩放时输出按同样倍数缩放。")]

    def material(self, name, text, course=None):
        mid, vid = "mat_" + name, "ver_" + name
        self.w.store.add_material(mid, vid, name + ".pdf", name)
        self.w.store.finish_material(mid, [{"page": 1, "text": text}], [])
        material = self.w.store.material(mid)
        self.c.repo.link(course or self.cid, name, material, name)
        return material

    def scope(self):
        return [{k: m[k] for k in ("materialId", "versionId", "title")} for m in self.materials]

    def error(self, code, func, *args):
        with self.assertRaises(AppError) as raised:
            func(*args)
        self.assertEqual(raised.exception.code, code)

    def test_scope_order_and_titles_do_not_change_idempotency(self):
        scope = self.scope()
        body = {"question": "说明两个条件", "requestId": "same", "materialScope": scope}
        answer = self.c.ask(self.cid, body)
        scope = list(reversed(deepcopy(scope)))
        scope[0]["title"] = "客户端标题不是身份"
        again = self.c.ask(self.cid, {**body, "materialScope": scope})
        self.assertEqual(answer, again)
        self.assertEqual(self.model.calls, 1)
        self.assertEqual(len(answer["citations"]), 2)
        self.error("REQUEST_ID_CONFLICT", self.c.ask, self.cid, {**body, "materialScope": scope[:1]})

    def test_implicit_scope_retry_survives_later_import(self):
        body = {"question": "两个条件", "requestId": "implicit"}
        original = self.c.ask(self.cid, body)
        self.material("three", "第三份后续材料。")
        self.assertEqual(original, self.c.ask(self.cid, body))
        self.assertEqual(self.model.calls, 1)

    def test_foreign_stale_and_duplicate_scope_are_rejected(self):
        other = self.c.repo.upsert_course("2026", "foreign", "另一门课")["courseId"]
        body = {"question": "问题", "requestId": "invalid", "materialScope": self.scope()}
        self.error("INVALID_SCOPE", self.c.ask, other, body)
        self.error("INVALID_SCOPE", self.c.ask, self.cid, {**body, "materialScope": self.scope()[:1] * 2})
        stale = self.scope()[:1]
        stale[0]["versionId"] = "ver_stale"
        self.error("INVALID_SCOPE", self.c.ask, self.cid, {**body, "materialScope": stale})
        self.assertEqual(self.model.calls, 0)

    def test_non_object_question_body_is_validation_error(self):
        self.error("INVALID_INPUT", self.c.ask, self.cid, [])

    def test_selected_scope_contains_only_context_materials(self):
        self.w.config = Config(data_dir=Path(self.tmp.name), model="test-fixture", max_context_chars=400)
        # Force retrieval and make only one material relevant.
        for m, text in zip(self.materials, ["电容储存电荷和电场能。", "历史人物和文学作品。"]) :
            self.w.store.finish_material(m["materialId"], [{"page": 1, "text": text * 10}], [])
        # Existing index is derived data; rebuild it from the replacement fixture text.
        with self.w.store.connect() as db:
            db.execute("DELETE FROM course_chunks")
        answer = self.c.ask(self.cid, {"question": "电容储存电荷", "requestId": "selected"})
        self.assertTrue(answer["supported"])
        self.assertEqual([s["materialId"] for s in answer["selectedScope"]], [self.materials[0]["materialId"]])
        self.assertEqual({c["materialId"] for c in self.model.chunks}, {self.materials[0]["materialId"]})

    def test_unknown_material_wrong_version_and_page_never_fall_back(self):
        chunk = self.c.repo.chunks(self.materials[0])[0]
        output = {"supported": True, "answerSegments": [{"text": "结论", "sources": [
            {"segmentId": chunk["segmentId"], "quote": chunk["text"]}]}], "limitations": []}
        for change in ({"materialId": "foreign"}, {"versionId": "wrong"}, {"versionId": None}, {"page": 2}, {"page": True}):
            self.error("INVALID_CITATION", self.w.verify_answer, output, self.materials[0], [{**chunk, **change}], self.materials)

    def test_duplicate_segment_ids_and_fabricated_quotes_rejected(self):
        chunk = self.c.repo.chunks(self.materials[0])[0]
        output = {"supported": True, "answerSegments": [{"text": "结论", "sources": [
            {"segmentId": chunk["segmentId"], "quote": "不在原文中的编造摘录"}]}], "limitations": []}
        self.error("INVALID_CITATION", self.w.verify_answer, output, self.materials[0], [chunk], self.materials)
        self.error("INVALID_CITATION", self.w.verify_answer, output, self.materials[0], [chunk, chunk], self.materials)
        self.error("INVALID_CITATION", self.w.verify_answer, [], self.materials[0], [chunk], self.materials)

    def test_chinese_retrieval_stays_in_budget_and_covers_materials(self):
        chunks = [{"segmentId": str(i), "materialId": str(i // 2), "versionId": "v", "page": 1,
                   "text": "电容电荷与电压成正比。" * 15} for i in range(6)]
        selected, limited = retrieve(chunks, "电容电压", 950)
        self.assertTrue(limited)
        self.assertEqual(len({c["materialId"] for c in selected}), 3)
        self.assertLessEqual(len(json.dumps(selected, ensure_ascii=False)), 950)
        self.assertEqual(retrieve(chunks, "nonexistent_xyz", 950), ([], True))


if __name__ == "__main__":
    unittest.main()
