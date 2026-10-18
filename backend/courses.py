import hashlib
import json
import math
import re
import threading
import time
import uuid

from .course_store import CourseStore
from .errors import AppError
from .learn import LearnClient
from .storage import now


def terms(text):
    """Latin words plus Chinese unigrams/bigrams; no whitespace assumption."""
    tokens = set(re.findall(r"[a-z0-9_]+", text.lower()))
    for run in re.findall(r"[\u3400-\u9fff]+", text):
        tokens.update(run)
        tokens.update(run[i:i + 2] for i in range(len(run) - 1))
    return tokens


def retrieve(chunks, question, budget):
    if len(json.dumps(chunks, ensure_ascii=False)) <= budget:
        return chunks, False
    query = terms(question)
    documents = [terms(c["text"]) for c in chunks]
    frequencies = {t: sum(t in d for d in documents) for t in query}
    scored = []
    for i, (c, words) in enumerate(zip(chunks, documents)):
        overlap = words & query
        score = sum((2 if len(t) > 1 else 0.25) * math.log(1 + len(chunks) / (1 + frequencies[t])) for t in overlap)
        if score:
            scored.append((score, i, c))
    scored.sort(key=lambda x: (-x[0], x[1]))
    result, size = [], 2
    # Select a relevant excerpt from each material first, then fill by score.
    first, rest, seen = [], [], set()
    for entry in scored:
        key = entry[2]["materialId"]
        if key in seen:
            rest.append(entry)
        else:
            first.append(entry)
            seen.add(key)
    for _, _, c in first + rest:
        cost = len(json.dumps(c, ensure_ascii=False)) + 2
        if size + cost <= budget and len(result) < 30:
            result.append(c)
            size += cost
    return result, True


class CourseService:
    def __init__(self, workspace, learn=None):
        self.workspace = workspace
        self.repo = CourseStore(workspace.store)
        from .exams import ExamService
        self.exams = ExamService(self)
        self.learn = learn or LearnClient(workspace.config)
        self.worker_lock = threading.Lock()
        self.workers = {}
        self.stop = threading.Event()

    def list_courses(self, semester):
        return {"courses": [self.repo.upsert_course(semester, uid, name) for uid, name in self.learn.courses(semester)]}

    def list_files(self, course_id):
        result = self.learn.files(self.repo.course(course_id))
        self.repo.cache_files(course_id, result["files"])
        return result

    def start_import(self, body):
        from .service import identifier
        if not isinstance(body, dict):
            raise AppError("INVALID_INPUT", "请求必须是 JSON 对象。", 422)
        cid = identifier(body.get("courseId"), "courseId")
        request_id = identifier(body.get("requestId"), "requestId")
        ids = body.get("fileIds")
        if not isinstance(ids, list) or not 1 <= len(ids) <= 30 or any(not isinstance(x, str) or not x or len(x) > 200 for x in ids) or len(set(ids)) != len(ids):
            raise AppError("INVALID_INPUT", "fileIds 必须为 1–30 个不重复文件标识。", 422)
        batch = self.repo.create_batch(cid, ids, request_id)
        if batch["status"] == "running":
            self._schedule(batch["batchId"])
        return batch

    def retry(self, batch_id, body):
        if not isinstance(body, dict):
            raise AppError("INVALID_INPUT", "请求必须是 JSON 对象。", 422)
        ids = body.get("itemIds")
        if not isinstance(ids, list) or not ids or any(not isinstance(x, str) for x in ids) or len(ids) != len(set(ids)):
            raise AppError("INVALID_INPUT", "itemIds 必须为非空、不重复标识数组。", 422)
        def change(batch):
            items = {i["itemId"]: i for i in batch["items"]}
            if any(i not in items for i in ids):
                raise AppError("INVALID_INPUT", "重试项不属于此批次。", 422)
            for iid in ids:
                if items[iid]["status"] in ("failed", "needs_auth"):
                    items[iid].update(status="pending", error=None)
        batch = self.repo.update_batch(batch_id, change)
        if batch["status"] == "running":
            self._schedule(batch_id)
        return batch

    def _schedule(self, batch_id):
        with self.worker_lock:
            if self.stop.is_set():
                return
            if batch_id in self.workers and self.workers[batch_id].is_alive():
                return
            worker = threading.Thread(target=self._worker_main, args=(batch_id,), daemon=True, name="course-import")
            self.workers[batch_id] = worker
            worker.start()

    def _worker_main(self, batch_id):
        try:
            self._run(batch_id)
        finally:
            with self.worker_lock:
                restart = (not self.stop.is_set() and
                           any(i["status"] == "pending" for i in self.repo.batch(batch_id)["items"]))
                self.workers.pop(batch_id, None)
            # A retry can arrive after the worker checked pending but before it
            # exited. Checking and removing under the scheduling lock makes a
            # concurrent retry wait until it can schedule a replacement.
            if restart:
                self._schedule(batch_id)

    def _item(self, batch_id, item_id, **changes):
        def update(batch):
            next(i for i in batch["items"] if i["itemId"] == item_id).update(changes)
        return self.repo.update_batch(batch_id, update)

    def _run(self, batch_id):
        # A single transport/import stream across batches limits school request load.
        with self.workspace.import_lock:
            while not self.stop.is_set():
                batch = self.repo.batch(batch_id)
                item = next((i for i in batch["items"] if i["status"] == "pending"), None)
                if not item:
                    return
                iid = item["itemId"]
                try:
                    self._item(batch_id, iid, status="downloading", error=None)
                    # Verify ownership again, never accept a client URL.
                    files = {f["fileId"]: f for f in self.repo.files(batch["courseId"])}
                    if item["fileId"] not in files:
                        raise AppError("FILE_NOT_IN_COURSE", "课程文件已从目录移除，请刷新目录。", 422)
                    content = self.learn.download(item["fileId"])
                    self._item(batch_id, iid, status="processing")
                    filename = item["title"]
                    extension = '.' + files[item['fileId']]['fileType'].lower().lstrip('.')
                    if not filename.lower().endswith(extension):
                        filename = filename[:200-len(extension)] + extension
                    material = self.workspace.upload(filename, content)
                    self.repo.link(batch["courseId"], item["fileId"], self.workspace.store.material(material["materialId"]), hashlib.sha256(content).hexdigest())
                    self._item(batch_id, iid, status="ready", materialId=material["materialId"], versionId=material["versionId"], error=None)
                except AppError as exc:
                    if exc.code in ("LEARN_NEEDS_AUTH", "LEARN_FORBIDDEN", "LEARN_BROWSER_CLOSED"):
                        def pause(b):
                            for i in b["items"]:
                                if i["status"] in ("pending", "downloading", "processing"):
                                    i.update(status="needs_auth", error=exc.message)
                        self.repo.update_batch(batch_id, pause)
                        return
                    self._item(batch_id, iid, status="failed", error=f"{exc.code}: {exc.message}")
                except Exception:
                    self._item(batch_id, iid, status="failed", error="导入发生内部错误，请重试；已成功项保留。")
                self.stop.wait(0.35)

    def materials(self, course_id):
        from .service import public_material
        return {"course": self.repo.course(course_id), "materials": [public_material(m) for m in self.repo.materials(course_id) if m['materialId'] not in self.exams.ids(course_id)],
                "warnings": ["问答基于当前课程已就绪导入材料；未导入、解析失败或不支持格式不参与问答。"]}

    def ask(self, course_id, body):
        from .service import identifier, text_field
        w = self.workspace
        if not isinstance(body, dict):
            raise AppError("INVALID_INPUT", "请求必须是 JSON 对象。", 422)
        self.repo.course(course_id)
        question = text_field(body.get("question"), "question", w.config.max_question_chars, False).strip()
        request_id = identifier(body.get("requestId"), "requestId")
        supplied = body.get("materialScope")
        if supplied is not None and (not isinstance(supplied, list) or not 1 <= len(supplied) <= 200):
            raise AppError("INVALID_SCOPE", "materialScope 必须为 1–200 个合法材料版本。", 422)
        def canonical_scope(scope):
            if scope is None:
                return None
            result, seen = [], set()
            for entry in scope:
                if not isinstance(entry, dict):
                    raise AppError("INVALID_SCOPE", "范围条目必须为材料版本对象。", 422)
                mid = identifier(entry.get("materialId"), "materialId")
                vid = identifier(entry.get("versionId"), "versionId")
                if (mid, vid) in seen:
                    raise AppError("INVALID_SCOPE", "范围包含重复材料版本。", 422)
                seen.add((mid, vid))
                result.append({"materialId": mid, "versionId": vid})
            return sorted(result, key=lambda entry: (entry["materialId"], entry["versionId"]))

        supplied = canonical_scope(supplied)
        signature = {"courseId": course_id, "materialScope": supplied}
        # Idempotency is bound to caller parameters, even if new files are imported later.
        if not w.ask_lock.acquire(timeout=0.1):
            raise AppError("MODEL_BUSY", "已有问题正在处理，请稍后重试。", 429)
        try:
            previous = w.store.answer_by_request(request_id)
            if previous:
                result = previous["result"]
                prior_scope = result.get("requestScope", {})
                same_scope = (prior_scope.get("courseId") == course_id and
                              canonical_scope(prior_scope.get("materialScope")) == supplied)
                if result.get("courseId") != course_id or not same_scope or previous["question"] != question:
                    raise AppError("REQUEST_ID_CONFLICT", "同一 requestId 不能用于不同问题或范围。", 409)
                return result
            if supplied is None:
                materials = [m for m in self.repo.materials(course_id, current=True) if m["status"] == "ready" and m['materialId'] not in self.exams.ids(course_id)]
            else:
                materials, seen = [], set()
                for scope in supplied:
                    if not isinstance(scope, dict):
                        raise AppError("INVALID_SCOPE", "范围条目必须为材料版本对象。", 422)
                    mid, vid = identifier(scope.get("materialId"), "materialId"), identifier(scope.get("versionId"), "versionId")
                    if (mid, vid) in seen or not self.repo.contains(course_id, mid, vid):
                        raise AppError("INVALID_SCOPE", "范围包含重复项或其他课程材料。", 422)
                    seen.add((mid, vid))
                    m = w.store.material(mid)
                    if m["versionId"] != vid or m["status"] != "ready":
                        raise AppError("INVALID_SCOPE", "范围材料版本未就绪。", 422)
                    materials.append(m)
            all_chunks = [dict(c, courseId=course_id) for m in materials for c in self.repo.chunks(m)]
            chunks, limited = retrieve(all_chunks, question, w.config.max_context_chars)
            # selectedScope describes the context actually sent to the model.
            used = {(c["materialId"], c["versionId"]) for c in chunks}
            selected = [m for m in materials if (m["materialId"], m["versionId"]) in used]
            if not chunks:
                output, usage = {"supported": False, "answerSegments": [], "limitations": ["当前课程已导入材料没有检索到足够依据，请补充材料或缩小问题范围。"]}, {}
            else:
                output, usage = w.model.generate(question, chunks)
            result = w.verify_answer(output, selected[0] if selected else None, chunks, materials=selected)
            if limited:
                result["limitations"].append("本次基于中文字符／双字及英文词法检索的相关片段回答，未读取全部讲义。")
            result.update(answerId="ans_" + uuid.uuid4().hex, question=question, createdAt=now(), model=w.config.model,
                          usage=w.safe_usage(usage), courseId=course_id, requestScope=signature)
            w.store.save_answer(result["answerId"], materials[0]["materialId"] if materials else course_id, question, request_id, result)
            return result
        finally:
            w.ask_lock.release()

    def generate_board(self, course_id, body):
        """Generate a persisted, idempotent preview; never mutate a user's board."""
        from .service import identifier, text_field
        from .model import SYSTEM_PROMPT
        w = self.workspace
        if not isinstance(body, dict):
            raise AppError("INVALID_INPUT", "请求必须是 JSON 对象。", 422)
        self.repo.course(course_id)
        request_id = identifier(body.get("requestId"), "requestId")
        instruction = text_field(body.get("instruction", ""), "instruction", 2000).strip() or "梳理课程核心概念及其关系"
        scope = body.get("materialScope")
        if scope is not None and (not isinstance(scope, list) or not 1 <= len(scope) <= 200):
            raise AppError("INVALID_SCOPE", "材料范围必须为非空数组。", 422)
        materials = [m for m in self.repo.materials(course_id, current=True) if m["status"] == "ready" and m['materialId'] not in self.exams.ids(course_id)]
        if scope is not None:
            materials, seen = [], set()
            for entry in scope:
                if not isinstance(entry, dict):
                    raise AppError("INVALID_SCOPE", "材料范围格式不合法。", 422)
                mid = identifier(entry.get("materialId"), "materialId")
                vid = identifier(entry.get("versionId"), "versionId")
                if (mid, vid) in seen or not self.repo.contains(course_id, mid, vid):
                    raise AppError("INVALID_SCOPE", "材料重复或不属于当前课程。", 422)
                seen.add((mid, vid))
                material = w.store.material(mid)
                if material["status"] != "ready" or material["versionId"] != vid:
                    raise AppError("INVALID_SCOPE", "材料版本未就绪。", 422)
                materials.append(material)
            scope = sorted(seen)
        signature = json.dumps([course_id, instruction, scope], ensure_ascii=False)
        if not w.ask_lock.acquire(timeout=0.1):
            raise AppError("MODEL_BUSY", "已有生成任务正在处理，请稍后重试。", 429)
        try:
            with w.store.connect() as db:
                prior = db.execute("SELECT signature,body FROM board_previews WHERE request_id=?", (request_id,)).fetchone()
            if prior:
                if prior["signature"] != signature:
                    raise AppError("REQUEST_ID_CONFLICT", "同一 requestId 不能用于不同生成要求。", 409)
                return json.loads(prior["body"])
            all_chunks = [dict(c, courseId=course_id) for m in materials for c in self.repo.chunks(m)]
            # An overview needs representative evidence even when its generic query
            # has no lexical overlap with a course's subject vocabulary.
            chunks, size = [], 2
            groups = [self.repo.chunks(m) for m in materials]
            for depth in range(max((len(g) for g in groups), default=0)):
                for group in groups:
                    if depth < len(group):
                        chunk = dict(group[depth], courseId=course_id)
                        cost = len(json.dumps(chunk, ensure_ascii=False)) + 2
                        if size + cost <= w.config.max_context_chars and len(chunks) < 30:
                            chunks.append(chunk)
                            size += cost
            if not chunks:
                raise AppError("NO_READY_MATERIALS", "当前课程没有可用于生成白板的已就绪材料。", 422)
            used = {(c["materialId"], c["versionId"]) for c in chunks}
            selected = [m for m in materials if (m["materialId"], m["versionId"]) in used]
            prompt = SYSTEM_PROMPT + '''\n本任务生成课程知识白板。最多生成 8 个概念卡片，至少 1 个。
将每个概念作为 answerSegments 的一段，增加 title 字段（简短标题，最多80字）。
增加 relations 数组，每项 {"source":0,"target":1,"label":"关系说明"}，label 最多100字。
source/target 是 answerSegments 数组的从0开始索引；只连接不同概念，不得重复。
关系必须有对应卡片原文依据，不能为了连线编造关系；无依据则 relations=[]。
不得输出任何持久化ID、坐标、课程标识；不要把无关概念串成链。'''
            output, usage = w.model.generate(instruction, chunks, system_prompt=prompt)
            verified = w.verify_answer(output, selected[0], chunks, materials=selected)
            raw_segments = output.get("answerSegments", [])
            relations = output.get("relations", [])
            if len(raw_segments) > 8 or not isinstance(relations, list) or len(relations) > 32:
                raise AppError("INVALID_BOARD_GENERATION", "模型生成的白板规模或关系格式不合法。", 502)
            stamp, cards, nodes, edges = now(), [], [], []
            citations = {c["id"]: c for c in verified["citations"]}
            for index, segment in enumerate(verified["answerSegments"]):
                title = raw_segments[index].get("title")
                if not isinstance(title, str) or not title.strip() or len(title) > 120:
                    raise AppError("INVALID_BOARD_GENERATION", "模型卡片标题不合法。", 502)
                card_id, node_id = "card_" + uuid.uuid4().hex, "node_" + uuid.uuid4().hex
                cards.append({"id": card_id, "courseId": course_id, "title": title.strip(), "body": segment["text"],
                              "sourceRefs": [citations[cid] for cid in segment["citationIds"]], "origin": "ai",
                              "reviewStatus": "to_review", "createdAt": stamp, "updatedAt": stamp, "selfCheckedAt": None})
                nodes.append({"id": node_id, "cardId": card_id, "x": 40 + index % 3 * 360, "y": 40 + index // 3 * 320})
            pairs = set()
            for relation in relations:
                if not isinstance(relation, dict):
                    raise AppError("INVALID_BOARD_GENERATION", "模型关系格式不合法。", 502)
                source, target, label = relation.get("source"), relation.get("target"), relation.get("label")
                if (type(source) is not int or type(target) is not int or not 0 <= source < len(nodes)
                        or not 0 <= target < len(nodes) or source == target or (source, target) in pairs
                        or not isinstance(label, str) or not label.strip() or len(label) > 100):
                    raise AppError("INVALID_BOARD_GENERATION", "模型关系端点或说明不合法。", 502)
                pairs.add((source, target))
                edges.append({"id": "edge_" + uuid.uuid4().hex, "source": nodes[source]["id"],
                              "target": nodes[target]["id"], "label": label.strip()})
            if len(chunks) < len(all_chunks):
                verified["limitations"].append("白板基于预算内各材料的代表片段生成，未读取全部内容。")
            result = {"previewId": "preview_" + uuid.uuid4().hex, "courseId": course_id, "cards": cards,
                      "nodes": nodes, "edges": edges, "limitations": verified["limitations"], "selectedScope": verified["selectedScope"]}
            with w.store.connect() as db:
                db.execute("INSERT INTO board_previews VALUES (?,?,?,?,?,NULL)",
                           (result["previewId"], request_id, signature, course_id, json.dumps(result, ensure_ascii=False)))
            return result
        finally:
            w.ask_lock.release()

    def apply_board(self, course_id, body):
        """Atomically append preview cards and graph, preserving both revisions."""
        from .service import identifier
        if not isinstance(body, dict):
            raise AppError("INVALID_INPUT", "请求必须是 JSON 对象。", 422)
        self.repo.course(course_id)
        preview_id = identifier(body.get("previewId"), "previewId")
        if any(type(body.get(k)) is not int or body[k] < 0 for k in ("stateRevision", "boardRevision")):
            raise AppError("REVISION_REQUIRED", "应用白板必须带当前状态与白板 revision。", 422)
        with self.workspace.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM board_previews WHERE id=? AND course_id=?", (preview_id, course_id)).fetchone()
            if not row:
                raise AppError("PREVIEW_NOT_FOUND", "生成预览不存在或不属于本课程。", 404)
            state = json.loads(db.execute("SELECT body FROM workspace WHERE id=1").fetchone()[0])
            board_row = db.execute("SELECT body FROM boards WHERE course_id=?", (course_id,)).fetchone()
            board = json.loads(board_row[0]) if board_row else {"courseId": course_id, "revision": 0, "nodes": [], "edges": [], "updatedAt": None}
            if row["applied"]:
                # Return current state on retries, never resurrect a stale snapshot.
                return {"state": state, "board": board}
            if state["revision"] != body["stateRevision"]:
                raise AppError("STATE_CONFLICT", "学习状态已更新，请刷新后重新应用预览。", 409, {"currentRevision": state["revision"]})
            if board["revision"] != body["boardRevision"]:
                raise AppError("BOARD_CONFLICT", "白板已更新，请刷新后重新应用预览。", 409, {"currentRevision": board["revision"]})
            preview = json.loads(row["body"])
            if not preview["cards"]:
                raise AppError("NO_BOARD_EVIDENCE", "材料依据不足，预览中没有可创建卡片。", 422)
            if len(board["nodes"]) + len(preview["nodes"]) > 200 or len(board["edges"]) + len(preview["edges"]) > 1000:
                raise AppError("INVALID_BOARD", "应用预览会超过白板容量，请先整理现有白板。", 422)
            proposed = dict(state, cards=state["cards"] + preview["cards"])
            clean = self.workspace.validate_state(proposed, state)
            clean.update(revision=state["revision"] + 1, updatedAt=now())
            offset = max((n["y"] for n in board["nodes"]), default=-360) + 360
            if any(abs(n["y"] + offset) > 1000000 for n in preview["nodes"]):
                raise AppError("INVALID_BOARD", "现有白板位置超出可追加范围，请先整理节点位置。", 422)
            board["nodes"].extend(dict(n, y=n["y"] + offset) for n in preview["nodes"])
            board["edges"].extend(preview["edges"])
            board.update(revision=board["revision"] + 1, updatedAt=now())
            db.execute("UPDATE workspace SET body=? WHERE id=1", (json.dumps(clean, ensure_ascii=False),))
            db.execute("INSERT OR REPLACE INTO boards VALUES (?,?)", (course_id, json.dumps(board, ensure_ascii=False)))
            db.execute("UPDATE board_previews SET applied=? WHERE id=?", (now(), preview_id))
            return {"state": clean, "board": board}

    def close(self):
        self.stop.set()
        for worker in list(self.workers.values()):
            worker.join(timeout=2)
        self.learn.transport.close()
