"""Optional real-model acceptance with self-authored text only; no school data."""
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import tempfile
import uuid

from .config import Config
from .service import WorkspaceService


def main():
    report = {'kind': 'self_authored_exam_live', 'checks': []}
    def check(name, passed):
        report['checks'].append({'name': name, 'passed': bool(passed)})
        if not passed: raise AssertionError(name)
    with tempfile.TemporaryDirectory(prefix='exam-live-') as folder:
        config = replace(Config.from_env(), data_dir=Path(folder), max_context_chars=12000)
        service = WorkspaceService(config)
        cid = service.courses.repo.upsert_course('self-authored', 'exam-demo', 'Self-authored linear systems')['courseId']
        try:
            sources = [
                ('lecture.md', '# Self-authored lecture\nA system T is additive when T(x+y)=T(x)+T(y). It is homogeneous when T(a*x)=a*T(x). A linear system must satisfy both properties. For T(x)=k*x, T(x+y)=k*x+k*y and T(a*x)=a*k*x, so the system is linear. An affine system T(x)=k*x+b with b nonzero fails T(0)=0 and is not linear.'),
                ('2023-midterm.md', '# Self-authored practice paper 2023\nQuestion 1: For real numbers x and y, let T(x)=3*x. Verify T(x+y)=T(x)+T(y). Identify the tested property.'),
                ('2024-final.md', '# Self-authored practice paper 2024\nQuestion 1: Is T(x)=2*x+1 a linear system? Evaluate T(0), and show whether additivity holds. Explain your reasoning.'),
            ]
            mids = []
            for i, (name, text) in enumerate(sources):
                raw = text.encode()
                material = service.upload(name, raw)
                service.courses.repo.link(cid, name, service.store.material(material['materialId']), hashlib.sha256(raw).hexdigest())
                if i:
                    mids.append(material['materialId'])
                    service.courses.exams.register(cid, {'materialId':material['materialId'], 'year':str(2022+i), 'examType':'midterm' if i==1 else 'final'})
            check('three Markdown files parsed and linked', len(service.courses.repo.materials(cid)) == 3)
            body = {'requestId':'live_'+uuid.uuid4().hex, 'examMaterialIds':mids, 'instruction':'分析叠加性和线性判定的考点，给出讲义关联及两道完整、可解的原创变式题。', 'practiceCount':2}
            result = service.courses.exams.analyze(cid, body)
            check('real model identifies topics with paper evidence', bool(result['topics']) and all(t['examRefs'] for t in result['topics']))
            check('lecture knowledge linked', any(t['knowledgeRefs'] for t in result['topics']))
            check('two original exercises with answers', len(result['practice']) == 2 and all(p['answer'] for p in result['practice']))
            check('idempotent response', service.courses.exams.analyze(cid, body) == result)
            check('reports stored', service.courses.exams.listing(cid)['reports'][0] == result)
            check('exam papers excluded from default lecture scope', len(service.courses.materials(cid)['materials']) == 1)
            report.update(topics=len(result['topics']), practice=len(result['practice']), result=result)
        finally:
            service.courses.close()
    output = Path(__file__).parent / 'test-results' / 'exam-live.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'checks':len(report['checks']), 'topics':report['topics'], 'practice':report['practice']}, ensure_ascii=True))


if __name__ == '__main__': main()
