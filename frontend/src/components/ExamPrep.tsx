import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import {MATERIAL_ACCEPT,validateMaterialFile} from '../materialFormats';
import {pageLabel,type Card,type Citation,type ExamList,type ExamReport,type ExamType,type Material} from '../domain';
import './ExamPrep.css';

type Props={courseId:string;materials:Material[];cards:Card[];onSource:(source:Citation)=>void;openCard?:(card:Card)=>void;onImported?:()=>void|Promise<void>};
const types:Record<ExamType,string>={midterm:'期中',final:'期末',other:'其他考试'};
export default function ExamPrep({courseId,materials,cards,onSource,openCard,onImported}:Props){
  const [data,setData]=useState<ExamList>({exams:[],reports:[]});
  const [selected,setSelected]=useState<string[]>([]),[materialId,setMaterialId]=useState(''),[file,setFile]=useState<File|null>(null);
  const [year,setYear]=useState(''),[examType,setExamType]=useState<ExamType>('final');
  const [instruction,setInstruction]=useState(''),[count,setCount]=useState(3),[report,setReport]=useState<ExamReport|null>(null);
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const lock=useRef(false),alive=useRef(true),fileInput=useRef<HTMLInputElement>(null);
  const analyzeRequest=useRef<{signature:string;id:string}|null>(null);
  const [pendingUpload,setPendingUpload]=useState<Material|null>(null);
  async function load(){setLoading(true);setError('');try{const result=await api.exams(courseId);if(alive.current){setData(result);setReport(result.reports[0]??null);}}catch(e){if(alive.current)setError(String(e instanceof Error?e.message:e));}finally{if(alive.current)setLoading(false);}}
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[courseId]);
  async function register(){
    if(lock.current)return;lock.current=true;setBusy('正在导入真题…');setError('');
    try{
      let chosen=materialId;
      if(file){const invalid=validateMaterialFile(file,100*1024*1024);if(invalid)throw new Error(invalid);const uploaded=await api.uploadCourseMaterial(courseId,file);chosen=uploaded.materialId;setMaterialId(chosen);setPendingUpload(uploaded);setFile(null);if(fileInput.current)fileInput.current.value='';}
      if(!chosen)throw new Error('请上传试卷或选择已有材料。');
      const result=await api.registerExam(courseId,chosen,year.trim(),examType);
      if(alive.current){setData(result);setSelected(prev=>[...new Set([...prev,chosen])]);setMaterialId('');setPendingUpload(null);}
      await onImported?.();
    }catch(e){if(alive.current)setError(String(e instanceof Error?e.message:e));}finally{lock.current=false;if(alive.current)setBusy('');}
  }
  async function analyze(){
    if(lock.current||!selected.length)return;lock.current=true;setBusy('正在分析考点并生成练习…');setError('');
    const signature=JSON.stringify([courseId,[...selected].sort(),instruction.trim(),count]);
    if(analyzeRequest.current?.signature!==signature)analyzeRequest.current={signature,id:crypto.randomUUID()};
    try{const result=await api.analyzeExams(courseId,selected,instruction.trim(),count,analyzeRequest.current.id);analyzeRequest.current=null;if(alive.current){setReport(result);setData(prev=>({...prev,reports:[result,...prev.reports.filter(r=>r.id!==result.id)]}));}}
    catch(e){if(alive.current)setError(String(e instanceof Error?e.message:e));}finally{lock.current=false;if(alive.current)setBusy('');}
  }
  function refs(title:string,items:Citation[]){return <div className="exam-refs"><strong>{title}</strong>{items.length?items.map(c=><button key={`${c.materialId}-${c.id}`} className="text-button" onClick={()=>onSource(c)}>{c.title} · {pageLabel(c)}<span>{c.quote}</span></button>):<p>暂无可靠匹配，请补充相关课程材料后重新分析。</p>}</div>;}
  return <section className="exam-prep" aria-label="真题与练习">
    <header><h2>真题与练习</h2><p>用往年试卷定位考点，回到课程材料理解知识，再用原创类似题练习。</p></header>
    <fieldset disabled={!!busy||loading}><legend>1. 导入往年真题</legend>
      <p>试卷会独立标记，不作为普通讲义依据。年份和考试类型由你填写。</p>
      <div className="exam-form-grid"><label>上传试卷<input ref={fileInput} type="file" accept={MATERIAL_ACCEPT} onChange={e=>{setFile(e.target.files?.[0]??null);setMaterialId('');setPendingUpload(null);}}/></label>
      <label>或选择已有材料<select value={materialId} onChange={e=>{setMaterialId(e.target.value);setFile(null);if(fileInput.current)fileInput.current.value='';}}><option value="">请选择</option>{pendingUpload&&!materials.some(m=>m.materialId===pendingUpload.materialId)&&<option value={pendingUpload.materialId}>{pendingUpload.title}（已上传，待加入真题库）</option>}{materials.filter(m=>m.status==='ready').map(m=><option key={m.materialId} value={m.materialId}>{m.title}</option>)}</select></label>
      <label>试卷年份<input placeholder="例如 2024，可留空" maxLength={30} value={year} onChange={e=>setYear(e.target.value)}/></label>
      <label>考试类型<select value={examType} onChange={e=>setExamType(e.target.value as ExamType)}>{Object.entries(types).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label></div>
      <button onClick={()=>void register()} disabled={!file&&!materialId}>加入真题库</button>
    </fieldset>
    {loading&&<p role="status">正在读取真题库…</p>}
    {error&&<div role="alert" className="exam-error">{error}<p>已保留输入，可再次点击对应操作重试。</p>{!data.exams.length&&<button disabled={!!busy} onClick={()=>void load()}>重新读取真题库</button>}</div>}
    <fieldset disabled={!!busy||loading}><legend>2. 选择试卷并分析</legend>
      <div className="exam-paper-list">{data.exams.length?data.exams.map(e=><label key={e.material.materialId}><input type="checkbox" checked={selected.includes(e.material.materialId)} onChange={event=>setSelected(prev=>event.target.checked?[...prev,e.material.materialId]:prev.filter(id=>id!==e.material.materialId))}/><span>{e.material.title}<small>{e.year||'年份未填写'} · {types[e.examType]}</small></span></label>):<p>还没有往年真题。可先上传试卷，即使课程暂时没有讲义也能分析。</p>}</div>
      <label>关注内容<textarea value={instruction} maxLength={1000} onChange={e=>setInstruction(e.target.value)} placeholder="例如：梳理计算题考点，重点解释容易混淆的知识"/></label>
      <div className="exam-actions"><label>原创练习题数量<select value={count} onChange={e=>setCount(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} 题</option>)}</select></label><button disabled={!selected.length} onClick={()=>void analyze()}>分析考点并出题</button></div>
    </fieldset>
    {busy&&<p role="status">{busy}</p>}
    {data.reports.length>0&&<label className="exam-history">查看已保存的分析<select value={report?.id??''} disabled={!!busy} onChange={e=>setReport(data.reports.find(r=>r.id===e.target.value)??null)}>{data.reports.map(r=><option key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString('zh-CN')} · {r.examMaterialIds.length} 份试卷 · {r.topics.length} 个考点</option>)}</select></label>}
    {report&&<section aria-label="真题分析报告" className="exam-report"><h3>考点与相关知识</h3><p>这是对所选往年试卷的学习分析，不代表未来考试范围或命题预测。</p>
      {report.limitations.length>0&&<aside className="exam-limitations"><strong>分析范围与不足</strong><ul>{report.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul></aside>}
      {!report.topics.length&&<p>现有材料不足以生成可靠考点，请补充可提取文字的试卷。</p>}
      {report.topics.map((t,i)=><article key={t.id}><h4>{i+1}. {t.title}</h4><p className="exam-prose">{t.analysis}</p>{refs('真题依据',t.examRefs)}{refs('对应课程知识',t.knowledgeRefs)}{t.relatedCardIds.length>0&&<div className="exam-related"><strong>相关学习卡片</strong>{t.relatedCardIds.map(id=>{const card=cards.find(c=>c.id===id);return card?<button key={id} disabled={!openCard} onClick={()=>openCard?.(card)}>{card.title}</button>:null;})}</div>}</article>)}
      <h3>原创类似练习</h3><p>以下题目由 AI 生成，并非往年原题；建议先作答，再查看提示和参考答案。</p>
      {!report.practice.length&&<p>本次没有生成可靠练习题。</p>}
      {report.practice.map((p,i)=><article key={p.id}><h4>练习 {i+1} · {report.topics.find(t=>t.id===p.topicId)?.title}</h4><p className="exam-prose">{p.question}</p>{p.hint&&<details><summary>查看提示</summary><p className="exam-prose">{p.hint}</p></details>}<details><summary>查看参考答案</summary><p className="exam-prose">{p.answer}</p></details></article>)}
    </section>}
  </section>;
}
