import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Course, CourseFile, ImportBatch, LearnStatus } from '../domain';
import { Alert, Button } from './ui';

const labels = {pending:'排队中',downloading:'下载中',processing:'解析中',ready:'已就绪',failed:'失败',needs_auth:'需要重新连接',unsupported:'不支持'};
type Props = { courseId: string|null; disabled: boolean; onCourse: (id: string|null) => void; onImported: () => void };
export default function LearnImport({courseId,disabled,onCourse,onImported}: Props) {
  const [status,setStatus] = useState<LearnStatus|null>(null);
  const [semesters,setSemesters] = useState<{id:string;name:string}[]>([]);
  const [semester,setSemester] = useState('');
  const [courses,setCourses] = useState<Course[]>([]);
  const [files,setFiles] = useState<CourseFile[]>([]);
  const [selected,setSelected] = useState<string[]>([]);
  const [warnings,setWarnings] = useState<string[]>([]);
  const [batches,setBatches] = useState<ImportBatch[]>([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [refresh,setRefresh] = useState(0);
  const active = useRef(courseId); active.current = courseId;
  const request = useRef({signature:'',id:''});
  const refreshMaterials = useRef(onImported); refreshMaterials.current = onImported;
  const check = useCallback(async () => {
    try { const next = await api.learnStatus(); setStatus(next); setError(''); } catch (e) { setError((e as Error).message); }
  },[]);
  useEffect(() => { void check(); window.addEventListener('focus',check); return () => window.removeEventListener('focus',check); },[check]);
  useEffect(() => {
    if (status?.status !== 'connected') return;
    let live = true;
    api.semesters().then(r => { if(live) {setSemesters(r.semesters);setSemester(s => s || r.semesters[0]?.id || '');} }).catch(e => {if(live)setError(e.message);});
    return () => {live=false;};
  },[status]);
  useEffect(() => {
    if (!semester) return; let live=true; setCourses([]);
    api.courses(semester).then(r=>{if(live)setCourses(r.courses);}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[semester]);
  useEffect(() => {
    setFiles([]);setSelected([]);setBatches([]);setWarnings([]);setError('');setBusy(false);
    if (!courseId) return; let live=true;
    // Batch recovery works even when the school session has expired.
    api.imports(courseId).then(r=>{if(live)setBatches(r.batches);}).catch(e=>{if(live)setError(e.message);});
    api.files(courseId).then(r=>{if(live) {setFiles(r.files);setSelected(r.files.filter(f=>f.supported).map(f=>f.fileId));setWarnings([...(r.complete?[]:['文件目录可能不完整，请刷新目录后核对。']),...r.warnings]);}}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[courseId,refresh]);
  useEffect(() => {
    const running = batches.filter(b=>b.status==='running');
    if (!running.length) return; let live = true;
    const timer=setTimeout(async()=>{
      const results=await Promise.allSettled(running.map(b=>api.importBatch(b.batchId)));
      if(!live)return;
      const updates: ImportBatch[]=[];
      results.forEach(r=>{if(r.status==='fulfilled')updates.push(r.value);else setError(r.reason.message);});
      setBatches(items=>items.map(b=>updates.find(u=>u.batchId===b.batchId)||b));
      if(updates.some(b=>b.items.some(i=>i.status==='ready')))refreshMaterials.current();
    },2000);
    return ()=>{live=false;clearTimeout(timer);};
  },[batches]);
  const run = async (retry?: ImportBatch) => {
    if(!courseId || busy)return;
    const owner=courseId; setBusy(true);setError('');
    try {
      const signature=JSON.stringify([courseId,[...selected].sort()]);
      if(request.current.signature!==signature)request.current={signature,id:crypto.randomUUID()};
      const batch=retry?await api.retryImport(retry.batchId,retry.items.filter(i=>i.status==='failed'||i.status==='needs_auth').map(i=>i.itemId)):await api.startImport(courseId,selected,request.current.id);
      if(active.current!==owner)return;
      setBatches(items=>[batch,...items.filter(b=>b.batchId!==batch.batchId)]);refreshMaterials.current();
    }catch(e){if(active.current===owner)setError((e as Error).message);}finally{if(active.current===owner)setBusy(false);}
  };
  return <details className="learn-import" open={undefined}>
    <summary>从网络学堂导入 · {courseId ? '当前课程' : '独立材料'} · {status?.status==='connected'?'已连接':'连接与课程设置'}</summary>
    <div className="learn-content">
      <div className="learn-actions"><Button onClick={()=>window.open(status?.loginUrl || '/api/learn/connect','_blank','noopener,noreferrer')}>连接网络学堂</Button><Button onClick={()=>void check()}>刷新连接状态</Button><span role="status">{status?.message || '正在检查连接'}</span></div>
      <p className="muted small">在本机连接页完成学校登录，再回来刷新。选择一门课程，一次导入所选文件。</p>
      <div className="course-selectors"><label>学期<select aria-label="学期" value={semester} onChange={e=>setSemester(e.target.value)} disabled={!semesters.length}>{semesters.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>课程<select aria-label="课程" value={courseId || ''} disabled={disabled} onChange={e=>onCourse(e.target.value||null)}><option value="">独立上传材料</option>{courseId&&!courses.some(c=>c.courseId===courseId)&&<option value={courseId}>已恢复课程 · {courseId}</option>}{courses.map(c=><option key={c.courseId} value={c.courseId}>{c.name}</option>)}</select></label>
      {courseId&&<Button onClick={()=>setRefresh(n=>n+1)} disabled={busy}>刷新文件与批次</Button>}</div>
      {error&&<Alert title="网络学堂操作未完成">{error}</Alert>}{warnings.map((w,i)=><p className="error-text" key={i}>{w}</p>)}
      {courseId&&<><div className="learn-actions"><Button disabled={disabled||busy||!files.some(f=>f.supported)} onClick={()=>setSelected(files.filter(f=>f.supported).map(f=>f.fileId))}>选择全部支持文件</Button><Button variant="primary" disabled={disabled||busy||!selected.length} loading={busy} onClick={()=>void run()}>一键获取并构建知识库（{selected.length}）</Button></div>
      <ul className="import-files">{files.map(f=><li key={f.fileId}><label><input type="checkbox" checked={selected.includes(f.fileId)} disabled={!f.supported||busy||disabled} onChange={e=>setSelected(ids=>e.target.checked?[...ids,f.fileId]:ids.filter(id=>id!==f.fileId))}/><strong>{f.title}</strong> · {f.fileType}{f.sizeBytes!==null&&` · ${(f.sizeBytes/1024).toFixed(0)} KB`}{!f.supported&&` · ${f.unsupportedReason || '不支持'}`}</label></li>)}</ul>
      {batches.map(b=><section className="import-batch" key={b.batchId} aria-label="导入批次"><strong>已就绪 {b.items.filter(i=>i.status==='ready').length} / {b.items.length}</strong>{b.items.some(i=>i.status==='needs_auth')&&<p>登录已失效，请重新连接后重试。</p>}<ul>{b.items.map(i=><li key={i.itemId}>{i.title}：<span>{labels[i.status]}</span>{i.error&&` · ${i.error}`}</li>)}</ul>{b.items.some(i=>i.status==='failed'||i.status==='needs_auth')&&<Button disabled={busy||disabled} onClick={()=>void run(b)}>重试失败或待认证项</Button>}</section>)}</>}
    </div>
  </details>;
}
