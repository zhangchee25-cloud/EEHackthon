import { Button, Input, Textarea, Toast, Tooltip, Alert, Badge, ConfirmDialog, Skeleton } from './components/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, Check, ChevronRight, FileText, Focus, LoaderCircle, MessageSquare, Plus, RotateCw, Sparkles, Target, X, PanelLeft, HelpCircle } from 'lucide-react';
import { api, validateAnswer } from './api';
import { pageLabel, toMarkdown, type Answer, type Card, type Citation, type Material, type Position } from './domain';
import { readDraft, storeDraft, useStudyState } from './hooks/useStudyState';
import LearnImport from './components/LearnImport';
import Whiteboard from './components/Whiteboard';
import PdfReader from './components/PdfReader';
import MaterialLibrary from './components/MaterialLibrary';
import StudyTabs from './components/StudyTabs';
import SourceList from './components/SourceList';
import CardsPanel, { getEditorDraft, type EditorDraft } from './components/CardsPanel';

const QUESTION_KEY = 'zhiye:question-draft:v1';
export default function App({ guideRequested = false }: { guideRequested?: boolean }) {
  const study = useStudyState();
  const courseId = study.state.activeCourseId;
  const courseRef = useRef(courseId); courseRef.current = courseId;
  const readingRef = useRef(study.state.readingPosition); readingRef.current = study.state.readingPosition;
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardBusy, setBoardBusy] = useState(false);
  const [scope, setScope] = useState('course');
  const [courseError, setCourseError] = useState('');
  const [courseWarnings, setCourseWarnings] = useState<string[]>([]);
  const [limits, setLimits] = useState<{maxBytes:number;maxPages:number|null}>({maxBytes:100*1024*1024,maxPages:null});
  const [fixture, setFixture] = useState(false);
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [material, setMaterial] = useState<Material | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploadName, setUploadName] = useState('');
  const materialPages = useRef<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [tab, setTab] = useState<'ask' | 'cards'>('ask');
  const [focus, setFocus] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'reader' | 'assistant'>('reader');
  const [showGuide, setShowGuide] = useState(guideRequested);
  useEffect(() => { if (guideRequested) setShowGuide(true); }, [guideRequested]);
  const [questions, setQuestions] = useState<Record<string,string>>(() => { const q = readDraft<Record<string,string>>(QUESTION_KEY + ':courses'); if(q && typeof q === 'object')return Object.fromEntries(Object.entries(q).filter(([,value])=>typeof value==='string')); const old=readDraft(QUESTION_KEY); return typeof old==='string'?{standalone:old}:{}; });
  const question = typeof questions[courseId || 'standalone']==='string'?questions[courseId || 'standalone']:'';
  const setQuestion = (value: string | ((s:string)=>string)) => setQuestions(all => ({...all,[courseId || 'standalone']: typeof value === 'function' ? value(all[courseId || 'standalone'] || '') : value}));
  const [questionStorageError, setQuestionStorageError] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [answeredQuestion, setAnsweredQuestion] = useState('');
  const [citation, setCitation] = useState<Citation | null>(null);
  const [oldView, setOldView] = useState<(Position & { title: string }) | null>(null);
  const [editors,setEditors] = useState<Record<string,EditorDraft|null>>({});
  const editor = useMemo(()=>!Object.hasOwn(editors,courseId || 'standalone') ? getEditorDraft(courseId) : editors[courseId || 'standalone'],[editors,courseId]);
  const setEditor = (next:EditorDraft|null) => setEditors(all=>({...all,[courseId || 'standalone']:next}));
  const [toast, setToast] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const locked = boardBusy || !study.ready || !!study.recovery || study.conflict;
  const scopedCards = study.state.cards.filter(c=>c.courseId === courseId);
  const current = material;
  const available = materials.filter(m=>m.status==='ready');
  const askMaterials = courseId && scope==='course' ? available : current?.status==='ready' ? [current] : [];
  const position = oldView || study.state.readingPosition;
  const title = oldView?.title || current?.title || '';
  const readyMaterial = askMaterials.length > 0;
  const reviewCount = scopedCards.filter(c => c.reviewStatus === 'to_review').length;

  const checkHealth = () => { setHealth('checking'); void api.health().then(data => { setHealth('online'); const l = (data as {limits?:{maxUploadBytes?:number;maxFileBytes?:number;maxPages?:number|null;maxPagesPerMaterial?:number|null;maxPdfPages?:number|null}})?.limits; if(l) setLimits({maxBytes:l.maxUploadBytes || l.maxFileBytes || 100*1024*1024,maxPages:l.maxPdfPages === null ? null : l.maxPdfPages ?? l.maxPages ?? l.maxPagesPerMaterial ?? null}); setFixture(!!data && typeof data === 'object' && (data as {mode?: string}).mode === 'test-fixture'); }).catch(() => { setHealth('offline'); setFixture(false); }); };
  useEffect(checkHealth, []);
  useEffect(() => { const saved=storeDraft(QUESTION_KEY + ':courses', questions);setQuestionStorageError(!saved);if(saved)storeDraft(QUESTION_KEY,null); }, [questions]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (editor || question.trim()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [editor, question]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const refreshCourse = useCallback(() => {
    if (!courseId) return;
    const owner=courseId;
    void api.courseMaterials(owner).then(result=>{
      if(courseRef.current!==owner)return;
      setMaterials(result.materials);setCourseWarnings(result.warnings);setCourseError('');
      setMaterial(old=>result.materials.find(m=>m.materialId===(old?.materialId || readingRef.current?.materialId) && m.versionId===(old?.versionId || readingRef.current?.versionId)) || result.materials.find(m=>m.status==='ready') || null);
    }).catch(e=>{if(courseRef.current===owner)setCourseError(e.message);});
  },[courseId]);
  useEffect(() => { setBoardOpen(false); }, [courseId]);
  useEffect(()=>{
    setAnswer(null);setCitation(null);setOldView(null);setAskError('');setMaterials([]);setMaterial(null);setScope('course');setCourseWarnings([]);setCourseError('');
    if(courseId) refreshCourse();
    else if(study.ready && study.state.readingPosition) {
      const pos=study.state.readingPosition;
      void api.material(pos.materialId).then(m=>{if(courseRef.current===null){setMaterial(m);setMaterials([m]);}}).catch(e=>setUploadError(e.message));
    }
  },[courseId,study.ready,refreshCourse]);
  useEffect(()=>{
    if (!material || locked) return;
    const pos=study.state.readingPosition;
    if(pos?.materialId !== material.materialId || pos.versionId !== material.versionId) study.update(s=>({...s,readingPosition:{materialId:material.materialId,versionId:material.versionId,page:1}}));
  },[material,locked]);
  const changeCourse=(id:string|null)=>{
    if(id===courseId)return;
    study.update(s=>({...s,activeCourseId:id,readingPosition:null}),true);
  };
  const askRequest=useRef({signature:'',id:''});
  const upload = async (file?: File) => {
    if (!file || locked || uploading || asking) return;
    if(courseId){setUploadError('请切换到“独立上传材料”后上传；课程文件请使用网络学堂导入。');return;}
    setUploadError(''); setUploadName(file.name);
    if (!file.name.toLowerCase().endsWith('.pdf')) { setUploadError('请选择 PDF 文件。扫描件 OCR 暂不支持，请使用含可选中文字的 PDF。'); return; }
    if (file.size === 0 || file.size > limits.maxBytes) { setUploadError(`请选择非空且不超过 ${limits.maxBytes/1024/1024} MB 的文本 PDF。`); return; }
    setUploading(true);
    try {
      const next = await api.upload(file);
      if (next.status !== 'ready') throw new Error(next.error || (next.status === 'processing' ? '材料仍在处理中。当前接口要求同步解析，请联系 B 确认处理结果后重新上传。' : '文字提取失败，请换一份文本 PDF。'));
      if (study.state.readingPosition) materialPages.current[`${study.state.readingPosition.materialId}:${study.state.readingPosition.versionId}`] = study.state.readingPosition.page;
      setMaterials(items => { const known = current && !items.some(m => m.materialId === current.materialId && m.versionId === current.versionId) ? [...items, current] : items; return [...known.filter(m => m.materialId !== next.materialId || m.versionId !== next.versionId), next]; });
      setMaterial(next); setOldView(null); setAnswer(null); setCitation(null); setAskError('');
      study.update(s => ({ ...s, readingPosition: { materialId: next.materialId, versionId: next.versionId, page: 1 } }), true);
      setHealth('online'); setToast('材料已就绪，可以开始阅读与提问。');
    } catch (e) { setUploadError(e instanceof Error ? e.message : '上传失败，原材料仍可继续阅读。'); }
    finally { setUploading(false); if (input.current) input.current.value = ''; }
  };
  const knownMaterials = current && !materials.some(m => m.materialId === current.materialId && m.versionId === current.versionId) ? [current, ...materials] : materials;
  const selectMaterial = (next: Material) => {
    if (locked || uploading || asking) return;
    if (study.state.readingPosition) materialPages.current[`${study.state.readingPosition.materialId}:${study.state.readingPosition.versionId}`] = study.state.readingPosition.page;
    setMaterial(next); setOldView(null); setAnswer(null); setCitation(null); setAskError(''); setMobileView('reader');
    study.update(s => ({ ...s, readingPosition: { materialId: next.materialId, versionId: next.versionId, page: materialPages.current[`${next.materialId}:${next.versionId}`] || 1 } }), true);
  };
  const ask = async () => {
    if (!askMaterials.length || !question.trim() || asking || uploading || locked) return;
    setAsking(true); setAskError(''); setAnswer(null); setCitation(null);
    const sent = question.trim(); const owner=courseId;
    const signature=JSON.stringify([owner,sent,askMaterials.map(m=>[m.materialId,m.versionId])]);
    if(askRequest.current.signature!==signature)askRequest.current={signature,id:crypto.randomUUID()};
    try {
      const response = courseId ? await api.askCourse(courseId,sent,askMaterials,askRequest.current.id) : validateAnswer(await api.ask(askMaterials[0].materialId,askMaterials[0].versionId,sent,askRequest.current.id),askMaterials);
      if(courseRef.current!==owner)return;
      setAnswer(response); setAnsweredQuestion(sent); setQuestion(q => q.trim() === sent ? '' : q); setHealth('online');
    } catch (e) { if(courseRef.current===owner)setAskError(e instanceof Error ? e.message : '提问失败，请重试。'); }
    finally { setAsking(false); }
  };
  const openCitation = (c: Citation) => {
    if (locked) return;
    setCitation(c); setBoardOpen(false); setMobileView('reader');
    requestAnimationFrame(() => document.getElementById('reader-view')?.focus({ preventScroll: true }));
    if (c.materialId === current?.materialId && c.versionId === current.versionId) {
      setOldView(null); study.update(s => ({ ...s, readingPosition: { materialId: c.materialId, versionId: c.versionId, page: c.pageStart } }));
    } else setOldView({ materialId: c.materialId, versionId: c.versionId, page: c.pageStart, title: c.title });
  };
  const createFromAnswer = (confirmed = false) => {
    if (!answer || !answer.answerSegments.length) return;
    if (editor && !confirmed) { setConfirmReplace(true); return; }
    const body = answer.answerSegments.map(s => s.text).join('\n\n');
    const used = new Set(answer.answerSegments.flatMap(s => s.citationIds));
    setChatOpen(true); setMobileView('assistant'); setEditor({ id: null, courseId, title: answeredQuestion.slice(0, 120), body, baseline: body, sourceRefs: answer.citations.filter(c => used.has(c.id)) }); setTab('cards');
  };
  const answerCard = useRef<{answer: Answer | null; id: string}>({answer: null, id: ''});
  const createCardDirectly = () => {
    if (locked || !answer?.answerSegments.length) return;
    if (answerCard.current.answer !== answer) answerCard.current = {answer, id: crypto.randomUUID()};
    const id = answerCard.current.id;
    if (!study.state.cards.some(card => card.id === id)) {
      const time = new Date().toISOString();
      const used = new Set(answer.answerSegments.flatMap(segment => segment.citationIds));
      saveCard({id, courseId, title: answeredQuestion.slice(0, 120), body: answer.answerSegments.map(segment => segment.text).join('\n\n'), origin: 'ai', sourceRefs: answer.citations.filter(c => used.has(c.id)), reviewStatus: 'to_review', createdAt: time, updatedAt: time});
    } else setToast('这份回答已创建卡片，可在卡片列表中编辑。');
    setChatOpen(true); setMobileView('assistant'); setTab('cards');
  };
  const saveCard = (card: Card) => {
    study.update(s => ({ ...s, cards: s.cards.some(c => c.id === card.id) ? s.cards.map(c => c.id === card.id ? card : c) : [card, ...s.cards] }), true);
    setToast('卡片已提交保存，请查看顶部保存结果。');
  };
  const exportCards = () => {
    const blob = new Blob(['\uFEFF' + toMarkdown({...study.state,cards:scopedCards})], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `清大搭-学习卡片-${new Date().toLocaleDateString('sv-SE')}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('已导出当前卡片与来源；未提交的编辑草稿不包含在内。');
  };
  const statusText = !study.ready ? '尚未读取学习状态' : study.saveStatus === 'saved' ? fixture ? '已保存至接口测试桩' : '已保存到本机服务' : study.saveStatus === 'saving' ? '正在保存…' : study.saveStatus === 'pending' ? '有修改待保存' : '保存失败 · 草稿已保留';
  const showAssistant = (next: 'ask' | 'cards' = 'ask') => {
    setChatOpen(true); setTab(next); setMobileView('assistant');
    if (next === 'ask') requestAnimationFrame(() => questionInput.current?.focus());
  };
  const guideStep = !study.state.goal.trim() ? 0 : !readyMaterial ? 1 : !answer ? 2 : !scopedCards.length ? 3 : 4;
  const guideSteps = ['设定目标', '上传讲义', '提问并核对出处', '创建学习卡片'];
  const usedCitations = answer?.citations.filter(c => answer.answerSegments.some(s => s.citationIds.includes(c.id))) || [];

  return <div className={`app ${focus ? 'focused' : ''} ${!chatOpen ? 'chat-closed' : ''} ${materialsOpen ? 'materials-open' : ''}`} data-mobile-view={mobileView}>
    <a className="skip-link" href="#study" onClick={e => { e.preventDefault(); setMobileView('reader'); requestAnimationFrame(() => document.getElementById('reader-view')?.focus()); }}>跳到学习内容</a>
    <header className="app-header">
      <a className="brand" href="#home" aria-label="清大搭首页"><span className="brand-mark"><BookOpen size={19} strokeWidth={1.7} /></span><span>清大搭<span className="brand-en" lang="en">THU O PAL</span></span></a>
      <nav className="workspace-breadcrumb" aria-label="面包屑"><span>/</span><h1>学习空间</h1><span>/</span><span className="breadcrumb-material" title={current?.title}>{current?.title || '未添加材料'}</span></nav>
      <div className="header-actions">
        <button className={`save-indicator ${study.saveStatus}`} onClick={study.flush} disabled={locked} aria-label={`学习状态：${statusText}，点击保存或重试`}><span className="dot" />{statusText}</button>
        <Button className="export-button" aria-label="导出 Markdown" onClick={exportCards} disabled={locked || !scopedCards.length}><ArrowDownToLine size={14} /><span>导出 Markdown</span></Button>
        <Tooltip label="查看学习流程"><button className="icon-button help-button" aria-label="查看学习流程" aria-expanded={showGuide} onClick={() => setShowGuide(v => !v)}><HelpCircle size={17} /></button></Tooltip>
      </div>
    </header>
    <main className="workspace">
      <div className="workspace-notices">
        {fixture && <div className="fixture-banner" role="status">接口测试桩 · 不含真实模型、PDF 解析或服务重启持久化。</div>}
        {!study.ready && (study.loadError ? <Alert title="学习服务未连接" action={<Button onClick={() => { void study.reload(); checkHealth(); }}><RotateCw size={14} />重新连接</Button>}>{study.loadError} 接通前不会写入空白状态。</Alert> : <div className="loading-state" role="status"><LoaderCircle className="spin" size={16} />正在读取学习状态…</div>)}
        {study.recovery && <Alert title="发现未保存的本机修改" tone="warning" action={<><Button onClick={study.discardRecovery}>使用服务端版本</Button><Button variant="primary" onClick={study.restore}>用本机草稿替换并保存</Button></>}>请选择恢复本机草稿，或继续使用服务端版本。</Alert>}
        {study.saveError && <Alert title="保存未成功 · 草稿已保留" action={<Button onClick={study.conflict?()=>void study.reload():study.flush}><RotateCw size={14} />{study.conflict?'重读并选择版本':'重试保存'}</Button>}>{study.saveError}</Alert>}
        {study.draftWarning && <Alert title="浏览器草稿存储不可用">请等待服务端保存成功后再关闭页面。</Alert>}
      </div>
      <LearnImport courseId={courseId} disabled={locked||asking||uploading} onCourse={changeCourse} onImported={refreshCourse}/>
      {courseError&&<Alert title="课程材料未加载" action={<Button onClick={refreshCourse}>重试课程材料</Button>}>{courseError}</Alert>}
      {courseWarnings.map((w,i)=><p key={i} className="error-text">{w}</p>)}
      <section className="goal-bar"><Target size={15} /><label htmlFor="goal">本次目标</label><Input id="goal" value={study.state.goal} disabled={locked} onChange={e => study.update(s => ({ ...s, goal: e.target.value }))} onBlur={study.flush} maxLength={1000} placeholder="这次想弄懂什么？" /><span className="goal-note">一次专注一个问题</span></section>
      {showGuide && <section className="study-guide" aria-label="学习流程指引"><div className="guide-heading"><strong>学习流程</strong><button className="icon-button" aria-label="关闭学习指引" onClick={() => setShowGuide(false)}><X size={16} /></button></div><ol>{guideSteps.map((step, i) => <li key={step} aria-current={guideStep === i ? 'step' : undefined} className={guideStep > i ? 'done' : ''}><span>{guideStep > i ? <Check size={12} /> : i + 1}</span>{step}</li>)}</ol><p>{!study.ready ? '先连接学习服务，再设定目标并上传 PDF。' : guideStep === 0 ? '写下这次想弄懂的问题。' : guideStep === 1 ? '上传一份含可选中文字的 PDF。' : guideStep === 2 ? '向材料提问，再点击引用核对原文。' : guideStep === 3 ? '从回答直接创建卡片，或按需编辑后保存。' : '理解已保存。可以自检、记录下次目标或导出。'}</p></section>}
      <div className="workspace-controls">
        <Button className="materials-toggle" aria-expanded={materialsOpen} aria-controls="materials-panel" onClick={() => { setMaterialsOpen(v => !v); setFocus(false); }}><PanelLeft size={15} />材料<span className="count">{knownMaterials.length}</span></Button>
        <span className="workspace-caption">课程学习<ChevronRight size={12} />{oldView ? '核对历史来源' : '阅读与理解'}</span>
        <div className="workspace-control-actions">{courseId&&<Button aria-pressed={boardOpen} onClick={()=>{setBoardOpen(v=>!v);setMobileView('reader');}}>课程白板</Button>}<Button variant="quiet" className={`focus-button ${focus ? 'active' : ''}`} aria-pressed={focus} onClick={() => { setFocus(v => !v); setMaterialsOpen(false); }}><Focus size={15} />{focus ? '退出专注' : '专注阅读'}</Button><Button variant="quiet" className="chat-toggle" onClick={() => setChatOpen(v => !v)} aria-expanded={chatOpen} aria-controls="assistant-view"><MessageSquare size={15} />学习助手</Button></div>
      </div>
      <StudyTabs className="mobile-view-tabs" label="工作区视图" value={mobileView} onChange={value => { setMobileView(value); if (value === 'assistant') setChatOpen(true); }} items={[
        { value: 'reader', id: 'reader-view-tab', panelId: 'reader-view', label: <><BookOpen size={16} />阅读材料</> },
        { value: 'assistant', id: 'assistant-view-tab', panelId: 'assistant-view', label: <><MessageSquare size={16} />学习助手{editor && <span className="draft-dot" title="有编辑草稿" />}</> },
      ]} />
      <div className="learning-grid">
        <aside className="material-sidebar panel" id="materials-panel" aria-label="课程材料与下次目标">
          <MaterialLibrary limits={limits} courseId={courseId} materials={knownMaterials} current={current} disabled={locked || uploading || asking} uploading={uploading} uploadName={uploadName} error={uploadError} onUpload={() => input.current?.click()} onDrop={file => void upload(file)} onSelect={selectMaterial} />
          <div className="sidebar-bottom"><div className="study-stats"><span>我的理解 <strong>{scopedCards.length}</strong></span><span>待复习 <strong>{reviewCount}</strong></span></div><div className="next-step"><label htmlFor="next-step">下次继续</label><Textarea id="next-step" rows={3} maxLength={2000} disabled={locked} value={study.state.nextStep} onChange={e => study.update(s => ({ ...s, nextStep: e.target.value }))} onBlur={study.flush} placeholder="记下下次的起点…" /></div></div>
        </aside>
        <div className="reader-column" id="reader-view" role="tabpanel" aria-labelledby="reader-view-tab" tabIndex={0}>
          {courseId&&<div hidden={!boardOpen} className="board-container"><Whiteboard key={courseId} stateRevision={study.state.revision} onApplied={async () => { await study.reload(); }} onBusyChange={setBoardBusy} courseId={courseId} cards={scopedCards} disabled={locked||!!editor||study.saveStatus!=='saved'} onSource={openCitation} onOpen={card=>{if(editor){setToast('请先保存或放弃当前卡片草稿。');showAssistant('cards');return;}setEditor({id:card.id,courseId:card.courseId,title:card.title,body:card.body,baseline:null,sourceRefs:card.sourceRefs});showAssistant('cards');}}/></div>}
          <div hidden={boardOpen} className="reader-content">
          {oldView && <div className="old-source-bar"><span>正在核对历史来源 · 版本 {oldView.versionId}</span><button className="text-button" onClick={() => { setOldView(null); setCitation(null); }}>返回当前材料</button></div>}
          <PdfReader onUpload={() => input.current?.click()} uploadDisabled={locked || uploading || asking} position={position} title={title} onAsk={() => showAssistant()} askDisabled={!readyMaterial || locked} onPage={page => { if (locked) return; if (oldView) setOldView({ ...oldView, page }); else study.update(s => s.readingPosition ? { ...s, readingPosition: { ...s.readingPosition, page } } : s); }} onLoaded={(id, count, filename) => { if (id !== current?.materialId) return; setMaterials(items => items.map(item => item.materialId === id ? { ...item, pageCount: count, title: filename || item.title } : item)); setMaterial(m => ({ materialId: current.materialId, versionId: current.versionId, status: 'ready', warnings:m?.warnings || [],error:m?.error || null,fileUrl:m?.fileUrl || api.fileUrl(id), title: m?.title || filename || current.title, pageCount: count })); }} />
          {citation && <section className="citation-detail" aria-label="引用原文"><div className="citation-heading"><span><QuoteIcon /><strong>{citation.title}</strong> · 文件{pageLabel(citation)}</span><button className="icon-button" aria-label="关闭引用摘录" onClick={() => setCitation(null)}><X size={16} /></button></div><blockquote>{citation.quote}</blockquote><div className="citation-bottom"><details><summary>来源版本</summary><span>材料 {citation.materialId} · 版本 {citation.versionId}</span></details><a href={api.fileUrl(citation.materialId, citation.pageStart)} target="_blank" rel="noreferrer">打开原 PDF 第 {citation.pageStart} 页<ArrowUpRight size={14} /></a></div></section>}
          <div className="reader-footnote">{oldView ? '历史来源 · 提问仍基于当前材料' : current ? '文件页序与原 PDF 一致' : '上传后可阅读原文并定位引用'}</div>
          </div>
        </div>
        <aside className="tools-panel panel" id="assistant-view" role="tabpanel" aria-labelledby="assistant-view-tab" tabIndex={0}>
          <StudyTabs label="学习工具" value={tab} onChange={setTab} items={[
            { value: 'ask', id: 'ask-tab', panelId: 'ask-panel', label: <><MessageSquare size={16} />材料问答</> },
            { value: 'cards', id: 'cards-tab', panelId: 'cards-panel', label: <><BookOpen size={16} />我的理解<span className="tab-count">{scopedCards.length}</span>{editor && <span className="draft-dot" title="有编辑草稿" />}</> },
          ]} />
          <div hidden={tab !== 'ask'} role="tabpanel" id="ask-panel" aria-labelledby="ask-tab" className="ask-panel" tabIndex={0}>
            <div className="ask-scroll"><div className="assistant-intro"><span className="assistant-mark"><Sparkles size={19} /></span><div><h2>AI 学习助手</h2><p>依据所选课程材料回答，引用可定位原文。</p></div></div>
              {!answer && !asking && !askError && <div className="ask-empty"><span className="mini-label">从一个好问题开始</span>{['这个概念的核心是什么？', '这一步推导为什么成立？', '材料里的例子说明了什么？'].map(q => <button key={q} disabled={!readyMaterial || locked} onClick={() => { setQuestion(q); questionInput.current?.focus(); }}><span>{q}</span><ArrowUpRight size={15} /></button>)}<div className="grounding-note"><BookOpen size={18} /><p>回答是起点，原文是依据。<br />材料未涵盖的内容，会明确说明。</p></div></div>}
              {asking && <div className="answer-loading" role="status"><LoaderCircle size={16} className="spin" /><strong>正在根据材料组织回答…</strong><p>可以继续阅读原文，完成后会在这里显示。</p><Skeleton /><Skeleton className="skeleton-short" /></div>}
              {askError && <Alert title="提问未完成" className="ask-error" action={<Button disabled={locked || !readyMaterial || !question.trim() || uploading || asking} onClick={() => void ask()}><RotateCw size={14} />重试</Button>}>{askError}<p>问题已保留，可修改后重试。</p></Alert>}
              {answer && <div className="answer"><div className="question-bubble">{answeredQuestion}</div><p className="muted small">本次范围：{answer.selectedScope.map(s=>s.title).join("、") || "无可用材料"}</p><div className="answer-label"><Badge tone="warning">AI 草稿</Badge><span>可直接创建卡片，建议核对出处</span></div>
                {answer.answerSegments.map(segment => <div className="answer-segment" key={segment.id}><p>{segment.text}</p><div className="inline-citations">{segment.citationIds.map(id => { const c = answer.citations.find(c => c.id === id)!; const number = usedCitations.findIndex(item => item.id === id) + 1; return <button key={id} onClick={() => openCitation(c)} aria-label={`引用 ${number}，${c.title}，${pageLabel(c)}`}><span>{number}</span>{pageLabel(c)}<ArrowUpRight size={12} /></button>; })}</div></div>)}
                {!answer.answerSegments.length && <div className="answer-empty" role="status">当前材料未提供可用回答。可换个问题，或上传包含相关内容的材料。</div>}
                <SourceList refs={usedCitations} onOpen={openCitation} label="核对回答来源" showQuotes />
                {answer.limitations.length > 0 && <Alert className="limitations" title="材料范围与不足" tone="warning">{answer.limitations.map((text, i) => <p key={i}>{text}</p>)}</Alert>}
                <button className="button secondary new-card-action" disabled={locked || !answer.answerSegments.length} onClick={createCardDirectly}><Plus size={16} />直接创建卡片<ArrowRight size={15} /></button>
                <button className="text-button" disabled={locked || !answer.answerSegments.length} onClick={() => createFromAnswer()}>编辑后创建</button>
              </div>}
            </div>
            <form className="question-composer" onSubmit={e => { e.preventDefault(); void ask(); }}>
              {courseId&&<label className="scope-select">提问范围<select aria-label="提问范围" value={scope} disabled={asking} onChange={e=>{setScope(e.target.value);setAnswer(null);setAskError('');}}><option value="course">本课程全部已就绪材料（{available.length}）</option><option value="file">仅当前阅读文件</option></select></label>}
              <div className="chat-context"><FileText size={14} /><span title={askMaterials.map(m=>m.title).join("、")}>{courseId&&scope==='course'?`本课程 ${askMaterials.length} 份已就绪材料`:current?.title || '尚未添加材料'}</span><small>{current ? current.pageCount ? `全部 ${current.pageCount} 页` : '全部页面' : 'PDF'}</small></div>
              <label htmlFor="question" className="sr-only">向材料提问</label><Textarea id="question" ref={questionInput} value={question} maxLength={4000} disabled={!readyMaterial || locked || uploading} onChange={e => setQuestion(e.target.value)} placeholder={readyMaterial ? '写下你对这份材料的疑问…' : '添加一份材料，开启有依据的问答…'} onKeyDown={e => { if (!e.nativeEvent.isComposing && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void ask(); } }} />
              <div className="composer-bottom"><button className="icon-button composer-add" type="button" aria-label="添加 PDF 材料" onClick={() => input.current?.click()} disabled={locked || uploading || asking}><Plus size={17} /></button><span className="send-hint">⌘ / Ctrl + Enter</span><button type="submit" className="send-button" aria-label={asking ? '正在提问' : '发送问题'} disabled={locked || !readyMaterial || !question.trim() || asking || uploading}>{asking ? <LoaderCircle className="spin" size={17} /> : <><span>提问</span><ArrowUp size={17} /></>}</button></div>
              {questionStorageError && <p className="error-text">本机问题草稿存储不可用，请保留当前页面。</p>}
            </form><p className="ai-notice">AI 回答仅供学习参考，请结合原文判断。</p>
          </div>
          <div hidden={tab !== 'cards'} role="tabpanel" id="cards-panel" aria-labelledby="cards-tab" className="cards-tab-content" tabIndex={0}><CardsPanel materials={materials} courseId={courseId} cards={scopedCards} editor={editor?.courseId===courseId?editor:null} setEditor={setEditor} onSave={saveCard} onReview={(id, reviewStatus) => study.update(s => ({ ...s, cards: s.cards.map(c => c.id === id ? { ...c, reviewStatus, selfCheckedAt:reviewStatus==='self_checked'?new Date().toISOString():null, updatedAt: new Date().toISOString() } : c) }), true)} onSource={openCitation} disabled={locked} /></div>
        </aside>
      </div>
      <footer className="workspace-footer"><span>清大搭 · 个人课程学习空间</span><button className={`service-status ${health}`} onClick={checkHealth} title="点击检查本机后端连接"><span className="dot" />{health === 'online' ? fixture ? '接口测试桩已连接' : '本机服务已连接' : health === 'checking' ? '正在检查本机服务' : '本机服务未连接'}<RotateCw size={12} /></button></footer>
    </main>
    <Input ref={input} type="file" accept=".pdf,application/pdf" aria-label="上传课程 PDF" className="sr-only" disabled={locked || uploading || asking} onChange={e => void upload(e.target.files?.[0])} />
    <ConfirmDialog open={confirmReplace} title="替换当前卡片草稿？" confirmLabel="替换草稿" onCancel={() => setConfirmReplace(false)} onConfirm={() => { setConfirmReplace(false); createFromAnswer(true); }}>当前尚未提交的内容将被新的 AI 草稿替换。已保存的理解卡片不受影响。</ConfirmDialog>
    {toast && <Toast>{toast}</Toast>}
  </div>;
}
function QuoteIcon() { return <FileText size={16} />; }
