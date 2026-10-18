import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import threading
import uuid

from .errors import AppError
from .model import ModelClient
from .storage import Store, now

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
SOURCE_KEYS = ("id", "materialId", "versionId", "title", "pageStart", "pageEnd", "quote")


def identifier(value, name="id"):
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise AppError("INVALID_INPUT", f"{name} 格式不合法。", 422)
    return value


def text_field(value, name, maximum, empty=True):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise AppError("INVALID_INPUT", f"{name} 不能为空或超过 {maximum} 字符，且必须是字符串。", 422)
    return value


def public_material(material):
    result = {key: value for key, value in material.items() if key != "pages"}
    result["fileUrl"] = f"/api/materials/{material['materialId']}/file"
    return result


def normalized(value):
    return re.sub(r"\s+", "", value)


class WorkspaceService:
    def __init__(self, config, model_client=None):
        self.config = config
        self.store = Store(config.data_dir)
        self.model = model_client or ModelClient(config)
        self.upload_lock = threading.Lock()
        self.ask_lock = threading.Lock()
        self.import_lock = threading.Lock()
        from .courses import CourseService
        self.courses = CourseService(self)

    def health(self):
        missing = [key for key, value in (("MODEL_BASE_URL", self.config.base_url),
                   ("MODEL_API_KEY", self.config.api_key), ("MODEL_NAME", self.config.model)) if not value]
        return {"status": "ok", "mode": "local_single_user", "modelConfigured": not missing,
                "missingSettings": missing, "model": self.config.model or None,
                "apiStyle": self.config.api_style,
                "limits": {"maxFileBytes": self.config.max_file_bytes, "maxPdfPages": self.config.max_pages,
                           "maxContextChars": self.config.max_context_chars},
                "notice": "本机单用户学习空间；网络学堂需本人连接；未接入 FreeBBS。"}

    def upload(self, filename, content):
        title = re.split(r"[/\\]", filename)[-1].strip() if isinstance(filename, str) else ""
        if not title.lower().endswith(".pdf") or not title or len(title) > 200:
            raise AppError("FILE_TYPE_UNSUPPORTED", "请上传文件名不超过 200 字符的文本 PDF。", 415)
        if not content or len(content) > self.config.max_file_bytes:
            raise AppError("FILE_TOO_LARGE", f"文件为空或超过 {self.config.max_file_bytes // 1024 // 1024} MB。", 413)
        if not content.lstrip()[:8].startswith(b"%PDF-"):
            raise AppError("PDF_INVALID", "文件不是有效 PDF；登录网页或改后缀文件不能作为 PDF 上传。", 415)
        digest = hashlib.sha256(content).hexdigest()
        with self.upload_lock:
            existing = self.store.by_digest(digest)
            if existing and existing["status"] == "ready":
                return {**public_material(existing), "deduplicated": True}
            material_id = existing["materialId"] if existing else "mat_" + uuid.uuid4().hex
            version_id = existing["versionId"] if existing else "ver_" + uuid.uuid4().hex
            if not existing:
                self.store.add_material(material_id, version_id, title, digest)
            else:
                with self.store.connect() as db:
                    db.execute("UPDATE materials SET status='processing',error=NULL WHERE id=?", (material_id,))
            path = self.store.files_dir / (material_id + ".pdf")
            temporary = path.with_suffix(".tmp")
            try:
                temporary.write_bytes(content)
                temporary.replace(path)
                try:
                    proc = subprocess.run([sys.executable, str(Path(__file__).with_name("pdf_worker.py")),
                                           str(path), str(self.config.max_pages)],
                                          capture_output=True, text=True, encoding="utf-8", timeout=25,
                                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                except subprocess.TimeoutExpired:
                    raise AppError("PDF_PARSE_TIMEOUT", "PDF 解析超过 25 秒，请换用更短的文本 PDF。", 422) from None
                try:
                    result = json.loads(proc.stdout)
                except (ValueError, TypeError):
                    raise AppError("PDF_PARSE_FAILED", "PDF 解析进程失败，请确认依赖安装后重新上传。", 422) from None
                if "error" in result:
                    raise AppError(result["error"], result["message"], 422)
                self.store.finish_material(material_id, result["pages"], result["warnings"])
            except AppError as exc:
                self.store.fail_material(material_id, exc.message)
                raise AppError(exc.code, exc.message, exc.status, {"materialId": material_id, "status": "failed"}) from None
            except OSError:
                self.store.fail_material(material_id, "文件保存失败，请检查本机数据目录权限和剩余空间。")
                raise AppError("STORAGE_FAILED", "文件保存失败，请检查本机数据目录权限和剩余空间。", 500) from None
            finally:
                temporary.unlink(missing_ok=True)
            return {**public_material(self.store.material(material_id)), "deduplicated": False}

    def file(self, material_id):
        material = self.store.material(identifier(material_id, "materialId"))
        if material["status"] != "ready":
            raise AppError("MATERIAL_NOT_READY", "材料解析失败或尚未完成，不能阅读或提问。", 409)
        path = self.store.files_dir / (material_id + ".pdf")
        if not path.is_file():
            raise AppError("FILE_MISSING", "材料文件缺失，请重新上传。", 404)
        return path, material

    def chunks(self, material):
        chunks = []
        for page in material["pages"]:
            text = page["text"]
            for index, start in enumerate(range(0, len(text), 1400), 1):
                chunks.append({"segmentId": f"p{page['page']}s{index}", "page": page["page"], "text": text[start:start + 1400]})
        size = len(json.dumps(chunks, ensure_ascii=False))
        if size > self.config.max_context_chars:
            raise AppError("CONTEXT_TOO_LARGE", f"材料上下文超过 {self.config.max_context_chars} 字符，请拆分 PDF 后再提问；未静默截断材料。", 413)
        return chunks

    def ask(self, body):
        if not isinstance(body, dict):
            raise AppError("INVALID_INPUT", "请求必须是 JSON 对象。", 422)
        material_id = identifier(body.get("materialId"), "materialId")
        question = text_field(body.get("question"), "question", self.config.max_question_chars, False).strip()
        request_id = identifier(body["requestId"], "requestId") if body.get("requestId") is not None else None
        if not self.ask_lock.acquire(timeout=0.1):
            raise AppError("MODEL_BUSY", "已有问题正在处理，请等待当前回答完成。", 429)
        try:
            previous = self.store.answer_by_request(request_id)
            if previous:
                if previous["result"].get("courseId") or previous["materialId"] != material_id or previous["question"] != question:
                    raise AppError("REQUEST_ID_CONFLICT", "同一 requestId 不能用于不同问题或材料。", 409)
                return previous["result"]
            self.file(material_id)
            material = self.store.material(material_id)
            chunks = self.chunks(material)
            output, usage = self.model.generate(question, chunks)
            result = self.verify_answer(output, material, chunks)
            result.update({"answerId": "ans_" + uuid.uuid4().hex, "question": question, "createdAt": now(),
                           "model": self.config.model, "usage": self.safe_usage(usage)})
            self.store.save_answer(result["answerId"], material_id, question, request_id, result)
            return result
        finally:
            self.ask_lock.release()

    @staticmethod
    def safe_usage(usage):
        if not isinstance(usage, dict):
            return {}
        return {k: v for k, v in usage.items() if k in ("prompt_tokens", "completion_tokens", "total_tokens",
                  "input_tokens", "output_tokens") and isinstance(v, int) and not isinstance(v, bool) and v >= 0}

    def verify_answer(self, output, material, chunks, materials=None):
        def invalid(message):
            raise AppError("INVALID_CITATION", message, 502)
        if not isinstance(output, dict):
            invalid("模型回答必须为结构化对象。")
        supported = output.get("supported")
        limitations = output.get("limitations", [])
        segments = output.get("answerSegments", [])
        if not isinstance(supported, bool) or not isinstance(limitations, list) or len(limitations) > 20:
            invalid("模型回答结构不合法，未展示未经校验的内容。")
        if any(not isinstance(x, str) or len(x) > 2000 for x in limitations):
            invalid("模型的依据不足说明格式不合法。")
        if not isinstance(segments, list) or len(segments) > 30:
            invalid("模型回答段落格式不合法。")
        multi_material = materials is not None
        materials = materials if multi_material else ([material] if material is not None else [])
        material_map = {m["materialId"]: m for m in materials}
        result = {"supported": supported, "answerSegments": [], "citations": [],
                  "selectedScope": [{k: m[k] for k in ("materialId", "versionId", "title")} for m in materials],
                  "limitations": list(dict.fromkeys([warning for m in materials for warning in m["warnings"]] + limitations))}
        if not supported:
            if segments:
                invalid("模型在声明依据不足时仍返回结论，已拒绝展示，请重试。")
            if not result["limitations"]:
                result["limitations"] = ["当前材料没有足够依据回答这个问题，请补充相关章节。"]
            return result
        if not segments:
            invalid("模型未提供带出处的结论。")
        chunk_map = {c["segmentId"]: c for c in chunks}
        if len(chunk_map) != len(chunks):
            invalid("材料片段标识重复，无法唯一确定出处。")
        seen = {}
        prefix = uuid.uuid4().hex
        for index, segment in enumerate(segments, 1):
            if not isinstance(segment, dict) or not isinstance(segment.get("text"), str) or not segment["text"].strip() or len(segment["text"]) > 8000:
                invalid("模型结论为空或结构不合法。")
            sources = segment.get("sources")
            if not isinstance(sources, list) or not 1 <= len(sources) <= 12:
                invalid("模型结论缺少出处，未展示未经校验的答案。")
            citation_ids = []
            for source in sources:
                if not isinstance(source, dict) or not isinstance(source.get("segmentId"), str) or source["segmentId"] not in chunk_map:
                    invalid("模型引用了本次材料以外的片段，已拒绝此回答。")
                chunk = chunk_map[source["segmentId"]]
                source_material = material_map.get(chunk.get("materialId")) if multi_material else material
                if source_material is None or (multi_material and chunk.get("versionId") != source_material["versionId"]) or (not multi_material and chunk.get("materialId", source_material["materialId"]) != source_material["materialId"]):
                    invalid("引用片段不属于本次材料版本集合。")
                if not multi_material and chunk.get("versionId", source_material["versionId"]) != source_material["versionId"]:
                    invalid("引用片段不属于本次材料版本集合。")
                if type(chunk.get("page")) is not int or not 1 <= chunk["page"] <= source_material["pageCount"]:
                    invalid("引用片段页序超出材料范围。")
                quote = source.get("quote")
                if not isinstance(quote, str) or not 2 <= len(quote.strip()) <= 1800:
                    invalid("模型引用摘录为空、过短或过长。")
                quote = quote.strip()
                if normalized(quote) not in normalized(chunk["text"]):
                    invalid("模型引用摘录无法在原文中找到，已拒绝此回答。")
                key = (chunk["segmentId"], quote)
                if key not in seen:
                    citation_id = "cit_" + prefix + "_" + str(len(seen) + 1)
                    seen[key] = citation_id
                    result["citations"].append({"id": citation_id, "materialId": source_material["materialId"],
                        "versionId": source_material["versionId"], "title": source_material["title"],
                        "pageStart": chunk["page"], "pageEnd": chunk["page"], "quote": quote})
                citation_ids.append(seen[key])
            result["answerSegments"].append({"id": "seg_" + str(index), "text": segment["text"].strip(),
                                               "citationIds": list(dict.fromkeys(citation_ids))})
        return result

    def validate_source(self, source):
        if not isinstance(source, dict) or any(key not in source for key in SOURCE_KEYS):
            raise AppError("INVALID_SOURCE", "卡片来源字段不完整。", 422)
        source = {key: source[key] for key in SOURCE_KEYS}
        for key in ("id", "materialId", "versionId"):
            identifier(source[key], key)
        text_field(source["title"], "source.title", 200, False)
        text_field(source["quote"], "source.quote", 1800, False)
        if any(type(source[key]) is not int for key in ("pageStart", "pageEnd")):
            raise AppError("INVALID_SOURCE", "卡片来源页序必须为整数。", 422)
        if not self.store.citation_exists(source):
            raise AppError("INVALID_SOURCE", "卡片来源不是服务端已校验的回答引用，不能伪造或修改。", 422)
        return source

    def validate_state(self, body, old):
        if not isinstance(body, dict) or set(body) - {"revision", "activeCourseId", "goal", "nextStep", "readingPosition", "cards", "updatedAt"}:
            raise AppError("INVALID_INPUT", "学习状态包含未约定字段。", 422)
        result = {"goal": text_field(body.get("goal"), "goal", 1000),
                  "nextStep": text_field(body.get("nextStep"), "nextStep", 2000),
                  "readingPosition": None, "cards": []}
        active = body.get("activeCourseId", old.get("activeCourseId"))
        if active is not None:
            self.courses.repo.course(identifier(active, "activeCourseId"))
        result["activeCourseId"] = active
        position = body.get("readingPosition")
        if position is not None:
            if not isinstance(position, dict):
                raise AppError("INVALID_INPUT", "readingPosition 格式不合法。", 422)
            material = self.store.material(identifier(position.get("materialId"), "materialId"))
            if position.get("versionId") != material["versionId"] or material["status"] != "ready":
                raise AppError("INVALID_READING_POSITION", "阅读位置的材料版本不可用。", 422)
            if type(position.get("page")) is not int or not 1 <= position["page"] <= material["pageCount"]:
                raise AppError("INVALID_READING_POSITION", "阅读位置超出文件页数。", 422)
            result["readingPosition"] = {key: position[key] for key in ("materialId", "versionId", "page")}
        cards = body.get("cards")
        if not isinstance(cards, list) or len(cards) > 200:
            raise AppError("INVALID_INPUT", "cards 必须为数组且不超过 200 张。", 422)
        old_cards = {card["id"]: card for card in old["cards"]}
        seen = set()
        timestamp = now()
        for card in cards:
            if not isinstance(card, dict):
                raise AppError("INVALID_INPUT", "卡片格式不合法。", 422)
            card_id = identifier(card.get("id"), "card.id")
            if card_id in seen:
                raise AppError("INVALID_INPUT", "不能包含重复卡片 ID。", 422)
            seen.add(card_id)
            title = text_field(card.get("title"), "card.title", 200, False)
            content = text_field(card.get("body"), "card.body", 20000, False)
            status = card.get("reviewStatus")
            if status not in ("to_review", "self_checked"):
                raise AppError("INVALID_INPUT", "复习状态只能为 to_review 或 self_checked。", 422)
            refs = card.get("sourceRefs", [])
            if not isinstance(refs, list) or len(refs) > 50:
                raise AppError("INVALID_SOURCE", "卡片来源必须为数组且不超过 50 条。", 422)
            refs = [self.validate_source(source) for source in refs]
            prior = old_cards.get(card_id)
            course_id = card.get("courseId", (prior or {}).get("courseId"))
            if course_id is not None:
                self.courses.repo.course(identifier(course_id, "card.courseId"))
                if any(not self.courses.repo.contains(course_id, ref["materialId"], ref["versionId"]) for ref in refs):
                    raise AppError("INVALID_SOURCE", "卡片来源包含其他课程材料。", 422)
            if prior and prior["body"] != content:
                status = "to_review"
            created = prior["createdAt"] if prior else timestamp
            checked = (prior or {}).get("selfCheckedAt")
            if status == "to_review":
                checked = None
            elif not prior or prior["reviewStatus"] != "self_checked":
                checked = timestamp
            changed = not prior or any((prior["title"] != title, prior["body"] != content,
                        prior["reviewStatus"] != status, prior["sourceRefs"] != refs, prior.get("courseId") != course_id))
            result["cards"].append({"id": card_id, "courseId": course_id, "title": title, "body": content, "sourceRefs": refs,
                "reviewStatus": status, "createdAt": created, "updatedAt": timestamp if changed else prior["updatedAt"],
                "selfCheckedAt": checked})
        return result

    def save_state(self, body):
        if not isinstance(body, dict) or type(body.get("revision")) is not int or body["revision"] < 0:
            raise AppError("REVISION_REQUIRED", "请先读取 /api/state，保存时带回当前整数 revision。", 422)
        return self.store.save_state(body, body["revision"], self.validate_state)

    def export_markdown(self):
        state = self.store.state()
        lines = ["# 我的课程学习卡片", "", "本机单用户演示；已自检为本人自报，不代表系统认证掌握。", "",
                 "本次目标：" + state["goal"], "下次继续：" + state["nextStep"], ""]
        for card in state["cards"]:
            lines.extend(["## " + card["title"].replace("\n", " "), "", card["body"], "",
                          "复习状态：" + ("已自检" if card["reviewStatus"] == "self_checked" else "待复习"),
                          "创建时间：" + card["createdAt"], "更新时间：" + card["updatedAt"], ""])
            if card["sourceRefs"]:
                lines.append("来源（文件页序从 1 开始）：")
                for source in card["sourceRefs"]:
                    lines.extend([f"- {source['title']}，文件第 {source['pageStart']} 页；版本 {source['versionId']}",
                                  "  原文摘录：" + source["quote"].replace("\n", " "), ""])
            else:
                lines.extend(["来源：手写理解卡片，无材料来源。", ""])
        return "\n".join(lines)
