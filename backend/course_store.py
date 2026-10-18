"""SQLite course identities, immutable material links, imports and boards."""
import hashlib
import json
import math
import uuid

from .errors import AppError
from .storage import now


class CourseStore:
    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS courses (
                    id TEXT PRIMARY KEY, semester TEXT NOT NULL, upstream_id TEXT NOT NULL,
                    name TEXT NOT NULL, UNIQUE(semester, upstream_id));
                CREATE TABLE IF NOT EXISTS course_files (
                    course_id TEXT NOT NULL, file_id TEXT NOT NULL, body TEXT NOT NULL,
                    PRIMARY KEY(course_id,file_id));
                CREATE TABLE IF NOT EXISTS course_materials (
                    course_id TEXT NOT NULL, file_id TEXT NOT NULL, material_id TEXT NOT NULL,
                    version_id TEXT NOT NULL, digest TEXT NOT NULL, current INTEGER NOT NULL,
                    created_at TEXT NOT NULL, PRIMARY KEY(course_id,file_id,version_id));
                CREATE TABLE IF NOT EXISTS course_chunks (
                    material_id TEXT NOT NULL, version_id TEXT NOT NULL, segment_id TEXT PRIMARY KEY,
                    page INTEGER NOT NULL, text TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS import_batches (
                    id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL,
                    signature TEXT NOT NULL, body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS boards (course_id TEXT PRIMARY KEY, body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS board_previews (
                    id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, signature TEXT NOT NULL,
                    course_id TEXT NOT NULL, body TEXT NOT NULL, applied TEXT);
            """)
            # Interrupted work is explicit and retryable; ready items are untouched.
            for row in db.execute("SELECT id,body FROM import_batches").fetchall():
                batch = json.loads(row["body"])
                changed = False
                for item in batch["items"]:
                    if item["status"] in ("pending", "downloading", "processing"):
                        item.update(status="failed", error="上次导入被服务重启中断，请重试此项。")
                        changed = True
                if changed:
                    self._summarize(batch)
                    db.execute("UPDATE import_batches SET body=? WHERE id=?", (json.dumps(batch, ensure_ascii=False), row["id"]))

    def upsert_course(self, semester, upstream_id, name):
        course_id = "course_" + hashlib.sha256((semester + "\0" + upstream_id).encode()).hexdigest()[:32]
        with self.store.connect() as db:
            db.execute("INSERT INTO courses VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
                       (course_id, semester, upstream_id, name))
        return self.course(course_id)

    def course(self, course_id):
        with self.store.connect() as db:
            row = db.execute("SELECT * FROM courses WHERE id=?", (course_id,)).fetchone()
        if not row:
            raise AppError("COURSE_NOT_FOUND", "课程不存在，请先获取真实课程目录。", 404)
        return {"courseId": row["id"], "semesterId": row["semester"],
                "upstreamCourseId": row["upstream_id"], "name": row["name"]}

    def cache_files(self, course_id, files):
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM course_files WHERE course_id=?", (course_id,))
            db.executemany("INSERT INTO course_files VALUES (?,?,?)",
                           [(course_id, f["fileId"], json.dumps(f, ensure_ascii=False)) for f in files])

    def files(self, course_id):
        self.course(course_id)
        with self.store.connect() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT body FROM course_files WHERE course_id=?", (course_id,))]

    def link(self, course_id, file_id, material, digest):
        self.course(course_id)
        chunks = []
        for p in material["pages"]:
            for n, start in enumerate(range(0, len(p["text"]), 1400), 1):
                sid = f"{material['materialId']}_{material['versionId']}_p{p['page']}s{n}"
                chunks.append((material["materialId"], material["versionId"], sid, p["page"], p["text"][start:start + 1400]))
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("UPDATE course_materials SET current=0 WHERE course_id=? AND file_id=?", (course_id, file_id))
            db.execute("INSERT INTO course_materials VALUES (?,?,?,?,?,1,?) "
                       "ON CONFLICT(course_id,file_id,version_id) DO UPDATE SET current=1",
                       (course_id, file_id, material["materialId"], material["versionId"], digest, now()))
            db.executemany("INSERT OR REPLACE INTO course_chunks VALUES (?,?,?,?,?)", chunks)

    def materials(self, course_id, current=False):
        self.course(course_id)
        sql = "SELECT DISTINCT material_id FROM course_materials WHERE course_id=?"
        if current:
            sql += " AND current=1"
        with self.store.connect() as db:
            ids = [r[0] for r in db.execute(sql, (course_id,))]
        return [self.store.material(mid) for mid in ids]

    def contains(self, course_id, material_id, version_id):
        with self.store.connect() as db:
            return db.execute("SELECT 1 FROM course_materials WHERE course_id=? AND material_id=? AND version_id=?",
                              (course_id, material_id, version_id)).fetchone() is not None

    def chunks(self, material):
        with self.store.connect() as db:
            rows = db.execute("SELECT * FROM course_chunks WHERE material_id=? AND version_id=? ORDER BY page,segment_id",
                              (material["materialId"], material["versionId"])).fetchall()
        # Index is derived data and can be reconstructed without the upstream session.
        if not rows:
            chunks = []
            for p in material["pages"]:
                for n, start in enumerate(range(0, len(p["text"]), 1400), 1):
                    chunks.append({"segmentId": f"{material['materialId']}_{material['versionId']}_p{p['page']}s{n}",
                                   "page": p["page"], "text": p["text"][start:start + 1400]})
        else:
            chunks = [{"segmentId": r["segment_id"], "page": r["page"], "text": r["text"]} for r in rows]
        return [{**c, "materialId": material["materialId"], "versionId": material["versionId"], "title": material["title"]} for c in chunks]

    @staticmethod
    def _summarize(batch):
        states = [i["status"] for i in batch["items"]]
        if "needs_auth" in states:
            status = "needs_auth"
        elif any(s in ("pending", "downloading", "processing") for s in states):
            status = "running"
        elif all(s == "ready" for s in states):
            status = "completed"
        elif "ready" in states:
            status = "partial_failed"
        else:
            status = "failed"
        batch.update(status=status, updatedAt=now())
        return batch

    def create_batch(self, course_id, file_ids, request_id):
        files = {f["fileId"]: f for f in self.files(course_id)}
        if any(fid not in files for fid in file_ids):
            raise AppError("FILE_NOT_IN_COURSE", "所选文件不在该课程已获取目录内，请刷新目录。", 422)
        signature = json.dumps([course_id, sorted(file_ids)], ensure_ascii=False)
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            prior = db.execute("SELECT signature,body FROM import_batches WHERE request_id=?", (request_id,)).fetchone()
            if prior:
                if prior[0] != signature:
                    raise AppError("REQUEST_ID_CONFLICT", "同一 requestId 不能用于不同课程或文件。", 409)
                return json.loads(prior[1])
            batch = {"batchId": "batch_" + uuid.uuid4().hex, "courseId": course_id, "items": []}
            for fid in file_ids:
                f = files[fid]
                batch["items"].append({"itemId": "item_" + uuid.uuid4().hex, "fileId": fid, "title": f["title"],
                    "status": "pending" if f["supported"] else "unsupported", "materialId": None, "versionId": None,
                    "error": f["unsupportedReason"]})
            self._summarize(batch)
            db.execute("INSERT INTO import_batches VALUES (?,?,?,?)",
                       (batch["batchId"], request_id, signature, json.dumps(batch, ensure_ascii=False)))
        return batch

    def batch(self, batch_id):
        with self.store.connect() as db:
            row = db.execute("SELECT body FROM import_batches WHERE id=?", (batch_id,)).fetchone()
        if row is None:
            raise AppError("IMPORT_NOT_FOUND", "导入批次不存在。", 404)
        return json.loads(row[0])

    def batches(self, course_id):
        self.course(course_id)
        with self.store.connect() as db:
            batches = [json.loads(r[0]) for r in db.execute("SELECT body FROM import_batches ORDER BY rowid DESC")]
        return [b for b in batches if b["courseId"] == course_id]

    def update_batch(self, batch_id, transform):
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT body FROM import_batches WHERE id=?", (batch_id,)).fetchone()
            if row is None:
                raise AppError("IMPORT_NOT_FOUND", "导入批次不存在。", 404)
            batch = json.loads(row[0])
            transform(batch)
            self._summarize(batch)
            db.execute("UPDATE import_batches SET body=? WHERE id=?", (json.dumps(batch, ensure_ascii=False), batch_id))
        return batch

    def board(self, course_id):
        self.course(course_id)
        with self.store.connect() as db:
            row = db.execute("SELECT body FROM boards WHERE course_id=?", (course_id,)).fetchone()
        return json.loads(row[0]) if row else {"courseId": course_id, "revision": 0, "nodes": [], "edges": [], "updatedAt": None}

    def save_board(self, course_id, body, identifier, text_field):
        self.course(course_id)
        if not isinstance(body, dict) or type(body.get("revision")) is not int or body["revision"] < 0:
            raise AppError("REVISION_REQUIRED", "白板保存必须带当前整数 revision。", 422)
        if body.get("courseId", course_id) != course_id or set(body) - {"courseId", "revision", "nodes", "edges", "updatedAt"}:
            raise AppError("INVALID_BOARD", "白板课程或字段不合法。", 422)
        nodes, edges = body.get("nodes"), body.get("edges")
        if not isinstance(nodes, list) or len(nodes) > 200 or not isinstance(edges, list) or len(edges) > 1000:
            raise AppError("INVALID_BOARD", "白板最多 200 个节点、1000 条线。", 422)
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT body FROM boards WHERE course_id=?", (course_id,)).fetchone()
            old = json.loads(row[0]) if row else {"revision": 0}
            if old["revision"] != body["revision"]:
                raise AppError("BOARD_CONFLICT", "白板已更新，请重读并保留本地操作。", 409, {"currentRevision": old["revision"]})
            state = json.loads(db.execute("SELECT body FROM workspace WHERE id=1").fetchone()[0])
            cards = {c["id"] for c in state["cards"] if c.get("courseId") == course_id}
            seen, clean_nodes, clean_edges = set(), [], []
            for n in nodes:
                if not isinstance(n, dict) or set(n) != {"id", "cardId", "x", "y"}:
                    raise AppError("INVALID_BOARD", "节点只能包含 id/cardId/x/y。", 422)
                nid = identifier(n["id"], "node.id")
                if nid in seen or not isinstance(n["cardId"], str) or n["cardId"] not in cards:
                    raise AppError("INVALID_BOARD_CARD", "节点 ID 重复或卡片不属于本课程已保存卡片。", 422)
                if any(type(n[k]) not in (int, float) or abs(n[k]) > 1000000 or not math.isfinite(n[k]) for k in ("x", "y")):
                    raise AppError("INVALID_BOARD", "白板坐标必须为范围内有限数值。", 422)
                seen.add(nid)
                clean_nodes.append(dict(n))
            edge_ids = set()
            for e in edges:
                if not isinstance(e, dict) or set(e) != {"id", "source", "target", "label"}:
                    raise AppError("INVALID_BOARD", "连线字段不合法。", 422)
                eid = identifier(e["id"], "edge.id")
                if (eid in edge_ids or not isinstance(e["source"], str) or not isinstance(e["target"], str)
                        or e["source"] not in seen or e["target"] not in seen):
                    raise AppError("INVALID_BOARD_EDGE", "边 ID 重复或端点不存在。", 422)
                text_field(e["label"], "edge.label", 200)
                edge_ids.add(eid)
                clean_edges.append(dict(e))
            result = {"courseId": course_id, "revision": old["revision"] + 1,
                      "nodes": clean_nodes, "edges": clean_edges, "updatedAt": now()}
            db.execute("INSERT OR REPLACE INTO boards VALUES (?,?)", (course_id, json.dumps(result, ensure_ascii=False)))
        return result
