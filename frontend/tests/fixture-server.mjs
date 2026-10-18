// Isolated A interface fixture: in-memory, synthetic PDFs, no school or model access.
import { createServer } from 'node:http';
import { createTestPdf } from './create-test-pdf.mjs';
const port=Number(process.env.FIXTURE_PORT||8011);
const empty=()=>({revision:0,activeCourseId:null,goal:'',nextStep:'',readingPosition:null,cards:[],updatedAt:null});
let state=empty(),failSave=false,auth='connected',failBoard=false;
const courses=[{courseId:'course-a',semesterId:'fall',upstreamCourseId:'up-a',name:'电路原理'},{courseId:'course-b',semesterId:'fall',upstreamCourseId:'up-b',name:'信号与系统'}];
const materials=new Map(), batches=new Map(),boards=new Map(),requests=new Map();
const previews=new Map(), appliedPreviews=new Map();
const pdf=createTestPdf();
const material=(id,title)=>({materialId:id,versionId:'fixture-v1',title,status:'ready',pageCount:3,error:null,warnings:[],fileUrl:`/api/materials/${id}/file`});
function files(courseId){return ['讲义一.pdf','讲义二.pdf','需重试.pdf','需登录.pdf','录像.mp4'].map((title,i)=>({fileId:`${courseId}-f${i}`,courseId,title,fileType:i===4?'mp4':'pdf',sizeBytes:1000,supported:i!==4,unsupportedReason:i===4?'暂不支持视频':null}));}
function advance(batch){
  if(batch.status!=='running')return batch;
  batch.tick=(batch.tick||0)+1;
  for(const item of batch.items){
    if(['ready','unsupported','failed','needs_auth'].includes(item.status))continue;
    item.status=batch.tick===1?'downloading':batch.tick===2?'processing':'ready';
    if(batch.tick>=3){
      if(item.title==='需重试.pdf'&&!item.retried){item.status='failed';item.error='接口测试：下载暂时失败';}
      else if(item.title==='需登录.pdf'&&!item.retried){item.status='needs_auth';item.error='接口测试：登录已失效';auth='needs_auth';}
      else{item.materialId=item.fileId;item.versionId='fixture-v1';item.error=null;materials.set(item.fileId,{...material(item.fileId,item.title),courseId:batch.courseId});}
    }
  }
  if(batch.items.every(i=>['ready','failed','needs_auth','unsupported'].includes(i.status)))batch.status=batch.items.some(i=>i.status==='needs_auth')?'needs_auth':batch.items.every(i=>i.status==='ready')?'completed':batch.items.some(i=>i.status==='ready')?'partial_failed':'failed';
  batch.updatedAt=new Date().toISOString();return batch;
}
createServer(async(req,res)=>{
  const json=(data,code=200)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const error=(message,code=503,kind='FIXTURE_ERROR',details)=>json({error:{code:kind,message,details}},code);
  const url=new URL(req.url,`http://127.0.0.1:${port}`),path=url.pathname;
  let body={};if(['POST','PUT'].includes(req.method)&&!path.endsWith('/materials')){let raw='';for await(const c of req)raw+=c;try{body=JSON.parse(raw||'{}');}catch{return error('Invalid JSON',400);}}
  if(path==='/api/health')return json({status:'ok',mode:'test-fixture',limits:{maxUploadBytes:5*1024*1024,maxPages:20}});
  if(path==='/__fixture__/reset'){state=empty();materials.clear();batches.clear();boards.clear();requests.clear();previews.clear();appliedPreviews.clear();failSave=false;failBoard=false;auth='connected';return json(state);}
  if(path==='/__fixture__/fail-save'){failSave=url.searchParams.get('enabled')==='1';return json({failSave});}
  if(path==='/__fixture__/fail-board'){failBoard=url.searchParams.get('enabled')==='1';return json({failBoard});}
  if(path==='/__fixture__/conflict'){state.revision++;state.goal='其他窗口的目标';return json(state);}
  if(path==='/__fixture__/board-conflict'){const b=boards.get(url.searchParams.get('courseId'));if(b)b.revision++;return json(b||{});}
  if(path==='/__fixture__/state')return json(state);
  if(path==='/api/state'&&req.method==='GET')return json(state);
  if(path==='/api/state'&&req.method==='PUT'){
    if(failSave)return error('接口测试：磁盘保存失败');
    if(body.revision!==state.revision)return error('学习状态版本冲突',409,'STATE_CONFLICT',{currentRevision:state.revision});
    state={...body,revision:state.revision+1,updatedAt:new Date().toISOString()};return json(state);
  }
  if(path==='/api/learn/status')return json({status:auth,message:auth==='connected'?'接口测试桩：连接有效':'接口测试桩：请重新连接',loginUrl:'/api/learn/connect'});
  if(path==='/api/learn/connect'){auth='connected';res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});return res.end('<h1>接口测试桩</h1><p>模拟连接完成。返回学习空间刷新连接状态。</p>');}
  if(path==='/api/learn/semesters')return json({semesters:[{id:'fall',name:'2026 秋季（接口桩）'}]});
  if(path==='/api/learn/courses')return json({courses});
  const fileMatch=path.match(/^\/api\/learn\/courses\/([^/]+)\/files$/);
  if(fileMatch)return json({files:files(fileMatch[1]),complete:true,warnings:[]});
  if(path==='/api/learn/imports'&&req.method==='GET')return json({batches:[...batches.values()].filter(b=>b.courseId===url.searchParams.get('courseId'))});
  if(path==='/api/learn/imports'&&req.method==='POST'){
    if(requests.has(body.requestId))return json(requests.get(body.requestId),202);
    const batch={batchId:crypto.randomUUID(),courseId:body.courseId,status:'running',updatedAt:new Date().toISOString(),tick:0,items:files(body.courseId).filter(f=>body.fileIds.includes(f.fileId)).map(f=>({itemId:crypto.randomUUID(),fileId:f.fileId,title:f.title,status:f.supported?'pending':'unsupported',materialId:null,versionId:null,error:null}))};
    batches.set(batch.batchId,batch);requests.set(body.requestId,batch);return json(batch,202);
  }
  const batchMatch=path.match(/^\/api\/learn\/imports\/([^/]+)(\/retry)?$/);
  if(batchMatch){const b=batches.get(batchMatch[1]);if(!b)return error('Unknown batch',404);if(batchMatch[2]){for(const i of b.items)if(body.itemIds.includes(i.itemId)){i.status='pending';i.retried=true;i.error=null;}b.tick=0;b.status='running';return json(b);}return json(advance(b));}
  const aiMatch=path.match(/^\/api\/courses\/([^/]+)\/board\/(generate|apply)$/);
  if(aiMatch && req.method==='POST'){
    const [,courseId,action]=aiMatch;
    if(action==='generate'){
      if(body.instruction?.includes('失败'))return error('接口测试：AI生成失败',502);
      const requestKey=`board:${courseId}:${body.requestId}`;
      if(requests.has(requestKey))return json(requests.get(requestKey));
      const scope=[...materials.values()].filter(m=>m.courseId===courseId).map(({materialId,versionId,title})=>({materialId,versionId,title}));
      if(!scope.length)return error('请先导入课程材料',422);
      const now=new Date().toISOString(),previewId=crypto.randomUUID();
      const cards=['电荷','电压','储能'].map((title,i)=>({id:crypto.randomUUID(),courseId,origin:'ai',title,body:`【接口测试桩】${title}的学习要点`,sourceRefs:[{...scope[i%scope.length],id:`s-${i}`,pageStart:1,pageEnd:1,quote:'Energy is stored in the electric field.'}],reviewStatus:'to_review',selfCheckedAt:null,createdAt:now,updatedAt:now}));
      const nodes=cards.map((c,i)=>({id:crypto.randomUUID(),cardId:c.id,x:24+i*270,y:24}));
      const edges=[{id:crypto.randomUUID(),source:nodes[0].id,target:nodes[1].id,label:'影响'},{id:crypto.randomUUID(),source:nodes[1].id,target:nodes[2].id,label:'决定'}];
      const result={previewId,courseId,cards,nodes,edges,selectedScope:scope,limitations:['接口测试桩，仅验证交互。']};
      previews.set(previewId,result);requests.set(requestKey,result);return json(result);
    }
    const preview=previews.get(body.previewId);
    if(!preview||preview.courseId!==courseId)return error('生成预览不存在',404);
    if(appliedPreviews.has(body.previewId))return json(appliedPreviews.get(body.previewId));
    if(failSave||failBoard)return error('接口测试：白板保存失败');
    const old=boards.get(courseId)||{courseId,revision:0,nodes:[],edges:[],updatedAt:null};
    if(body.stateRevision!==state.revision)return error('学习状态版本冲突',409,'STATE_CONFLICT');
    if(body.boardRevision!==old.revision)return error('白板版本冲突',409,'BOARD_CONFLICT');
    const time=new Date().toISOString();
    state={...state,cards:[...state.cards,...preview.cards],revision:state.revision+1,updatedAt:time};
    const offset=old.nodes.length?Math.max(...old.nodes.map(n=>n.y))+240:0;
    const next={...old,nodes:[...old.nodes,...preview.nodes.map(n=>({...n,y:n.y+offset}))],edges:[...old.edges,...preview.edges],revision:old.revision+1,updatedAt:time};
    boards.set(courseId,next);const result={state,board:next};appliedPreviews.set(body.previewId,result);return json(result);
  }
  const courseMatch=path.match(/^\/api\/courses\/([^/]+)\/(materials|ask|board)$/);
  if(courseMatch){
    const [,courseId,action]=courseMatch;
    if(action==='materials')return json({course:courses.find(c=>c.courseId===courseId),materials:[...materials.values()].filter(m=>m.courseId===courseId),warnings:[]});
    if(action==='board'){
      let b=boards.get(courseId)||{courseId,revision:0,nodes:[],edges:[],updatedAt:null};
      if(req.method==='PUT'){if(failBoard)return error('接口测试：白板保存失败');if(body.revision!==b.revision)return error('白板版本冲突',409,'BOARD_CONFLICT',{currentRevision:b.revision});b={...body,revision:b.revision+1,updatedAt:new Date().toISOString()};boards.set(courseId,b);}return json(b);
    }
  }
  if(/^\/api\/materials\/[^/]+\/file$/.test(path)){res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':pdf.length});return res.end(pdf);}
  if(path==='/api/materials'&&req.method==='POST'){
    let raw='';for await(const c of req)raw+=c.toString('latin1');if(raw.includes('broken.pdf'))return error('接口测试：文件损坏',422);
    const m=material(`fixture-${Date.now()}`,'capacitors-self-authored.pdf');materials.set(m.materialId,m);return json(m);
  }
  if(/^\/api\/materials\/[^/]+$/.test(path))return json(materials.get(path.split('/').at(-1))||material(path.split('/').at(-1),'capacitors-self-authored.pdf'));
  if(path==='/api/ask'||courseMatch?.[2]==='ask'){
    const {question}=body;if(question.includes('失败'))return error('接口测试：模型请求失败',502);
    const selectedScope=(body.materialScope||[materials.get(body.materialId)]).filter(Boolean).map(({materialId,versionId,title})=>({materialId,versionId,title}));
    if(question.includes('量子'))return json({supported:false,answerSegments:[],citations:[],selectedScope,limitations:['接口测试桩：材料依据不足。']});
    const citations=selectedScope.map((m,i)=>({...m,id:`source-${i}`,pageStart:i%2+1,pageEnd:i%2+1,quote:'Energy is stored in the electric field.'}));
    return json({supported:true,answerSegments:[{id:'seg',text:`【接口测试桩，非真实模型回答】关于“${question}”：电容的能量储存在电场中。`,citationIds:citations.map(c=>c.id)}],citations,selectedScope,limitations:['仅验证前端交互；真实模型与学校导入待 B 验证。']});
  }
  return error('Test fixture endpoint not found',404);
}).listen(port,'127.0.0.1',()=>console.log(`INTERFACE TEST FIXTURE ONLY http://127.0.0.1:${port}`));
