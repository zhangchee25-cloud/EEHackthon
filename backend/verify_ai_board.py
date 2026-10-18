"""Real-provider acceptance using only self-authored public test material."""
from dataclasses import replace
import json
from pathlib import Path
import tempfile
import threading
import urllib.request
import urllib.error
import uuid

from .config import Config
from .server import create_server
from .service import WorkspaceService
from .tests.fixtures import make_pdf


def main():
    report={'kind':'real_provider_ai_board','material':'self-authored Signals and Systems fixture only','checks':[]}
    def check(name,ok):
        report['checks'].append({'name':name,'passed':bool(ok)})
        if not ok: raise AssertionError(name)
    with tempfile.TemporaryDirectory(prefix='ai-board-live-') as folder:
        config=replace(Config.from_env(),data_dir=Path(folder),max_context_chars=8000)
        service=WorkspaceService(config)
        course=service.courses.repo.upsert_course('self-authored','ai-board','Self-authored Signals and Systems')
        cid=course['courseId']
        material=service.upload('self-authored-signals.pdf',make_pdf())
        service.courses.repo.link(cid,'self-authored',service.store.material(material['materialId']),'self-authored')
        server=create_server(config,service=service,port=0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def request(path,body=None,method=None):
            raw=json.dumps(body).encode() if body is not None else None
            try:
                with urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{server.server_port}/api'+path,data=raw,method=method,headers={'Content-Type':'application/json'}),timeout=180) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                detail=json.load(error)
                report['error']=detail
                raise RuntimeError(json.dumps(detail,ensure_ascii=False)) from None
        try:
            before=request('/state')
            prompt={'requestId':'verify_'+uuid.uuid4().hex,'instruction':'根据这份自制讲义生成3个核心概念卡片，解释线性、叠加性和齐次性的关系，并为有原文依据的关系连线。'}
            preview=request(f'/courses/{cid}/board/generate',prompt)
            check('real model produces grounded concept cards',len(preview['cards'])>=2)
            check('real model produces connected graph',bool(preview['edges']))
            check('AI origin and review status',all(c['origin']=='ai' and c['reviewStatus']=='to_review' for c in preview['cards']))
            check('citations preserved for all cards',all(c['sourceRefs'] for c in preview['cards']))
            check('generation is preview only',request('/state')==before)
            check('generation retry uses persisted preview',request(f'/courses/{cid}/board/generate',prompt)==preview)
            result=request(f'/courses/{cid}/board/apply',{'previewId':preview['previewId'],'stateRevision':before['revision'],'boardRevision':0})
            check('atomic cards and nodes persisted',len(result['state']['cards'])==len(preview['cards'])==len(result['board']['nodes']))
            check('atomic revisions advanced',result['state']['revision']==before['revision']+1 and result['board']['revision']==1)
            retry=request(f'/courses/{cid}/board/apply',{'previewId':preview['previewId'],'stateRevision':before['revision'],'boardRevision':0})
            check('application retry has no duplicate cards',retry==result)
            # A fresh service on the same temporary database proves persisted graph recovery.
            reopened=WorkspaceService(config)
            try:
                check('state survives reopening',reopened.store.state()==result['state'])
                check('board survives reopening',reopened.courses.repo.board(cid)==result['board'])
            finally:reopened.courses.close()
            report.update(passed=True,cardCount=len(preview['cards']),edgeCount=len(preview['edges']))
        finally:
            server.shutdown();server.server_close();thread.join(timeout=5)
            service.courses.close()
            output=Path(__file__).resolve().parent/'test-results/ai-board-live.json'
            output.parent.mkdir(exist_ok=True)
            output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
