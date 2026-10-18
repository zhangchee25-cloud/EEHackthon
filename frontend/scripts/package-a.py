"""A-only source handoff. Output stays under frontend; include only explicit source paths."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

root = Path(__file__).resolve().parents[2]
out = root / 'frontend' / 'artifacts' / 'A-frontend-handoff.zip'
out.parent.mkdir(exist_ok=True)
entries = [
    'frontend/src', 'frontend/tests', 'frontend/scripts', 'frontend/public/fonts',
    'frontend/package.json', 'frontend/package-lock.json', 'frontend/tsconfig.json',
    'frontend/vite.config.ts', 'frontend/vitest.config.ts', 'frontend/index.html',
    'frontend/playwright.config.ts', 'frontend/playwright.a.config.ts',
    'frontend/.env.example', 'frontend/.gitignore', 'frontend/README.md',
    'docs/AB-本轮集成契约.md', 'docs/A-前端独立任务书.md', 'docs/A-验收记录.md',
    'docs/acceptance/capacitors-self-authored.pdf',
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

18:00 提交候选。仅含 A 前端，暂不接 FreeBBS。
在 frontend/ 运行 npm ci、npm test、npm run build、npm run dev。
真实页面 http://127.0.0.1:5173/#study 代理到本机后端 8000。
本轮契约 docs/AB-本轮集成契约.md；验收边界 docs/A-验收记录.md。
npm run test:ui 启动独立 8012/4175 桩测试，需要本机 Chrome。
不含 B 后端、模型密钥、学校会话；真实学校与模型联调仍待完成。
''')
    forbidden = [n for n in archive.namelist() if '/node_modules/' in n or '/.env.local' in n or n.startswith('backend/')]
    if forbidden:
        raise RuntimeError(f'Forbidden runtime files: {forbidden}')
digest = hashlib.sha256(out.read_bytes()).hexdigest()
out.with_suffix('.sha256').write_text(f'{digest}  {out.name}\n')
print(out)
print(f'{out.stat().st_size:,} bytes; SHA-256 {digest}')
