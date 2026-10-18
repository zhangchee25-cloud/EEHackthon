"""Assemble B source with the reviewed zch frontend; excludes private runtime data."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

from .package_handoff import ROOT, source_files


def assemble():
    candidate = ROOT / "integration"
    if not (candidate / "frontend/src/App.tsx").is_file():
        raise RuntimeError("Reviewed integration frontend missing")
    for source in source_files():
        target = candidate / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    files = [candidate / p.relative_to(ROOT) for p in source_files()]
    front = candidate / "frontend"
    names = (".env.example", ".gitignore", "index.html", "package.json", "package-lock.json", "README.md",
             "tsconfig.json", "vite.config.ts", "vitest.config.ts", "playwright.config.ts", "playwright.a.config.ts")
    files.extend(front / name for name in names if (front / name).is_file())
    for directory in ("src", "scripts", "tests", "public/fonts"):
        for path in (front / directory).rglob("*"):
            if path.is_file() and not any(p in path.parts for p in ("__pycache__", "test-results")):
                files.append(path)
    for name in ("A-验收记录.md", "frontend-A交付与验收.md", "AB-本轮集成契约.md"):
        p = candidate / "docs" / name
        if p.is_file():
            files.append(p)
    readme = candidate / "README.md"
    readme.write_text("""# 知页：本机课程学习空间（统一候选）

前端：zch `04c1baac` 加本地联调修复；后端：lsx `4ad7865` 基线加本轮学校、课程问答和白板实现。具体源码以 HANDOFF-MANIFEST.json 的 SHA-256 固定，未推送 GitHub。

## 启动

1. Python 3.10+：按 backend/README.md 安装依赖和浏览器，将 backend/.env.example 复制为 backend/.env 并填写自己的模型配置。在项目根运行 `python -m backend`（macOS 可用 python3）。端口 8000。
2. Node.js 20.19+ 或 22.12+：进入 frontend，运行 `npm ci`、`npm run dev`，打开 http://127.0.0.1:5173 。生产预览：`npm run build`、`npm run preview`，端口 4173。
3. 在材料栏打开网络学堂连接页，由本人在独立学校窗口完成登录与二次认证，再刷新连接状态、选学期和课程、一次导入所选 PDF。
4. 课程提问、打开引用、本人改写并保存卡片、加入白板并连线。状态与白板有独立 revision；冲突时保留草稿，重读后合并。

默认支持文本 PDF 5 MB／20 页；不支持格式与失败项明确显示。基于已就绪材料检索问答。关闭后端会丢失学校临时会话，材料、课程映射、导入进度、卡片与白板保存在 backend/data；重启后本人重新连接即可。

## 验证与范围

后端：`python -m unittest discover -s backend/tests -p 'test_*.py'`。前端：`npm test`、`npm run build`。UI 桩验收使用 `npm run test:ui`，与真实学校、模型验收分别记录。

见 docs/B-验收记录.md 及 docs/A-验收记录.md（如存在）。未验收项如实保留；学校限流、WebVPN/macOS 实机等未验证场景不作成功承诺。

包内无 .env、Cookie、账号会话、真实教师课件、backend/data、node_modules、vendor 或私有验收报告；仅附自制 PDF。模型请求会将所选材料的相关文本发送到本人配置的平台。

学校接口行为参考 OneTHU 固定提交 56484fd91a49ae5304f2ac6a000c39928a6bbb67，Python 适配器为本队独立实现，未复制其 Tauri／登录代码。详情见 backend/README.md。各依赖保持原许可。
""", encoding="utf-8")
    files.append(readme)
    files = sorted(set(files))
    destination = ROOT / "backend/deliverables/zhiye-integrated-candidate.zip"
    destination.parent.mkdir(exist_ok=True)
    temporary = destination.with_suffix(".tmp.zip")
    manifest = []
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            relative = path.relative_to(candidate).as_posix()
            if any(p in relative.split("/") for p in (".env", "data", "vendor", "node_modules", "test-results")):
                raise RuntimeError("Unexpected private path")
            raw = path.read_bytes()
            archive.writestr(relative, raw)
            manifest.append({"path": relative, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
        archive.writestr("HANDOFF-MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    # Reopen and check integrity and credentials before exposing final filename.
    with zipfile.ZipFile(temporary) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("Archive integrity failure")
        from .config import Config
        key = Config.from_env().api_key.encode()
        if key and any(key in archive.read(name) for name in archive.namelist()):
            raise RuntimeError("Private credential detected")
    temporary.replace(destination)
    print(json.dumps({"package": str(destination), "files": len(manifest), "bytes": destination.stat().st_size,
                      "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}, ensure_ascii=False))
    return destination


if __name__ == "__main__":
    assemble()
