"""School protocol adapter. Authentication is performed by the human in a local browser.

Endpoint/field reference: OneTHU 56484fd91a49ae5304f2ac6a000c39928a6bbb67,
packages/core/src/learn/{urls,client}.ts. Independently written Python implementation.
No school credentials, cookies, page contents or auth URLs are returned or logged.
"""
from concurrent.futures import Future, TimeoutError as FutureTimeout
import html
import json
import os
from pathlib import Path
import queue
import re
import sys
import threading
from urllib.parse import quote, urlencode, urlsplit

from .errors import AppError
from .document_worker import SUPPORTED_EXTENSIONS, libreoffice

DIRECT = "https://learn.tsinghua.edu.cn"
VPN = "https://webvpn.tsinghua.edu.cn/https/77726476706e69737468656265737421fcf2408e297e7c4377068ea48d546d30ca8cc97bcc"
HOME = "/f/wlxt/index/course/student/"
SEMESTERS = "/b/wlxt/kc/v_wlkc_xs_xktjb_coassb/queryxnxq"
LOGIN_PATTERN = re.compile(r'j_spring_security_check|id=["\x27]sm2publicKey|name=["\x27]i_pass|/do/off/ui/auth/login/|re_log', re.I)


def extract_csrf(content):
    patterns = [r'_csrf=([^&"\x27\s<]+)',
                r'name=["\x27]_csrf["\x27][^>]*value=["\x27]([^"\x27]+)',
                r'value=["\x27]([^"\x27]+)["\x27][^>]*name=["\x27]_csrf["\x27]',
                r'["\x27]?_csrf["\x27]?\s*[:=]\s*["\x27]([^"\x27\s]+)["\x27]',
                r'name=["\x27]_csrf["\x27][^>]*content=["\x27]([^"\x27]+)']
    for pattern in patterns:
        match = re.search(pattern, content, re.I)
        if match:
            token = html.unescape(match[1])
            if 5 <= len(token) <= 500:
                return token
    return None


def upstream_id(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 200 or any(ord(c) < 32 for c in value):
        raise AppError("LEARN_SCHEMA_CHANGED", "学校返回的标识格式不合法。", 502)
    return value


def school_error(status, data, content_type=""):
    head = data[:5000].decode("utf-8", "replace")
    if status == 401 or LOGIN_PATTERN.search(head):
        raise AppError("LEARN_NEEDS_AUTH", "学校会话已失效，请本人重新连接后重试。", 401)
    if status == 403:
        raise AppError("LEARN_FORBIDDEN", "学校拒绝访问：可能无权限或会话／CSRF 已失效，请重新连接。", 403)
    if status == 429:
        raise AppError("LEARN_RATE_LIMITED", "学校访问限流，请稍后重试。", 429)
    if status != 200:
        raise AppError("LEARN_UPSTREAM_ERROR", f"学校接口返回 HTTP {status}。", 502)
    if "text/html" in content_type.lower() or head.lstrip().lower().startswith(("<!doctype", "<html")):
        raise AppError("LEARN_NEEDS_AUTH", "学校返回网页而不是数据或文件，请完成登录。", 401)


def rows(data, keys):
    if not isinstance(data, dict):
        raise AppError("LEARN_SCHEMA_CHANGED", "学校目录响应结构变化，未将异常响应当作空目录。", 502)
    for key in keys:
        if isinstance(data.get(key), list):
            if any(not isinstance(r, dict) for r in data[key]):
                break
            return data[key]
    raise AppError("LEARN_SCHEMA_CHANGED", "学校目录字段变化，未将异常响应当作空目录。", 502)


class BrowserTransport:
    """All Playwright operations live on one worker; no model observes login screens."""
    def __init__(self, max_bytes):
        self.max_bytes = max_bytes
        self.commands = queue.Queue(maxsize=32)
        self.thread = None
        self.lock = threading.Lock()
        self.state = "disconnected"
        self.message = "尚未连接网络学堂。"
        self.prefix = DIRECT

    def start(self, mode="direct"):
        if mode not in ("direct", "webvpn"):
            raise AppError("INVALID_INPUT", "连接模式只能为 direct 或 webvpn。", 422)
        with self.lock:
            if self.thread and self.thread.is_alive():
                if self.prefix != (VPN if mode == "webvpn" else DIRECT):
                    raise AppError("LEARN_BROWSER_ACTIVE", "请先断开当前连接，再更换连接方式。", 409)
                return self.status(False)
            self.prefix = VPN if mode == "webvpn" else DIRECT
            self.state, self.message = "connecting", "请在独立学校浏览器窗口中本人完成登录与二次认证，随后进入课程列表。"
            self.thread = threading.Thread(target=self._run, daemon=True, name="school-browser")
            self.thread.start()
        return self.status(False)

    def _run(self):
        browser = None
        try:
            vendor = Path(__file__).parent / "vendor"
            if vendor.is_dir() and str(vendor) not in sys.path:
                sys.path.insert(0, str(vendor))
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                options = {"headless": False}
                executable = os.getenv("LEARN_BROWSER_EXECUTABLE", "").strip()
                if executable:
                    options["executable_path"] = executable
                elif sys.platform == "win32":
                    options["channel"] = "msedge"
                browser = p.chromium.launch(**options)
                self.context = browser.new_context(accept_downloads=False)
                self.page = self.context.new_page()
                try:
                    self.page.goto(self.prefix + HOME, wait_until="domcontentloaded", timeout=30000)
                except Exception:
                    self.message = "学校页面加载未完成，请检查校园网或使用 WebVPN 连接。"
                self.csrf = None
                while browser.is_connected():
                    try:
                        action, args, future = self.commands.get(timeout=0.2)
                    except queue.Empty:
                        self.page.wait_for_timeout(100)
                        continue
                    if not future.set_running_or_notify_cancel():
                        continue
                    try:
                        if action == "close":
                            future.set_result(True)
                            break
                        value = self._probe() if action == "probe" else self._request(*args)
                        future.set_result(value)
                    except AppError as exc:
                        if exc.code in ("LEARN_NEEDS_AUTH", "LEARN_FORBIDDEN"):
                            self.state, self.message = "needs_auth", exc.message
                            self.csrf = None
                        future.set_exception(exc)
                    except Exception:
                        self.state, self.message = "error", "学校连接异常或浏览器已关闭，请重连。"
                        future.set_exception(AppError("LEARN_UNREACHABLE", "学校连接异常或浏览器已关闭，请重连。", 502))
                browser.close()
                self.state, self.message = "disconnected", "学校登录窗口已关闭，请重新连接。"
        except ImportError:
            self.state, self.message = "error", "缺少 playwright 依赖，请安装 backend/requirements.txt。"
        except Exception:
            if browser is not None:
                self.state, self.message = "disconnected", "学校连接已中断或登录窗口已关闭，请重新连接。"
            else:
                self.state, self.message = "error", "无法启动登录浏览器，请安装 Chromium 或配置 LEARN_BROWSER_EXECUTABLE；Windows 默认使用 Edge。"
        finally:
            while not self.commands.empty():
                _, _, future = self.commands.get_nowait()
                if not future.done():
                    future.set_exception(AppError("LEARN_BROWSER_CLOSED", "学校登录浏览器已关闭。", 503))

    def _call(self, action, *args):
        if not self.thread or not self.thread.is_alive():
            raise AppError("LEARN_NEEDS_AUTH", "请先打开本机连接页完成学校登录。", 401)
        f = Future()
        try:
            self.commands.put_nowait((action, args, f))
        except queue.Full:
            raise AppError("LEARN_BUSY", "学校请求队列已满，请稍后重试。", 429) from None
        try:
            return f.result(timeout=40)
        except FutureTimeout:
            # Do not execute an abandoned request if it has not started yet.
            f.cancel()
            raise AppError("LEARN_TIMEOUT", "学校请求超时，请稍后重试。", 504) from None

    def _probe(self):
        # Only inspect a school course page, never the identity-provider login page.
        self.csrf = None
        for page in self.context.pages:
            url = page.url
            parts = urlsplit(url)
            direct_course = parts.hostname == "learn.tsinghua.edu.cn" and parts.path.startswith("/f/wlxt/")
            vpn_course = url.startswith(VPN + "/f/wlxt/")
            if not (direct_course or vpn_course):
                continue
            self.prefix = VPN if vpn_course else DIRECT
            self.csrf = extract_csrf(page.content())
            if self.csrf:
                break
        if not self.csrf:
            paths = [urlsplit(p.url).path[:120] for p in self.context.pages if p.url.startswith(self.prefix)]
            self.state, self.message = "connecting", "尚未取得课程会话，请在学校窗口进入课程列表。当前学校路径：" + (", ".join(paths) or "未到达网络学堂")
            return
        # Successful auth means an actual semester JSON response, not merely a token.
        data = self._request(SEMESTERS, False)
        if not isinstance(data, list) or any(x is not None and (not isinstance(x, str) or not re.fullmatch(r"\d{4}-\d{4}-\d", x)) for x in data):
            raise AppError("LEARN_SCHEMA_CHANGED", "学校学期数据结构不符合预期，请检查账号与接口。", 502)
        self.state, self.message = "connected", "已验证学校学期接口，可以选择课程并导入。"

    def _request(self, path, binary=False):
        if not self.csrf:
            raise AppError("LEARN_NEEDS_AUTH", "请先本人完成学校登录。", 401)
        if not path.startswith("/b/"):
            raise AppError("INVALID_INPUT", "不允许的学校接口路径。", 422)
        url = self.prefix + path + ("&" if "?" in path else "?") + urlencode({"_csrf": self.csrf})
        response = self.context.request.get(url, timeout=30000, max_redirects=0,
            headers={"Referer": self.prefix + HOME, "X-Requested-With": "XMLHttpRequest"})
        try:
            if 300 <= response.status < 400:
                raise AppError("LEARN_NEEDS_AUTH", "学校请求发生重定向，请重新连接。", 401)
            limit = self.max_bytes if binary else 2 * 1024 * 1024
            length = response.headers.get("content-length")
            if length and length.isdigit() and int(length) > limit:
                raise AppError("FILE_TOO_LARGE", "学校响应超过本次允许大小。", 413)
            content = response.body()
            if len(content) > limit:
                raise AppError("FILE_TOO_LARGE", "学校响应超过本次允许大小。", 413)
            school_error(response.status, content, response.headers.get("content-type", ""))
            if binary:
                # Document parser validates the selected file format after download.
                return content
            try:
                return json.loads(content)
            except (ValueError, UnicodeDecodeError):
                raise AppError("LEARN_SCHEMA_CHANGED", "学校未返回有效 JSON，接口可能已变化。", 502) from None
        finally:
            response.dispose()

    def status(self, probe=True):
        if self.thread and not self.thread.is_alive() and self.state in ("connected", "connecting", "needs_auth"):
            self.state, self.message = "disconnected", "学校登录窗口已关闭，请重新连接。"
        if probe and self.thread and self.thread.is_alive() and self.state in ("connecting", "needs_auth", "connected", "error"):
            try:
                self._call("probe")
            except AppError as exc:
                if exc.code not in ("LEARN_NEEDS_AUTH", "LEARN_FORBIDDEN"):
                    self.state, self.message = "error", exc.message
        return {"status": self.state, "message": self.message, "loginUrl": "/api/learn/connect"}

    def request(self, path, binary=False):
        return self._call("request", path, binary)

    def close(self):
        if self.thread and self.thread.is_alive():
            self._call("close")
            self.thread.join(timeout=5)


class LearnClient:
    def __init__(self, config, transport=None):
        self.transport = transport or BrowserTransport(config.max_file_bytes)
        self.config = config

    def status(self):
        return self.transport.status()

    def semesters(self):
        data = self.transport.request(SEMESTERS)
        if not isinstance(data, list) or any(s is not None and (not isinstance(s, str) or not re.fullmatch(r"\d{4}-\d{4}-\d", s)) for s in data):
            raise AppError("LEARN_SCHEMA_CHANGED", "学校学期列表格式变化。", 502)
        return [{"id": s, "name": s} for s in sorted({s for s in data if s}, reverse=True)]

    def courses(self, semester):
        if not isinstance(semester, str) or not re.fullmatch(r"\d{4}-\d{4}-\d", semester):
            raise AppError("INVALID_INPUT", "semesterId 格式不合法。", 422)
        data = self.transport.request("/b/wlxt/kc/v_wlkc_xs_xkb_kcb_extend/student/loadCourseBySemesterId/" + quote(semester, safe="") + "/zh")
        result = []
        for c in rows(data, ("resultList",)):
            uid = upstream_id(c.get("wlkcid"))
            name = c.get("kcm") or c.get("zywkcm")
            if not isinstance(name, str) or not name.strip():
                raise AppError("LEARN_SCHEMA_CHANGED", "学校课程缺少名称。", 502)
            result.append((uid, html.unescape(name)[:500]))
        return result

    def files(self, course):
        data = self.transport.request("/b/wlxt/kj/wlkc_kjxxb/student/kjxxbByWlkcidAndSizeForStudent?" +
            urlencode({"wlkcid": course["upstreamCourseId"], "size": 200}))
        result = []
        for f in rows(data, ("object", "resultList")):
            fid = upstream_id(f.get("wjid"))
            title = html.unescape(str(f.get("bt") or f.get("kjbt") or fid))[:200]
            kind = str(f.get("wjlx") or Path(title).suffix).lower().lstrip(".")
            size = self._size(f.get("fileSize"))
            reason = "支持 PDF、DOCX、PPTX、Markdown 和 TXT。" if "." + kind not in SUPPORTED_EXTENSIONS else (
                f"文件超过本次 {self.config.max_file_bytes / 1024 / 1024:g} MB 上限。" if size is not None and size > self.config.max_file_bytes else None)
            if reason is None and kind in {"doc", "ppt"} and not libreoffice():
                reason = "旧 DOC / PPT 需要本机安装 LibreOffice，或请先另存为 DOCX / PPTX。"
            result.append({"fileId": fid, "courseId": course["courseId"], "title": title, "fileType": kind,
                "sizeBytes": size, "supported": reason is None, "unsupportedReason": reason})
        if len({f["fileId"] for f in result}) != len(result):
            raise AppError("LEARN_SCHEMA_CHANGED", "学校文件目录含重复 ID，未覆盖目录数据。", 502)
        return {"files": result, "complete": len(result) < 200,
            "warnings": ["目录达到 200 项接口上限，可能不完整。"] if len(result) >= 200 else []}

    @staticmethod
    def _size(value):
        if value is None or isinstance(value, bool):
            return None
        match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?\s*", str(value), re.I)
        if not match:
            return None
        try:
            return int(float(match[1]) * {"B": 1, "KB": 1024, "MB": 1024 ** 2, "GB": 1024 ** 3}[str(match[2] or "B").upper()])
        except (ValueError, OverflowError):
            return None

    def download(self, file_id):
        return self.transport.request("/b/wlxt/kj/wlkc_kjxxb/student/downloadFile?" +
                                      urlencode({"sfgk": 0, "wjid": file_id}), True)


CONNECT_HTML = """<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>知页 · 连接网络学堂</title><style>body{font:17px system-ui;max-width:680px;margin:10vh auto;padding:24px;line-height:1.8;background:#f5f4ef;color:#202b25}button,select{font:inherit;padding:8px 16px;margin:8px 8px 8px 0}#status{padding:18px;background:white;border-radius:12px}</style>
<h1>连接网络学堂</h1><p>点击按钮打开独立学校浏览器。在学校页面中由你本人登录并完成二次认证，登录后进入网络学堂课程列表。账号密码只输入学校页面。</p>
<select id="mode"><option value="direct">校园网直连</option><option value="webvpn">校外 WebVPN</option></select>
<button id="start">打开学校登录窗口</button><button id="check">验证连接</button><button id="disconnect">断开</button>
<p id="status">正在读取状态…</p><p>验证成功后返回学习页面，刷新连接状态并选择课程。会话仅保存在本进程，重启后重新登录；导入材料和进度保留。</p>
<script>const s=document.getElementById('status');async function call(path,body){try{const r=await fetch('/api/learn/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const x=await r.json();s.textContent=x.error?x.error.message:x.message;return x}catch(e){s.textContent='连接本机后端失败，请检查服务。'}}document.getElementById('start').onclick=()=>call('connect',{mode:document.getElementById('mode').value});document.getElementById('check').onclick=()=>call('status');document.getElementById('disconnect').onclick=()=>call('disconnect',{});call('status');setInterval(()=>call('status'),5000);</script></html>"""
