"""Check the actual ZIP in an isolated directory, using a separate server process."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

from backend.package_handoff import source_files, ROOT


def main():
    project = Path(__file__).resolve().parents[2]
    report = {"kind": "portable_handoff_acceptance", "passed": False, "checks": []}
    def check(name, value):
        report["checks"].append({"name": name, "passed": bool(value)})
        if not value:
            raise AssertionError(name)
    with tempfile.TemporaryDirectory(prefix="learning-backend-handoff-") as directory:
        root = Path(directory)
        with zipfile.ZipFile(project / "backend/deliverables/learning-agent-backend.zip") as archive:
            check("ZIP integrity", archive.testzip() is None)
            names = archive.namelist()
            expected = {path.relative_to(ROOT).as_posix() for path in source_files()} | {"HANDOFF-MANIFEST.json"}
            check("exact reviewed source whitelist", set(names) == expected and len(names) == len(expected))
            check("no private configuration or data", not any(n.endswith("/.env") or any(p in n.split("/") for p in ("data", "vendor", "test-results", "__pycache__")) for n in names))
            archive.extractall(root)
        manifest = json.loads((root / "HANDOFF-MANIFEST.json").read_text(encoding="utf-8"))
        check("all manifest hashes match", all(hashlib.sha256((root / item["path"]).read_bytes()).hexdigest() == item["sha256"] for item in manifest))
        env = os.environ.copy()
        env.update({"MODEL_BASE_URL": "", "MODEL_API_KEY": "", "MODEL_NAME": "", "MODEL_API_STYLE": "responses",
                    "PYTHONIOENCODING": "utf-8", "DATA_DIR": str(root / "private-data")})
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env["PORT"] = str(port)
        base = f"http://127.0.0.1:{port}"
        process = None
        def request(path, body=None, method=None, headers=None):
            data = None if body is None else body if isinstance(body, bytes) else json.dumps(body).encode()
            with urllib.request.urlopen(urllib.request.Request(base + path, data=data, method=method, headers=headers or {}), timeout=30) as response:
                return json.load(response)
        def start():
            nonlocal process
            process = subprocess.Popen([sys.executable, "-m", "backend"], cwd=root, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            for _ in range(50):
                try:
                    return request("/api/health")
                except Exception:
                    if process.poll() is not None:
                        raise RuntimeError("Packaged server exited")
                    time.sleep(0.1)
            raise RuntimeError("Packaged server failed to start")
        def stop():
            nonlocal process
            if process:
                process.terminate()
                process.communicate(timeout=10)
                process = None
        try:
            health = start()
            check("starts from isolated directory without credentials", health["status"] == "ok" and not health["modelConfigured"])
            connection = request("/api/learn/status")
            check("packaged school API starts disconnected", connection["status"] == "disconnected" and connection["loginUrl"] == "/api/learn/connect")
            pdf = (root / "examples/signals-systems-demo.pdf").read_bytes()
            boundary = "portable_test_boundary"
            raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="demo.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode()
                   + pdf + f"\r\n--{boundary}--\r\n".encode())
            material = request("/api/materials", raw, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
            check("packaged service parses actual Chinese PDF", material["status"] == "ready" and material["pageCount"] == 3)
            state = request("/api/state")
            state.update({"goal": "Portable verification", "readingPosition": {"materialId": material["materialId"], "versionId": material["versionId"], "page": 3},
                "cards": [{"id": "portable_card", "title": "Portable card", "body": "My own note", "sourceRefs": [], "reviewStatus": "to_review"}]})
            saved = request("/api/state", state, "PUT", {"Content-Type": "application/json"})
            stop()
            start()
            check("state restored after full process restart", request("/api/state") == saved)
            check("material metadata restored", len(request("/api/materials")["materials"]) == 1)
            report["passed"] = True
        finally:
            stop()
    target = project / "backend/test-results/portable-handoff.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
