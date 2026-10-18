"""Create a deliberate source-only handoff without secrets or user material."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BACKEND_FILES = (
    '__init__.py', '__main__.py', 'config.py', 'errors.py', 'storage.py',
    'model.py', 'service.py', 'server.py', 'pdf_worker.py', 'make_demo.py',
    'verify_live.py', 'diagnose_provider.py', 'package_handoff.py', 'start.ps1', 'requirements.txt',
    'requirements-dev.txt', '.env.example', 'README.md',
    'tests/__init__.py', 'tests/fixtures.py', 'tests/test_backend.py', 'tests/verify_handoff.py',
)

def package():
    files = [ROOT / 'backend' / name for name in BACKEND_FILES]
    files += [ROOT / 'docs' / name for name in ('api-contract.md', 'frontend-api.ts', 'backend-acceptance.md', 'backend-verification.json')]
    files += [ROOT / 'examples' / name for name in ('README.md', 'signals-systems-demo.pdf')]
    files += [ROOT / '.gitignore']
    missing = [str(path.relative_to(ROOT)) for path in files if not path.is_file()]
    if missing:
        raise RuntimeError('Missing handoff files: ' + ', '.join(missing))
    destination = ROOT / 'deliverables'
    destination.mkdir(exist_ok=True)
    output = destination / 'learning-agent-backend.zip'
    manifest = []
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            relative = path.relative_to(ROOT).as_posix()
            raw = path.read_bytes()
            manifest.append({'path': relative, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)})
            archive.writestr(relative, raw)
        archive.writestr('HANDOFF-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(output) as archive:
        names = archive.namelist()
        if any(name.endswith('/.env') or '/data/' in name or '/test-results/' in name for name in names):
            raise RuntimeError('Unexpected private file in handoff')
        private_path = ROOT / 'backend' / '.env'
        if private_path.is_file():
            settings = dict(line.split('=', 1) for line in private_path.read_text(encoding='utf-8').splitlines() if '=' in line and not line.startswith('#'))
            key = settings.get('MODEL_API_KEY', '').strip().encode()
            if key and any(key in archive.read(name) for name in names):
                raise RuntimeError('Credential detected in handoff')
    print(json.dumps({'package': str(output), 'files': len(manifest), 'containsPrivateConfiguration': False}, ensure_ascii=False))
    return output

if __name__ == '__main__':
    package()
