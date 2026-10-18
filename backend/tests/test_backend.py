from copy import deepcopy
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from backend.config import Config
from backend.errors import AppError
from backend.model import ModelClient
from backend.server import create_server
from backend.service import WorkspaceService
from backend.tests.fixtures import make_pdf


class FixtureModel:
    """Test-only model. Production never imports or selects this class."""
    def __init__(self):
        self.calls = 0
        self.output = None

    def generate(self, question, chunks):
        self.calls += 1
        if self.output is not None:
            return deepcopy(self.output), {}
        return {"supported": True, "answerSegments": [{"text": "线性要求叠加性和齐次性。",
            "sources": [{"segmentId": chunks[0]["segmentId"], "quote": "A linear system satisfies additivity and homogeneity."}]}],
            "limitations": []}, {"total_tokens": 100}


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.config = Config(data_dir=Path(self.temp.name), base_url="http://127.0.0.1", api_key="TEST_ONLY", model="test-model")
        self.model = FixtureModel()
        self.service = WorkspaceService(self.config, self.model)
        self.pdf = make_pdf()
        self.material = self.service.upload("自制课程讲义.pdf", self.pdf)

    def tearDown(self):
        self.temp.cleanup()

    def ask(self, request_id="test_request_1"):
        return self.service.ask({"materialId": self.material["materialId"], "question": "线性是什么意思？", "requestId": request_id})

    def assert_error(self, code, func, *args):
        with self.assertRaises(AppError) as caught:
            func(*args)
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_real_pdf_extraction_dedup_and_restart(self):
        material = self.material
        self.assertEqual(material["status"], "ready")
        self.assertEqual(material["pageCount"], 3)
        self.assertNotIn("pages", material)
        self.assertIn("time-invariant", self.service.store.material(material["materialId"])["pages"][1]["text"])
        duplicate = self.service.upload("不同文件名.pdf", self.pdf)
        self.assertTrue(duplicate["deduplicated"])
        self.assertEqual(duplicate["materialId"], material["materialId"])
        restarted = WorkspaceService(self.config, self.model)
        self.assertEqual(restarted.file(material["materialId"])[0].read_bytes(), self.pdf)

    def test_invalid_encrypted_scanned_and_large_pdfs(self):
        self.assert_error("FILE_TYPE_UNSUPPORTED", self.service.upload, "file.html", b"hello")
        self.assert_error("PDF_INVALID", self.service.upload, "file.pdf", b"<html>login</html>")
        self.assert_error("PDF_INVALID", self.service.upload, "broken.pdf", b"%PDF-1.7\nbroken")
        self.assert_error("PDF_NO_TEXT", self.service.upload, "blank.pdf", self.blank_pdf())
        from pypdf import PdfReader, PdfWriter
        writer = PdfWriter()
        writer.append(PdfReader(BytesIO(self.pdf)))
        writer.encrypt("secret")
        stream = BytesIO()
        writer.write(stream)
        self.assert_error("PDF_ENCRYPTED", self.service.upload, "encrypted.pdf", stream.getvalue())
        self.assert_error("PDF_PAGE_LIMIT", self.service.upload, "too-many.pdf", make_pdf(["text"] * 21))
        small = WorkspaceService(replace(self.config, max_file_bytes=100), self.model)
        self.assert_error("FILE_TOO_LARGE", small.upload, "large.pdf", self.pdf)
        self.assertTrue(all(m["status"] != "processing" for m in self.service.store.list_materials()))

    @staticmethod
    def blank_pdf():
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=595, height=842)
        stream = BytesIO()
        writer.write(stream)
        return stream.getvalue()

    def test_citation_mapping_and_idempotent_questions(self):
        answer = self.ask()
        self.assertTrue(answer["supported"])
        source = answer["citations"][0]
        self.assertEqual(source["pageStart"], 1)
        self.assertEqual(source["versionId"], self.material["versionId"])
        self.assertEqual(answer["answerSegments"][0]["citationIds"], [source["id"]])
        self.assertEqual(self.ask(), answer)
        self.assertEqual(self.model.calls, 1)
        self.assert_error("REQUEST_ID_CONFLICT", self.service.ask, {"materialId": self.material["materialId"], "question": "different", "requestId": "test_request_1"})
        restarted = WorkspaceService(self.config, self.model)
        self.assertEqual(restarted.ask({"materialId": self.material["materialId"], "question": "线性是什么意思？", "requestId": "test_request_1"}), answer)
        self.assertEqual(self.model.calls, 1)

    def test_rejects_forged_source_and_quote(self):
        for source in ({"segmentId": "not_in_material", "quote": "anything"},
                       {"segmentId": [], "quote": "malformed"},
                       {"segmentId": "p1s1", "quote": "A false quote that is not in the text."}):
            self.model.output = {"supported": True, "answerSegments": [{"text": "x", "sources": [source]}], "limitations": []}
            self.assert_error("INVALID_CITATION", self.ask, None)
        self.assertFalse(self.service.store.answer_by_request("test_request_1"))

    def test_missing_model_settings_and_busy_requests_are_explicit(self):
        missing = WorkspaceService(replace(self.config, model=""))
        self.assert_error("MODEL_NOT_CONFIGURED", missing.ask, {"materialId": self.material["materialId"], "question": "q"})
        self.assertFalse(missing.health()["modelConfigured"])
        self.service.ask_lock.acquire()
        try:
            self.assert_error("MODEL_BUSY", self.ask)
        finally:
            self.service.ask_lock.release()
        self.assert_error("INVALID_INPUT", self.service.ask, {"materialId": self.material["materialId"], "question": " "})

    def test_state_validation_and_handwritten_cards(self):
        state = self.service.store.state()
        state["cards"] = [{"id": "handwritten_1", "title": "我的理解", "body": "手动写下的内容", "sourceRefs": [], "reviewStatus": "to_review"}]
        saved = self.service.save_state(state)
        self.assertIn("无材料来源", self.service.export_markdown())
        saved["cards"].append(deepcopy(saved["cards"][0]))
        self.assert_error("INVALID_INPUT", self.service.save_state, saved)
        self.assert_error("REVISION_REQUIRED", self.service.save_state, {"cards": []})
        self.assertEqual(len(self.service.store.state()["cards"]), 1)

    def test_interrupted_upload_is_visible_and_retriable(self):
        import hashlib
        data = make_pdf(["A new test material with enough extractable text."])
        self.service.store.add_material("mat_interrupted", "ver_interrupted", "interrupted.pdf", hashlib.sha256(data).hexdigest())
        restarted = WorkspaceService(self.config, self.model)
        self.assertEqual(restarted.store.material("mat_interrupted")["status"], "failed")
        retried = restarted.upload("interrupted.pdf", data)
        self.assertEqual(retried["status"], "ready")
        self.assertEqual(retried["materialId"], "mat_interrupted")

    def test_insufficient_evidence_and_context_limit(self):
        self.model.output = {"supported": False, "answerSegments": [], "limitations": ["材料未说明这个问题。"]}
        answer = self.ask()
        self.assertFalse(answer["supported"])
        self.assertEqual(answer["citations"], [])
        self.assertEqual(answer["answerSegments"], [])
        tiny = WorkspaceService(replace(self.config, max_context_chars=10), self.model)
        self.assert_error("CONTEXT_TOO_LARGE", tiny.ask, {"materialId": self.material["materialId"], "question": "q"})

    def test_partial_blank_page_warning_preserved_in_answer(self):
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(BytesIO(self.pdf))
        writer = PdfWriter()
        writer.add_page(reader.pages[0])
        writer.add_blank_page(width=595, height=842)
        stream = BytesIO()
        writer.write(stream)
        material = self.service.upload("partial.pdf", stream.getvalue())
        self.assertEqual(material["status"], "ready")
        self.assertEqual(material["pageCount"], 2)
        self.assertTrue(material["warnings"])
        answer = self.service.ask({"materialId": material["materialId"], "question": "线性条件？"})
        self.assertTrue(answer["limitations"])
        self.assertIn("2", answer["limitations"][0])

    def test_answer_claims_without_evidence_are_not_published(self):
        for output in (
            {"supported": True, "answerSegments": [{"text": "Uncited claim", "sources": []}], "limitations": []},
            {"supported": False, "answerSegments": [{"text": "Contradictory claim"}], "limitations": ["no evidence"]},
            {"supported": "yes", "answerSegments": [], "limitations": []},
        ):
            self.model.output = output
            self.assert_error("INVALID_CITATION", self.ask, None)

    def test_card_save_review_reset_conflict_restart_and_export(self):
        answer = self.ask()
        state = self.service.store.state()
        state.update(goal="分清线性与时不变", nextStep="复习因果系统",
            readingPosition={"materialId": self.material["materialId"], "versionId": self.material["versionId"], "page": 2},
            cards=[{"id": "card_1", "title": "我的线性理解", "body": "输入相加、倍乘时输出也遵守同样规则。",
                    "sourceRefs": answer["citations"], "reviewStatus": "to_review"}])
        saved = self.service.save_state(state)
        self.assertEqual(saved["revision"], 1)
        self.assert_error("STATE_CONFLICT", self.service.save_state, state)
        saved["cards"][0]["reviewStatus"] = "self_checked"
        checked = self.service.save_state(saved)
        self.assertIsNotNone(checked["cards"][0]["selfCheckedAt"])
        checked["cards"][0]["body"] = "这是我重新解释过的线性。"
        changed = self.service.save_state(checked)
        self.assertEqual(changed["cards"][0]["reviewStatus"], "to_review")
        self.assertIsNone(changed["cards"][0]["selfCheckedAt"])
        restarted = WorkspaceService(self.config, self.model)
        self.assertEqual(restarted.store.state(), changed)
        output = restarted.export_markdown()
        for value in ("我的线性理解", "这是我重新解释过的线性", "自制课程讲义.pdf", "文件第 1 页", self.material["versionId"]):
            self.assertIn(value, output)

    def test_rejects_forged_saved_sources_and_wrong_reading_page(self):
        source = self.ask()["citations"][0]
        source["pageStart"] = 2
        state = self.service.store.state()
        state["cards"] = [{"id": "card_bad", "title": "x", "body": "x", "sourceRefs": [source], "reviewStatus": "to_review"}]
        self.assert_error("INVALID_SOURCE", self.service.save_state, state)
        state["cards"] = []
        state["readingPosition"] = {"materialId": self.material["materialId"], "versionId": self.material["versionId"], "page": 99}
        self.assert_error("INVALID_READING_POSITION", self.service.save_state, state)
        self.assertEqual(self.service.store.state()["revision"], 0)

    def test_new_file_cannot_overwrite_old_material_or_source(self):
        old = self.ask()["citations"][0]
        new = self.service.upload("自制课程讲义.pdf", make_pdf(["A different lesson with different content."]))
        self.assertNotEqual(new["materialId"], self.material["materialId"])
        self.assertNotEqual(new["versionId"], self.material["versionId"])
        self.assertEqual(self.service.file(old["materialId"])[0].read_bytes(), self.pdf)
        self.assertEqual(self.service.validate_source(old), old)

    def test_http_upload_ranges_json_cors_and_errors(self):
        server = create_server(self.config, self.service, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        def request(path, data=None, headers=None, method=None):
            try:
                with urllib.request.urlopen(urllib.request.Request(base + path, data=data, headers=headers or {}, method=method), timeout=5) as response:
                    return response.status, dict(response.headers), response.read()
            except urllib.error.HTTPError as exc:
                return exc.code, dict(exc.headers), exc.read()
        try:
            status, _, raw = request("/api/health")
            self.assertEqual(status, 200)
            self.assertNotIn("TEST_ONLY", raw.decode())
            boundary = "test_boundary_45"
            data = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="course.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode() + self.pdf + f'\r\n--{boundary}--\r\n'.encode())
            status, _, raw = request("/api/materials", data, {"Content-Type": f"multipart/form-data; boundary={boundary}"})
            self.assertEqual(status, 201)
            file_url = json.loads(raw)["fileUrl"]
            status, headers, raw = request(file_url, headers={"Range": "bytes=0-9"})
            self.assertEqual(status, 206)
            self.assertEqual(raw, self.pdf[:10])
            self.assertEqual(headers["Content-Range"], f"bytes 0-9/{len(self.pdf)}")
            self.assertEqual(request(file_url, headers={"Range": "bytes=999999-"})[0], 416)
            status, headers, raw = request(file_url, method="HEAD")
            self.assertEqual(status, 200)
            self.assertEqual(raw, b"")
            self.assertEqual(int(headers["Content-Length"]), len(self.pdf))
            self.assertEqual(request("/api/health", headers={"Origin": "https://untrusted.invalid"})[0], 403)
            self.assertEqual(request("/api/health", headers={"Host": "untrusted.invalid"})[0], 403)
            status, headers, _ = request("/api/state", headers={"Origin": "http://localhost:5173"}, method="OPTIONS")
            self.assertEqual(status, 204)
            self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
            self.assertEqual(request("/api/ask", b"{", {"Content-Type": "application/json"})[0], 400)
            self.assertEqual(request("/api/ask", b"{}", {"Content-Type": "text/plain"})[0], 415)
            state = json.loads(request("/api/state")[2])
            state["goal"] = "http 保存"
            self.assertEqual(request("/api/state", json.dumps(state).encode(), {"Content-Type": "application/json"}, "PUT")[0], 200)
            self.assertEqual(request("/api/state", json.dumps(state).encode(), {"Content-Type": "application/json"}, "PUT")[0], 409)
            self.assertEqual(request("/not-found")[0], 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


class ModelWireTests(unittest.TestCase):
    def test_provider_throttling_has_one_bounded_retry(self):
        from unittest.mock import patch
        client = ModelClient(Config(base_url="http://127.0.0.1", api_key="TEST_ONLY", model="test"))
        throttled = AppError("MODEL_RATE_LIMITED", "rate limit", 503)
        with patch.object(client, "_request_once", side_effect=[throttled, {"data": []}]) as call, patch("backend.model.time.sleep") as sleep:
            self.assertEqual(client.list_models(), [])
            self.assertEqual(call.call_count, 2)
            sleep.assert_called_once_with(3)
        with patch.object(client, "_request_once", side_effect=throttled) as call, patch("backend.model.time.sleep"):
            with self.assertRaises(AppError):
                client.list_models()
            self.assertEqual(call.call_count, 2)

    def test_chat_and_responses_real_http_wire_and_auth_redaction(self):
        calls = []
        class Upstream(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                calls.append((self.path, body, self.headers.get("Authorization")))
                if body["model"] == "denied":
                    self.send_response(401)
                    raw = b'{"error":"DO_NOT_EXPOSE_TEST_SECRET"}'
                elif self.path.endswith("/responses"):
                    self.send_response(200)
                    raw = json.dumps({"status": "completed", "error": None, "output": [{"type": "message", "content": [{"type": "output_text", "text": '{"supported":false,"answerSegments":[],"limitations":["no evidence"]}'}]}]}).encode()
                else:
                    self.send_response(200)
                    raw = json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": '{"supported":false,"answerSegments":[],"limitations":["no evidence"]}'}}]}).encode()
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
        server = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            config = Config(base_url=f"http://127.0.0.1:{server.server_port}/v1", api_key="DO_NOT_EXPOSE_TEST_SECRET", model="fixture-model")
            for style in ("chat_completions", "responses"):
                value, _ = ModelClient(replace(config, api_style=style)).generate("q", [{"segmentId": "p1s1", "text": "text"}])
                self.assertFalse(value["supported"])
            self.assertEqual(calls[0][0], "/v1/chat/completions")
            self.assertEqual(calls[1][0], "/v1/responses")
            self.assertEqual(calls[0][2], "Bearer DO_NOT_EXPOSE_TEST_SECRET")
            self.assertFalse(calls[1][1]["store"])
            with self.assertRaises(AppError) as caught:
                ModelClient(replace(config, model="denied")).generate("q", [])
            self.assertEqual(caught.exception.code, "MODEL_AUTH_FAILED")
            self.assertNotIn("DO_NOT_EXPOSE_TEST_SECRET", str(caught.exception.payload()))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
