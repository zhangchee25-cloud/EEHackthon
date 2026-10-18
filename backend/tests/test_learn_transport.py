"""Authentication adapters use synthetic HTML; no school credentials in tests."""
import unittest
from concurrent.futures import Future, TimeoutError as FutureTimeout
import threading
from types import SimpleNamespace
from unittest.mock import patch

from backend.errors import AppError
from backend.learn import BrowserTransport, DIRECT, VPN, extract_csrf
from backend.learn import LearnClient
from backend.courses import CourseService


class LearnTransportTests(unittest.TestCase):
    def test_closed_browser_does_not_keep_connected_status(self):
        transport = BrowserTransport(1000)
        transport.thread = SimpleNamespace(is_alive=lambda: False)
        transport.state = "connected"
        self.assertEqual(transport.status()["status"], "disconnected")

    def test_abandoned_queued_request_is_cancelled_and_queue_is_bounded(self):
        transport = BrowserTransport(1000)
        transport.thread = SimpleNamespace(is_alive=lambda: True)
        class TimedOutFuture(Future):
            def result(self, timeout=None):
                raise FutureTimeout()
        with patch("backend.learn.Future", TimedOutFuture):
            with self.assertRaises(AppError) as caught:
                transport._call("probe")
        self.assertEqual(caught.exception.code, "LEARN_TIMEOUT")
        _, _, abandoned = transport.commands.get_nowait()
        self.assertTrue(abandoned.cancelled())
        self.assertFalse(abandoned.set_running_or_notify_cancel())
        for _ in range(transport.commands.maxsize):
            transport.commands.put_nowait(("probe", (), Future()))
        with self.assertRaises(AppError) as caught:
            transport._call("probe")
        self.assertEqual(caught.exception.code, "LEARN_BUSY")

    def test_import_and_retry_reject_non_objects_and_unhashable_ids(self):
        course = CourseService.__new__(CourseService)
        for body in (None, [], "bad", True):
            for action, args in ((course.start_import, (body,)), (course.retry, ("batch1", body))):
                with self.subTest(body=body, action=action.__name__):
                    with self.assertRaises(AppError) as caught:
                        action(*args)
                    self.assertEqual(caught.exception.code, "INVALID_INPUT")
        for action, args in ((course.start_import, ({"courseId": "course1", "requestId": "req1", "fileIds": [{}]},)),
                             (course.retry, ("batch1", {"itemIds": [{}]}))):
            with self.assertRaises(AppError) as caught:
                action(*args)
            self.assertEqual(caught.exception.code, "INVALID_INPUT")

    def test_worker_exit_holds_schedule_lock_until_deregistered(self):
        course = CourseService.__new__(CourseService)
        course.stop = threading.Event()
        course.worker_lock = threading.Lock()
        course.workers = {"batch1": SimpleNamespace(is_alive=lambda: True)}
        course._run = lambda _: None
        scheduled = []
        course._schedule = scheduled.append
        def read_batch(batch_id):
            self.assertTrue(course.worker_lock.locked())
            return {"items": [{"status": "pending"}]}
        course.repo = SimpleNamespace(batch=read_batch)
        course._worker_main("batch1")
        self.assertEqual(course.workers, {})
        self.assertEqual(scheduled, ["batch1"])

    def test_abnormally_large_school_size_cannot_overflow(self):
        self.assertIsNone(LearnClient._size("9" * 400 + "GB"))

    def test_csrf_script_link_form_meta_variants(self):
        token = "synthetic-token-123"
        for content in (f'<a href="/b/test?_csrf={token}&amp;x=1">',
                        f'<input name="_csrf" value="{token}">',
                        f'<input value="{token}" name="_csrf">',
                        f'<script>var _csrf="{token}";</script>',
                        f'<meta name="_csrf" content="{token}">'):
            self.assertEqual(extract_csrf(content), token)
        self.assertIsNone(extract_csrf("<html>login</html>"))

    def test_probe_ignores_identity_provider(self):
        class LoginPage:
            url = "https://id.tsinghua.edu.cn/do/off/ui/auth/login/"
            def content(self):
                raise AssertionError("must not inspect identity-provider page")
        transport = BrowserTransport(1000)
        transport.context = SimpleNamespace(pages=[LoginPage()])
        transport._probe()
        self.assertEqual(transport.state, "connecting")

    def test_probe_requires_actual_semester_response(self):
        class Page:
            url = DIRECT + "/f/wlxt/index/course/student/index"
            def content(self):
                return '<script>var _csrf="synthetic-only-token";</script>'
        transport = BrowserTransport(1000)
        transport.context = SimpleNamespace(pages=[Page()])
        transport._request = lambda *args: ["2026-2027-1", None]
        transport._probe()
        self.assertEqual(transport.state, "connected")
        transport._request = lambda *args: {"unexpected": []}
        with self.assertRaises(AppError) as e:
            transport._probe()
        self.assertEqual(e.exception.code, "LEARN_SCHEMA_CHANGED")

    def test_vpn_prefix_is_not_double_wrapped(self):
        class Page:
            url = VPN + "/f/wlxt/index/course/student/"
            def content(self):
                return '<input name="_csrf" value="synthetic-only-token">'
        transport = BrowserTransport(1000)
        transport.context = SimpleNamespace(pages=[Page()])
        transport._request = lambda *args: ["2026-2027-1"]
        transport._probe()
        self.assertEqual(transport.prefix, VPN)
        self.assertEqual(transport.state, "connected")
