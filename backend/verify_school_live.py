"""Explicit live school HTTP acceptance. Never reads browser auth or calls a model.

The existing school window must already be authenticated by its human owner.
Only repeats files from the supplied already-completed, authorized batch.
Identifiers and observed counts stay in the local, excluded test-results report.
"""
import argparse
from io import BytesIO
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from pypdf import PdfReader


def run(base, course_id, batch_id, target):
    parts = urllib.parse.urlsplit(base)
    if parts.scheme != "http" or parts.hostname not in ("127.0.0.1", "localhost", "::1") or parts.username or parts.password or parts.query or parts.fragment or parts.path not in ("", "/"):
        raise ValueError("Only a loopback HTTP backend root is accepted")
    base = base.rstrip("/")
    report = {"kind": "real_school_http_acceptance", "passed": False,
              "courseId": course_id, "batchId": batch_id, "checks": [],
              "notVerified": ["session-expiry-and-human-reconnect", "upstream-rate-limit", "full-backend-process-restart", "real-course-model-answer"]}

    def checkpoint():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    def check(name, condition):
        report["checks"].append({"name": name, "passed": bool(condition)})
        checkpoint()
        print(json.dumps({"check": name, "passed": bool(condition)}, ensure_ascii=False), flush=True)
        if not condition:
            raise AssertionError(name)

    def request(path, body=None, binary=False):
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(base + path, data=data,
            headers={"Content-Type": "application/json"} if data is not None else {})
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = response.read()
            return raw if binary else json.loads(raw)

    def segment(value):
        return urllib.parse.quote(value, safe="")

    try:
        check("human school session connected", request("/api/learn/status")["status"] == "connected")
        semesters = request("/api/learn/semesters")["semesters"]
        report["semesterCount"] = len(semesters)
        materials = request("/api/courses/" + segment(course_id) + "/materials")
        course = materials["course"]
        report["courseName"] = course["name"]
        semester = course["semesterId"]
        check("authorized course semester listed", any(s["id"] == semester for s in semesters))
        courses = request("/api/learn/courses?" + urllib.parse.urlencode({"semesterId": semester}))["courses"]
        report["courseCountInSemester"] = len(courses)
        check("authorized course appears in real directory", any(c["courseId"] == course_id for c in courses))
        directory = request("/api/learn/courses/" + segment(course_id) + "/files")
        report["directoryCount"] = len(directory["files"])
        report["directoryComplete"] = directory["complete"]
        report["directoryWarningCount"] = len(directory["warnings"])
        original = request("/api/learn/imports/" + segment(batch_id))
        check("original batch completed in authorized course", original["courseId"] == course_id and original["status"] == "completed")
        items = original["items"]
        check("at least two real PDFs ready", len(items) >= 2 and all(i["status"] == "ready" and i["materialId"] and i["versionId"] for i in items))
        listed = {f["fileId"]: f for f in directory["files"]}
        check("imported items belong to supported course directory", all(i["fileId"] in listed and listed[i["fileId"]]["supported"] for i in items))
        verified = []
        for item in items:
            mid = segment(item["materialId"])
            meta = request("/api/materials/" + mid)
            raw = request("/api/materials/" + mid + "/file", binary=True)
            check("original PDF signature valid", raw.startswith(b"%PDF-"))
            pages = len(PdfReader(BytesIO(raw)).pages)
            check("original PDF page count matches ready metadata", pages > 0 and pages == meta["pageCount"] and meta["status"] == "ready" and meta["versionId"] == item["versionId"])
            verified.append({"fileId": item["fileId"], "materialId": item["materialId"], "versionId": item["versionId"], "pageCount": pages, "bytes": len(raw)})
        report["verifiedPdfs"] = verified
        before = {(m["materialId"], m["versionId"]) for m in materials["materials"]}
        body = {"courseId": course_id, "fileIds": [i["fileId"] for i in items], "requestId": "school_verify_" + uuid.uuid4().hex}
        repeated = request("/api/learn/imports", body)
        replay = request("/api/learn/imports", body)
        check("same requestId replays same batch", replay["batchId"] == repeated["batchId"])
        deadline = time.monotonic() + 150
        while repeated["status"] == "running" and time.monotonic() < deadline:
            time.sleep(1)
            repeated = request("/api/learn/imports/" + segment(repeated["batchId"]))
        check("second import of same PDFs completes", repeated["status"] == "completed" and all(i["status"] == "ready" for i in repeated["items"]))
        expected = {i["fileId"]: (i["materialId"], i["versionId"]) for i in items}
        check("repeat import reuses material and version", all(expected[i["fileId"]] == (i["materialId"], i["versionId"]) for i in repeated["items"]))
        after = request("/api/courses/" + segment(course_id) + "/materials")["materials"]
        check("repeat import adds no duplicate course materials", {(m["materialId"], m["versionId"]) for m in after} == before)
        retried = request("/api/learn/imports/" + segment(repeated["batchId"]) + "/retry", {"itemIds": [i["itemId"] for i in repeated["items"]]})
        check("retry leaves ready items untouched", retried["status"] == "completed" and retried["items"] == repeated["items"])
        report["repeatBatchId"] = repeated["batchId"]
        report["materialCount"] = len(after)
        report["passed"] = True
    except Exception as exc:
        report["failure"] = {"type": type(exc).__name__}
        if isinstance(exc, urllib.error.HTTPError):
            report["failure"]["httpStatus"] = exc.code
        raise
    finally:
        checkpoint()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--course-id", required=True)
    parser.add_argument("--batch-id", required=True)
    args = parser.parse_args()
    target = Path(__file__).resolve().parent / "test-results/school-live.json"
    report = run(args.base, args.course_id, args.batch_id, target)
    print(json.dumps({"passed": report["passed"], "checks": len(report["checks"]), "report": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
