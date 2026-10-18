"""Build an A-only source handoff using an allowlist; never include .env or node_modules."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[2]
out = root / 'artifacts' / 'A-frontend-handoff.zip'
out.parent.mkdir(exist_ok=True)
entries = [
    'frontend/src', 'frontend/tests', 'frontend/scripts',
    'frontend/package.json', 'frontend/package-lock.json', 'frontend/tsconfig.json',
    'frontend/vite.config.ts', 'frontend/vitest.config.ts', 'frontend/index.html',
    'frontend/.env.example', 'frontend/.gitignore', 'frontend/README.md',
    'docs/api-contract.md', 'docs/frontend-A交付与验收.md',
    'docs/acceptance', 'docs/screenshots', '学习Agent-双电脑三小时分工.md',
]
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for entry in entries:
        path = root / entry
        files = sorted(p for p in path.rglob('*') if p.is_file()) if path.is_dir() else [path]
        for file in files:
            if '__pycache__' in file.parts or file.name.endswith('.pyc'):
                continue
            archive.write(file, file.relative_to(root))
    archive.writestr('START.md', '''# A 前端源码交接包

此包仅含 A 的前端与接口/验收文档，不含 B 后端。

在 frontend/ 运行 npm ci，再运行 npm run dev。
页面 http://127.0.0.1:5173 需要真实后端 http://127.0.0.1:8000。
字段见 docs/api-contract.md，测试边界见 docs/frontend-A交付与验收.md。
运行 npm test 与 npm run build 可检查本包。
隔离接口桩仅供前端测试，不能代替真实模型与持久化验收。
''')
    if any('/.env.local' in name or '/node_modules/' in name for name in archive.namelist()):
        raise RuntimeError('Forbidden runtime files in source handoff')
print(out)
print(f'{out.stat().st_size:,} bytes; A-only source handoff, no secrets or dependency cache')
