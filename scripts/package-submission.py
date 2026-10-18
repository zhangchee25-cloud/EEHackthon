"""Package the reviewed manifest plus explicitly listed v3 additions, without Git or credentials."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parent.parent
NAME = '校园学习生活赛道-507队-清大搭THUOPAL-v3-首页整合版'
ADDITIONS = (
    'frontend/src/components/BackgroundPaths.tsx',
    'scripts/package-submission.py',
    'docs/评委复现风险与排查.md',
    'docs/acceptance/capacitors-self-authored.pdf',
    '队伍介绍.md', '开源与AI使用声明.md', '允许后续开源.md',
)


def package():
    previous = json.loads((ROOT / 'HANDOFF-MANIFEST.json').read_text(encoding='utf-8-sig'))
    names = sorted({item['path'] for item in previous} | set(ADDITIONS))
    entries, manifest = {}, []
    for name in names:
        relative = PurePosixPath(name)
        if (relative.is_absolute() or '..' in relative.parts
                or any(part in relative.parts for part in ('.git', '.env', '.env.local', 'data', 'vendor', 'node_modules', '__pycache__', 'test-results'))
                or any(part.startswith('.env') and part != '.env.example' for part in relative.parts)):
            raise ValueError('Disallowed source path: ' + name)
        source = ROOT / name
        if source.is_symlink() or not source.resolve().is_relative_to(ROOT):
            raise ValueError('Source must be inside project: ' + name)
        raw = source.read_bytes()
        entries[name] = raw
        manifest.append({'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
    manifest_raw = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    (ROOT / 'HANDOFF-MANIFEST.json').write_bytes(manifest_raw)
    entries['HANDOFF-MANIFEST.json'] = manifest_raw
    output = ROOT / 'deliverables' / (NAME + '.zip')
    output.parent.mkdir(exist_ok=True)
    temporary = output.with_suffix('.tmp.zip')
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, raw in sorted(entries.items()):
            archive.writestr(NAME + '/' + name, raw)
    with zipfile.ZipFile(temporary) as archive:
        if archive.testzip() is not None or len(archive.namelist()) != len(entries):
            raise RuntimeError('Archive verification failed')
        for item in manifest:
            if hashlib.sha256(archive.read(NAME + '/' + item['path'])).hexdigest() != item['sha256']:
                raise RuntimeError('Manifest verification failed')
    temporary.replace(output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(digest + '  ' + output.name + '\n', encoding='utf-8')
    print(json.dumps({'archive': str(output), 'sourceFiles': len(manifest), 'bytes': output.stat().st_size, 'sha256': digest}, ensure_ascii=False))
    return output


if __name__ == '__main__':
    package()
