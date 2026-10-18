from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3

from .errors import AppError


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def initial_state():
    return {"revision": 0, "goal": "", "nextStep": "", "readingPosition": None, "cards": [], "updatedAt": None}


class Store:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.files_dir = self.data_dir / "materials"
        self.files_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "workspace.sqlite3"
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS materials (
                    id TEXT PRIMARY KEY, version_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
                    digest TEXT NOT NULL UNIQUE, status TEXT NOT NULL, page_count INTEGER NOT NULL,
                    pages TEXT NOT NULL, warnings TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS answers (
                    id TEXT PRIMARY KEY, material_id TEXT NOT NULL, question TEXT NOT NULL,
                    request_id TEXT UNIQUE, result TEXT NOT NULL, created_at TEXT NOT NULL);
            """)
            db.execute("INSERT OR IGNORE INTO workspace(id, body) VALUES (1, ?)", (json.dumps(initial_state()),))
            db.execute("UPDATE materials SET status='failed', error=? WHERE status='processing'",
                       ("上次解析被中断，请重新上传此文件。",))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def _material(row):
        if row is None:
            raise AppError("MATERIAL_NOT_FOUND", "材料不存在。", 404)
        return {"materialId": row["id"], "versionId": row["version_id"], "title": row["title"],
                "status": row["status"], "pageCount": row["page_count"],
                "pages": json.loads(row["pages"]), "warnings": json.loads(row["warnings"]),
                "error": row["error"], "createdAt": row["created_at"]}

    def material(self, material_id):
        with self.connect() as db:
            return self._material(db.execute("SELECT * FROM materials WHERE id=?", (material_id,)).fetchone())

    def by_digest(self, digest):
        with self.connect() as db:
            row = db.execute("SELECT * FROM materials WHERE digest=?", (digest,)).fetchone()
            return self._material(row) if row else None

    def list_materials(self):
        with self.connect() as db:
            return [self._material(row) for row in db.execute("SELECT * FROM materials ORDER BY created_at DESC")]

    def add_material(self, material_id, version_id, title, digest):
        with self.connect() as db:
            db.execute("INSERT INTO materials VALUES (?,?,?,?,?,?,?,?,?,?)",
                       (material_id, version_id, title, digest, "processing", 0, "[]", "[]", None, now()))

    def finish_material(self, material_id, pages, warnings):
        with self.connect() as db:
            db.execute("UPDATE materials SET status='ready',page_count=?,pages=?,warnings=?,error=NULL WHERE id=?",
                       (len(pages), json.dumps(pages, ensure_ascii=False), json.dumps(warnings, ensure_ascii=False), material_id))

    def fail_material(self, material_id, message):
        with self.connect() as db:
            db.execute("UPDATE materials SET status='failed',error=? WHERE id=?", (message, material_id))

    def state(self):
        with self.connect() as db:
            return json.loads(db.execute("SELECT body FROM workspace WHERE id=1").fetchone()[0])

    def save_state(self, body, expected_revision, transform):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = json.loads(db.execute("SELECT body FROM workspace WHERE id=1").fetchone()[0])
            if old["revision"] != expected_revision:
                raise AppError("STATE_CONFLICT", "学习记录已更新，请重新读取后合并，保留本地草稿。", 409,
                               {"currentRevision": old["revision"]})
            result = transform(body, old)
            result["revision"] = old["revision"] + 1
            result["updatedAt"] = now()
            db.execute("UPDATE workspace SET body=? WHERE id=1", (json.dumps(result, ensure_ascii=False),))
            return result

    def answer_by_request(self, request_id):
        if not request_id:
            return None
        with self.connect() as db:
            row = db.execute("SELECT material_id,question,result FROM answers WHERE request_id=?", (request_id,)).fetchone()
            return {"materialId": row[0], "question": row[1], "result": json.loads(row[2])} if row else None

    def save_answer(self, answer_id, material_id, question, request_id, result):
        with self.connect() as db:
            db.execute("INSERT INTO answers VALUES (?,?,?,?,?,?)",
                       (answer_id, material_id, question, request_id, json.dumps(result, ensure_ascii=False), now()))

    def citation_exists(self, citation):
        with self.connect() as db:
            for row in db.execute("SELECT result FROM answers WHERE material_id=?", (citation["materialId"],)):
                for stored in json.loads(row[0])["citations"]:
                    if stored["id"] == citation["id"]:
                        return stored == citation
        return False
