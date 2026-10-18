"""Local single-user HTTP transport. No public deployment or authentication claim."""
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import re
import socket
from urllib.parse import quote, urlsplit, unquote, parse_qs
import uuid

from .errors import AppError
from .service import WorkspaceService, public_material, identifier, text_field
from .learn import CONNECT_HTML

LOG = logging.getLogger("learning_workspace")


def create_server(config, service=None, port=None):
    service = service or WorkspaceService(config)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "LearningWorkspace/1.0"
        sys_version = ""

        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self, fmt, *args):
            # Requests, question text, filenames, and upstream errors are not logged.
            return

        def common_headers(self):
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Request-Id", self.request_id)
            origin = self.headers.get("Origin")
            if origin and self.allowed_origin(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Expose-Headers", "Content-Disposition, Content-Range, X-Request-Id")

        def allowed_origin(self, origin):
            return origin in config.allowed_origins or origin in (
                f"http://localhost:{self.server.server_port}", f"http://127.0.0.1:{self.server.server_port}")

        def guard(self):
            self.request_id = "req_" + uuid.uuid4().hex
            try:
                host = urlsplit("http://" + self.headers.get("Host", "")).hostname
            except ValueError:
                host = None
            if host not in ("127.0.0.1", "localhost", "::1"):
                raise AppError("HOST_NOT_ALLOWED", "本服务仅供本机使用，请通过 localhost 或 127.0.0.1 访问。", 403)
            origin = self.headers.get("Origin")
            if origin and not self.allowed_origin(origin):
                raise AppError("ORIGIN_NOT_ALLOWED", "当前页面来源未被允许，请配置前端代理或本机 ALLOWED_ORIGINS。", 403)

        def send_bytes(self, body, status=200, content_type="application/json; charset=utf-8", headers=None):
            self.send_response(status)
            self.common_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.close_connection = True
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def json(self, body, status=200):
            self.send_bytes(json.dumps(body, ensure_ascii=False).encode("utf-8"), status)

        def read_body(self, maximum):
            if self.headers.get("Transfer-Encoding"):
                raise AppError("TRANSFER_ENCODING_UNSUPPORTED", "请发送带 Content-Length 的请求。", 411)
            lengths = self.headers.get_all("Content-Length", [])
            try:
                if len(lengths) != 1:
                    raise ValueError()
                length = int(lengths[0])
            except ValueError:
                raise AppError("CONTENT_LENGTH_REQUIRED", "请求必须包含一个有效的 Content-Length。", 411) from None
            if length < 0 or length > maximum:
                raise AppError("BODY_TOO_LARGE", "请求体超过允许大小。", 413)
            data = self.rfile.read(length)
            if len(data) != length:
                raise AppError("BODY_INCOMPLETE", "请求未完整传输，请重试。", 400)
            return data

        def read_json(self):
            if self.headers.get_content_type() != "application/json":
                raise AppError("CONTENT_TYPE_REQUIRED", "请使用 application/json 提交请求。", 415)
            try:
                body = json.loads(self.read_body(6 * 1024 * 1024).decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                raise AppError("INVALID_JSON", "请求不是有效 UTF-8 JSON。", 400) from None
            if not isinstance(body, dict):
                raise AppError("INVALID_INPUT", "请求必须为 JSON 对象。", 422)
            return body

        def upload(self, course_id=None):
            if course_id:
                service.courses.repo.course(course_id)
            content_type = self.headers.get("Content-Type", "")
            if self.headers.get_content_type() != "multipart/form-data":
                raise AppError("CONTENT_TYPE_REQUIRED", "上传需要 multipart/form-data，文件字段名为 file。", 415)
            raw = self.read_body(config.max_file_bytes + 128 * 1024)
            message = BytesParser(policy=policy.default).parsebytes(
                ("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode("utf-8") + raw)
            if not message.is_multipart() or message.defects:
                raise AppError("INVALID_MULTIPART", "上传数据格式不合法，请重新选择文件。", 400)
            files = [part for part in message.iter_parts() if part.get_param("name", header="content-disposition") == "file"]
            if len(files) != 1 or files[0].is_multipart() or not files[0].get_filename():
                raise AppError("FILE_REQUIRED", "一次仅上传一份材料，字段名为 file。", 422)
            result = service.upload(files[0].get_filename(), files[0].get_payload(decode=True) or b"")
            if course_id:
                material = service.store.material(result['materialId'])
                with service.store.connect() as db:
                    digest = db.execute('SELECT digest FROM materials WHERE id=?', (material['materialId'],)).fetchone()[0]
                service.courses.repo.link(course_id, 'local_' + material['materialId'], material, digest)
            return result

        def send_pdf(self, material_id):
            path, material = service.file(material_id)
            size = path.stat().st_size
            start, end, status = 0, size - 1, 200
            ranges = self.headers.get("Range")
            if ranges:
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", ranges.strip())
                if not match or not any(match.groups()):
                    self.send_bytes(b"", 416, headers={"Content-Range": f"bytes */{size}"})
                    return
                first, last = match.groups()
                if first:
                    start = int(first)
                    end = min(int(last), size - 1) if last else size - 1
                else:
                    suffix = int(last)
                    start = max(0, size - suffix) if suffix else size
                if start >= size or end < start:
                    self.send_bytes(b"", 416, headers={"Content-Range": f"bytes */{size}"})
                    return
                status = 206
            download_title = material['title'] if material['title'].lower().endswith('.pdf') else material['title'] + '.pdf'
            headers = {"Accept-Ranges": "bytes", "Content-Disposition": "inline; filename=course.pdf; filename*=UTF-8''" + quote(download_title)}
            if status == 206:
                headers["Content-Range"] = f"bytes {start}-{end}/{size}"
            with path.open("rb") as f:
                f.seek(start)
                self.send_bytes(f.read(end - start + 1), status, "application/pdf", headers)

        def dispatch(self):
            try:
                self.guard()
                path = unquote(urlsplit(self.path).path).rstrip("/") or "/"
                method = self.command
                query = parse_qs(urlsplit(self.path).query)
                if method == "OPTIONS":
                    self.send_bytes(b"", 204, headers={"Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, Range", "Access-Control-Max-Age": "600"})
                    return
                if method in ("GET", "HEAD"):
                    if path == "/api/learn/connect":
                        self.send_bytes(CONNECT_HTML.encode("utf-8"), content_type="text/html; charset=utf-8",
                            headers={"Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'"})
                    elif path == "/api/learn/status":
                        self.json(service.courses.learn.status())
                    elif path == "/api/learn/semesters":
                        self.json({"semesters": service.courses.learn.semesters()})
                    elif path == "/api/learn/courses":
                        self.json(service.courses.list_courses(query.get("semesterId", [None])[0]))
                    elif match := re.fullmatch(r"/api/learn/courses/([A-Za-z0-9_-]+)/files", path):
                        self.json(service.courses.list_files(match[1]))
                    elif path == "/api/learn/imports":
                        self.json({"batches": service.courses.repo.batches(identifier(query.get("courseId", [None])[0], "courseId"))})
                    elif match := re.fullmatch(r"/api/learn/imports/([A-Za-z0-9_-]+)", path):
                        self.json(service.courses.repo.batch(match[1]))
                    elif match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/materials", path):
                        self.json(service.courses.materials(match[1]))
                    elif match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/exams", path):
                        self.json(service.courses.exams.listing(match[1]))
                    elif match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/board", path):
                        self.json(service.courses.repo.board(match[1]))
                    elif path == "/api/health":
                        self.json(service.health())
                    elif path == "/api/state":
                        self.json(service.store.state())
                    elif path == "/api/materials":
                        self.json({"materials": [public_material(m) for m in service.store.list_materials()]})
                    elif path == "/api/export":
                        self.send_bytes(service.export_markdown().encode("utf-8"), content_type="text/markdown; charset=utf-8",
                            headers={"Content-Disposition": "attachment; filename=study-cards.md"})
                    elif match := re.fullmatch(r"/api/materials/([A-Za-z0-9_-]+)/file", path):
                        self.send_pdf(match[1])
                    elif match := re.fullmatch(r"/api/materials/([A-Za-z0-9_-]+)", path):
                        self.json(public_material(service.store.material(match[1])))
                    elif path == "/":
                        self.send_bytes("学习 Agent 后端已启动。本机单用户演示。前端请接入 /api，接口与启动说明见 backend/README.md 和 docs/api-contract.md。".encode("utf-8"), content_type="text/plain; charset=utf-8")
                    else:
                        raise AppError("NOT_FOUND", "接口不存在。", 404)
                elif method == "POST" and path == "/api/learn/connect":
                    body = self.read_json()
                    self.json(service.courses.learn.transport.start(body.get("mode", "direct")), 202)
                elif method == "POST" and path == "/api/learn/disconnect":
                    self.read_json()
                    service.courses.learn.transport.close()
                    self.json(service.courses.learn.status())
                elif method == "POST" and path == "/api/learn/imports":
                    self.json(service.courses.start_import(self.read_json()), 202)
                elif method == "POST" and (match := re.fullmatch(r"/api/learn/imports/([A-Za-z0-9_-]+)/retry", path)):
                    self.json(service.courses.retry(match[1], self.read_json()))
                elif method == "POST" and (match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/ask", path)):
                    self.json(service.courses.ask(match[1], self.read_json()))
                elif method == "POST" and (match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/materials", path)):
                    self.json(self.upload(match[1]), 201)
                elif method == "POST" and (match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/exams/analyze", path)):
                    self.json(service.courses.exams.analyze(match[1], self.read_json()))
                elif method == "POST" and (match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/exams", path)):
                    self.json(service.courses.exams.register(match[1], self.read_json()))
                elif method == "POST" and (match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/board/generate", path)):
                    self.json(service.courses.generate_board(match[1], self.read_json()))
                elif method == "POST" and (match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/board/apply", path)):
                    self.json(service.courses.apply_board(match[1], self.read_json()))
                elif method == "PUT" and (match := re.fullmatch(r"/api/courses/([A-Za-z0-9_-]+)/board", path)):
                    self.json(service.courses.repo.save_board(match[1], self.read_json(), identifier, text_field))
                elif method == "POST" and path == "/api/materials":
                    self.json(self.upload(), 201)
                elif method == "POST" and path == "/api/ask":
                    self.json(service.ask(self.read_json()))
                elif method == "PUT" and path == "/api/state":
                    self.json(service.save_state(self.read_json()))
                else:
                    raise AppError("METHOD_NOT_ALLOWED", "此接口不支持该请求方式。", 405)
            except AppError as exc:
                self.json({**exc.payload(), "requestId": self.request_id}, exc.status)
            except (BrokenPipeError, ConnectionResetError):
                return
            except socket.timeout:
                self.json(AppError("REQUEST_TIMEOUT", "请求读取超时，请重试。", 408).payload(), 408)
            except Exception as exc:
                LOG.error("request=%s unexpected_type=%s", getattr(self, "request_id", "unknown"), type(exc).__name__)
                self.json(AppError("INTERNAL_ERROR", "服务处理失败，请保留输入，并检查数据目录和服务状态。", 500).payload(), 500)

        do_GET = do_HEAD = do_POST = do_PUT = do_OPTIONS = do_DELETE = do_PATCH = dispatch

    class Server(ThreadingHTTPServer):
        daemon_threads = True
        allow_reuse_address = True

        def server_close(self):
            service.courses.close()
            super().server_close()

    if config.host not in ("127.0.0.1", "localhost"):
        raise ValueError("本机演示后端只允许绑定 127.0.0.1 或 localhost；未实现公网登录鉴权。")
    server = Server((config.host, config.port if port is None else port), Handler)
    server.workspace_service = service
    return server

