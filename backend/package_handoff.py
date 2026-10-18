"""Create a deliberate source-only handoff without secrets or user material."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BACKEND_FILES = (
    '__init__.py', '__main__.py', 'config.py', 'errors.py', 'storage.py',
    'model.py', 'service.py', 'server.py', 'pdf_worker.py', 'make_demo.py',
    'learn.py', 'course_store.py', 'courses.py', 'verify_school_course_qa.py', 'assemble_candidate.py',
    'verify_live.py', 'verify_school_live.py', 'diagnose_provider.py', 'package_handoff.py', 'start.ps1', 'requirements.txt',
    'requirements-dev.txt', '.env.example', 'README.md',
    'tests/__init__.py', 'tests/fixtures.py', 'tests/test_backend.py',
    'tests/test_courses.py', 'tests/test_state_board_extra.py',
    'tests/test_course_qa_extra.py', 'tests/test_learn_transport.py', 'tests/verify_handoff.py',
)
EXAMPLE_FILES = ('README.md', 'signals-systems-demo.pdf')
DOC_FILES = ('B-验收记录.md',)


def source_files():
    """Explicit reviewed source list; never recurse into private directories."""
    return ([ROOT / 'backend' / name for name in BACKEND_FILES]
            + [ROOT / 'docs' / name for name in DOC_FILES]
            + [ROOT / 'examples' / name for name in EXAMPLE_FILES])

def package():
    files = source_files()
    missing = [str(path.relative_to(ROOT)) for path in files if not path.is_file()]
    if missing:
        raise RuntimeError('Missing handoff files: ' + ', '.join(missing))
    destination = ROOT / 'backend' / 'deliverables'
    destination.mkdir(exist_ok=True)
    output = destination / 'learning-agent-backend.zip'
    temporary = destination / 'learning-agent-backend.tmp.zip'
    manifest = []
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            relative = path.relative_to(ROOT).as_posix()
            raw = path.read_bytes()
            manifest.append({'path': relative, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)})
            archive.writestr(relative, raw)
        archive.writestr('HANDOFF-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(temporary) as archive:
        names = archive.namelist()
        expected = {path.relative_to(ROOT).as_posix() for path in files} | {'HANDOFF-MANIFEST.json'}
        if set(names) != expected or len(names) != len(expected):
            raise RuntimeError('Handoff source whitelist mismatch')
        if any(name.endswith('/.env') or any(part in name.split('/') for part in ('data', 'vendor', 'test-results', '__pycache__')) for name in names):
            raise RuntimeError('Unexpected private file in handoff')
        private_path = ROOT / 'backend' / '.env'
        if private_path.is_file():
            settings = dict(line.split('=', 1) for line in private_path.read_text(encoding='utf-8-sig').splitlines() if '=' in line and not line.lstrip().startswith('#'))
            key = settings.get('MODEL_API_KEY', '').strip().strip('\"\'').encode()
            if key and any(key in archive.read(name) for name in names):
                raise RuntimeError('Credential detected in handoff')
    temporary.replace(output)
    print(json.dumps({'package': str(output), 'files': len(manifest), 'containsPrivateConfiguration': False}, ensure_ascii=False))
    return output

if __name__ == '__main__':
    package()
