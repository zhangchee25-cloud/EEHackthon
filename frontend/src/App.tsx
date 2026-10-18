import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, FileText, Focus, Layers, Leaf, LoaderCircle, MessageSquare, PanelLeftClose, Plus, RotateCw, Sparkles, Target, Upload, X, PanelLeft, HelpCircle } from 'lucide-react';
import { api } from './api';
import { pageLabel, toMarkdown, type Answer, type Card, type Citation, type Material, type Position } from './domain';
import { readDraft, storeDraft, useStudyState } from './hooks/useStudyState';
import PdfReader from './components/PdfReader';
import StudyTabs from './components/StudyTabs';
import SourceList from './components/SourceList';
import CardsPanel, { getEditorDraft, type EditorDraft } from './components/CardsPanel';

const QUESTION_KEY = 'zhiye:question-draft:v1';
export default function App({ guideRequested = false }: { guideRequested?: boolean }) {
  const study = useStudyState();
  const [fixture, setFixture] = useState(false);
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [material, setMaterial] = useState<Material | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [tab, setTab] = useState<'ask' | 'cards'>('ask');
  const [focus, setFocus] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'reader' | 'assistant'>('reader');
  const [showGuide, setShowGuide] = useState(guideRequested);
  useEffect(() => { if (guideRequested) setShowGuide(true); }, [guideRequested]);
  const [question, setQuestion] = useState(() => { const q = readDraft(QUESTION_KEY); return typeof q === 'string' ? q : ''; });
  const [questionStorageError, setQuestionStorageError] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [answeredQuestion, setAnsweredQuestion] = useState('');
  const [citation, setCitation] = useState<Citation | null>(null);
  const [oldView, setOldView] = useState<(Position & { title: string }) | null>(null);
  const [editor, setEditor] = useState<EditorDraft | null>(getEditorDraft);
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const locked = !study.ready || !!study.recovery;
  const current = material || (study.state.readingPosition ? { ...study.state.readingPosition, title: '上次学习材料', status: 'ready' as const, pageCount: 0 } : null);
  const position = oldView || study.state.readingPosition;
  const title = oldView?.title || current?.title || '';
  const readyMaterial = !!current && current.status === 'ready';
  const reviewCount = study.state.cards.filter(c => c.reviewStatus === 'to_review').length;

  const checkHealth = () => { setHealth('checking'); void api.health().then(data => { setHealth('online'); setFixture(!!data && typeof data === 'object' && (data as {mode?: string}).mode === 'test-fixture'); }).catch(() => { setHealth('offline'); setFixture(false); }); };
  useEffect(checkHealth, []);
  useEffect(() => { setQuestionStorageError(!storeDraft(QUESTION_KEY, question || null)); }, [question]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (editor || question.trim()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [editor, question]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const upload = async (file?: File) => {
    if (!file || locked || uploading || asking) return;
    setUploadError('');
    if (!file.name.toLowerCase().endsWith('.pdf')) { setUploadError('请选择 PDF 文件。扫描件 OCR 暂不支持，请使用含可选中文字的 PDF。'); return; }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) { setUploadError('请选择非空且不超过 20 MB 的文本 PDF。'); return; }
    setUploading(true);
    try {
      const next = await api.upload(file);
      if (next.status !== 'ready') throw new Error(next.error || (next.status === 'processing' ? '材料仍在处理中。当前接口要求同步解析，请联系 B 确认处理结果后重新上传。' : '文字提取失败，请换一份文本 PDF。'));
      setMaterial(next); setOldView(null); setAnswer(null); setCitation(null); setAskError('');
      study.update(s => ({ ...s, readingPosition: { materialId: next.materialId, versionId: next.versionId, page: 1 } }), true);
      setHealth('online'); setToast('材料已就绪，可以开始阅读与提问。');
    } catch (e) { setUploadError(e instanceof Error ? e.message : '上传失败，原材料仍可继续阅读。'); }
    finally { setUploading(false); if (input.current) input.current.value = ''; }
  };
  const ask = async () => {
    if (!current || !question.trim() || asking || uploading || locked) return;
    setAsking(true); setAskError(''); setAnswer(null); setCitation(null);
    const sent = question.trim();
    try {
      const response = await api.ask(current.materialId, current.versionId, sent);
      if (current.pageCount && response.citations.some(c => c.pageEnd > current.pageCount)) throw new Error('回答引用超出当前 PDF 页数，已停止展示，请联系后端核对。');
      setAnswer(response); setAnsweredQuestion(sent); setQuestion(q => q.trim() === sent ? '' : q); setHealth('online');
    } catch (e) { setAskError(e instanceof Error ? e.message : '提问失败，请重试。'); }
    finally { setAsking(false); }
  };
  const openCitation = (c: Citation) => {
    if (locked) return;
    setCitation(c); setMobileView('reader');
    if (c.materialId === current?.materialId && c.versionId === current.versionId) {
      setOldView(null); study.update(s => ({ ...s, readingPosition: { materialId: c.materialId, versionId: c.versionId, page: c.pageStart } }));
    } else setOldView({ materialId: c.materialId, versionId: c.versionId, page: c.pageStart, title: c.title });
  };
  const createFromAnswer = () => {
    if (!answer || !answer.answerSegments.length) return;
    if (editor && !window.confirm('替换当前尚未提交的卡片草稿？')) { setTab('cards'); return; }
    const body = answer.answerSegments.map(s => s.text).join('\n\n');
    const used = new Set(answer.answerSegments.flatMap(s => s.citationIds));
    setChatOpen(true); setMobileView('assistant'); setEditor({ id: null, title: answeredQuestion.slice(0, 120), body, baseline: body, sourceRefs: answer.citations.filter(c => used.has(c.id)) }); setTab('cards');
  };
  const saveCard = (card: Card) => {
    study.update(s => ({ ...s, cards: s.cards.some(c => c.id === card.id) ? s.cards.map(c => c.id === card.id ? card : c) : [card, ...s.cards] }), true);
    setToast('卡片已提交保存，请查看顶部保存结果。');
  };
  const exportCards = () => {
    const blob = new Blob(['\uFEFF' + toMarkdown(study.state)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `知页-学习卡片-${new Date().toLocaleDateString('sv-SE')}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('已导出当前卡片与来源；未提交的编辑草稿不包含在内。');
  };
  const statusText = !study.ready ? '尚未读取学习状态' : study.saveStatus === 'saved' ? fixture ? '已保存至接口测试桩' : '已保存到本机服务' : study.saveStatus === 'saving' ? '正在保存…' : study.saveStatus === 'pending' ? '有修改待保存' : '保存失败 · 草稿已保留';
  const showAssistant = (next: 'ask' | 'cards' = 'ask') => {
    setChatOpen(true); setTab(next); setMobileView('assistant');
    if (next === 'ask') requestAnimationFrame(() => questionInput.current?.focus());
  };
  const guideStep = !study.state.goal.trim() ? 0 : !readyMaterial ? 1 : !answer ? 2 : !study.state.cards.length ? 3 : 4;
  const guideSteps = ['设定目标', '上传讲义', '提问并核对出处', '改写并保存卡片'];
  const usedCitations = answer?.citations.filter(c => answer.answerSegments.some(s => s.citationIds.includes(c.id))) || [];

  return <div className={`app ${focus ? 'focused' : ''} ${!chatOpen ? 'chat-closed' : ''} ${materialsOpen ? 'materials-open' : ''}`} data-mobile-view={mobileView}>
    <header className="app-header">
      <a className="brand" href="#home" aria-label="知页首页"><span className="brand-mark"><BookOpen size={23} strokeWidth={1.7} /></span><span>知页<span className="brand-en">个人学习空间</span></span></a>
      <div className="workspace-title"><h1>我的学习空间</h1><span className="local-badge"><span className="dot" />本机演示</span></div>
      <div className="header-actions">
        <button className={`save-indicator ${study.saveStatus}`} onClick={study.flush} disabled={locked} title="目标、阅读位置与卡片统一保存；点击立即保存或重试">
          {study.saveStatus === 'saving' ? <LoaderCircle size={14} className="spin" /> : study.saveStatus === 'error' ? <RotateCw size={14} /> : <Check size={14} />}{statusText}
        </button>
        <button className="button secondary export-button" onClick={exportCards} disabled={locked || !study.state.cards.length}><ArrowDownToLine size={16} /><span>导出笔记</span></button>
        <button className="icon-button help-button" aria-label="查看学习流程" aria-expanded={showGuide} onClick={() => setShowGuide(v => !v)}><HelpCircle size={19} /></button>
      </div>
    </header>
    <main className="workspace">
      {fixture && <div className="fixture-banner" role="status">接口测试桩 · 用于前端验收，不含真实模型、PDF 解析或服务重启持久化。</div>}
      {!study.ready && <div className={`connection-banner ${study.loadError ? 'error-banner' : ''}`} role={study.loadError ? 'alert' : 'status'}>
        <div>{study.loadError ? <><strong>尚未连接学习服务</strong><span>{study.loadError} 接通前不会写入空白状态。</span></> : <><LoaderCircle className="spin" size={16} />正在读取已保存的学习状态…</>}</div>
        {study.loadError && <button className="button secondary" onClick={() => { void study.reload(); checkHealth(); }}><RotateCw size={14} />重新连接</button>}
      </div>}
      {study.recovery && <div className="connection-banner" role="status"><div><strong>发现上次未保存的学习修改</strong><span>服务端数据已读取。恢复本机草稿，或继续使用服务端版本。</span></div><div className="inline-actions"><button className="button secondary" onClick={study.discardRecovery}>使用服务端版本</button><button className="button primary" onClick={study.restore}>恢复并保存草稿</button></div></div>}
      {study.saveError && <div className="connection-banner error-banner" role="alert"><div><strong>保存尚未成功</strong><span>{study.saveError}</span></div><button className="button secondary" onClick={study.flush}><RotateCw size={14} />重试保存</button></div>}
      {study.draftWarning && <p className="error-text" role="alert">浏览器草稿存储不可用；请等待服务端保存成功后再关闭页面。</p>}
      {showGuide && <section className="study-guide" aria-label="学习流程指引"><div className="guide-heading"><strong>跟着做，留下第一张理解卡片</strong><button className="icon-button" aria-label="关闭学习指引" onClick={() => setShowGuide(false)}><X size={16} /></button></div><ol>{guideSteps.map((step, i) => <li key={step} aria-current={guideStep === i ? 'step' : undefined} className={guideStep > i ? 'done' : ''}><span>{guideStep > i ? <Check size={13} /> : i + 1}</span>{step}</li>)}</ol><p>{!study.ready ? '先连接本机学习服务，再填写目标并上传 PDF。' : guideStep === 0 ? '在下方写下这次想弄懂的一个问题。' : guideStep === 1 ? '从材料栏上传一份文本 PDF；窄屏可点击“材料”展开。' : guideStep === 2 ? '打开学习助手，向当前讲义提问，再点击回答中的引用核对原文。' : guideStep === 3 ? '点击“新建理解卡片”，亲手改写正文后保存。' : '卡片已留下。可以标记自检、填写下次目标，或导出笔记。'}</p></section>}
      <section className="goal-bar"><span className="goal-icon"><Target size={20} /></span><label htmlFor="goal">本次学习目标</label><input id="goal" value={study.state.goal} disabled={locked} onChange={e => study.update(s => ({ ...s, goal: e.target.value }))} onBlur={study.flush} maxLength={1000} placeholder="今天，你想弄懂什么？" /><span className="goal-note">一次，专注一个问题</span></section>
      <div className="workspace-controls">
        <button className="button secondary materials-toggle" aria-expanded={materialsOpen} aria-controls="materials-panel" onClick={() => { setMaterialsOpen(v => !v); setFocus(false); }}><PanelLeft size={16} />材料{current && <span className="count">1</span>}</button>
        <span className="workspace-caption"><BookOpen size={16} />课程学习<span className="caption-divider">/</span>{current?.title || '从一份讲义开始'}</span>
        <div className="workspace-control-actions"><button className={`button quiet focus-button ${focus ? 'active' : ''}`} onClick={() => { setFocus(v => !v); setMaterialsOpen(false); }}><Focus size={16} />{focus ? '退出专注' : '专注阅读'}</button><button className={`button secondary chat-toggle ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen(v => !v)} aria-expanded={chatOpen} aria-controls="assistant-view"><MessageSquare size={16} />学习助手</button></div>
      </div>
      <StudyTabs className="mobile-view-tabs" label="工作区视图" value={mobileView} onChange={value => { setMobileView(value); if (value === 'assistant') setChatOpen(true); }} items={[
        { value: 'reader', id: 'reader-view-tab', panelId: 'reader-view', label: <><BookOpen size={16} />阅读材料</> },
        { value: 'assistant', id: 'assistant-view-tab', panelId: 'assistant-view', label: <><MessageSquare size={16} />学习助手{editor && <span className="draft-dot" title="有编辑草稿" />}</> },
      ]} />
      <div className="learning-grid">
        <aside className="material-sidebar" id="materials-panel" aria-label="课程材料与下次目标">
          <div className="section-heading"><h2><Layers size={16} />材料库</h2><span className="count">{current ? '1 份' : '0 份'}</span></div>
          <div className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!locked && !asking) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files[0]); }}>
            <button disabled={locked || uploading || asking} onClick={() => input.current?.click()}>{uploading ? <LoaderCircle size={25} className="spin" /> : <Upload size={25} strokeWidth={1.5} />}<strong>{uploading ? '正在处理材料' : current ? '上传另一份材料' : '添加课程材料'}</strong><span>{uploading ? '解析完成后才能提问' : '选择文件，或拖放到这里'}</span><small>文本 PDF · 最大 20 MB</small></button>
            <input ref={input} type="file" accept=".pdf,application/pdf" aria-label="上传课程 PDF" className="sr-only" disabled={locked || uploading || asking} onChange={e => void upload(e.target.files?.[0])} />
          </div>
          {uploadError && <p className="error-text upload-error" role="alert">{uploadError}</p>}
          {current ? <div className="material-item"><div className="pdf-icon"><FileText size={18} /></div><div><strong>{current.title}</strong><p>{current.pageCount ? `${current.pageCount} 页` : '读取页数中'}<span>·</span><span className="ready-text"><Check size={12} />已就绪</span></p></div><button className="material-ask" aria-label="向当前材料提问" title="向当前材料提问" onClick={() => showAssistant()} disabled={locked}><Sparkles size={16} /></button></div> : <p className="no-material">从一份讲义开始，<br />把疑问留给阅读。</p>}
          <div className="scope-note"><CircleHelp size={14} /><p>问答围绕当前材料展开。<br />新文件不会覆盖旧卡片的出处。</p></div>
          <div className="sidebar-bottom"><div className="progress-title"><Leaf size={16} /><span>一点点，留下理解</span></div><div className="study-stats"><div><strong>{study.state.cards.length.toString().padStart(2, '0')}</strong><span>我的理解</span></div><div><strong>{reviewCount.toString().padStart(2, '0')}</strong><span>待复习</span></div></div><div className="next-step"><label htmlFor="next-step">下次从哪里继续<ArrowRight size={14} /></label><textarea id="next-step" rows={3} maxLength={2000} disabled={locked} value={study.state.nextStep} onChange={e => study.update(s => ({ ...s, nextStep: e.target.value }))} onBlur={study.flush} placeholder="为下次学习，留一个起点…" /></div></div>
        </aside>
        <div className="reader-column" id="reader-view" role="tabpanel" aria-labelledby="reader-view-tab" tabIndex={0}>
          {oldView && <div className="old-source-bar"><span>正在核对历史来源 · 版本 {oldView.versionId}</span><button className="text-button" onClick={() => { setOldView(null); setCitation(null); }}>返回当前材料</button></div>}
          <PdfReader position={position} title={title} onAsk={() => showAssistant()} askDisabled={!readyMaterial || locked} onPage={page => { if (locked) return; if (oldView) setOldView({ ...oldView, page }); else study.update(s => s.readingPosition ? { ...s, readingPosition: { ...s.readingPosition, page } } : s); }} onLoaded={(id, count, filename) => { if (id !== current?.materialId) return; setMaterial(m => ({ materialId: current.materialId, versionId: current.versionId, status: 'ready', title: m?.title || filename || current.title, pageCount: count })); }} />
          {citation && <section className="citation-detail" aria-label="引用原文"><div className="citation-heading"><span><QuoteIcon /><strong>{citation.title}</strong> · 文件{pageLabel(citation)}</span><button className="icon-button" aria-label="关闭引用摘录" onClick={() => setCitation(null)}><X size={16} /></button></div><blockquote>{citation.quote}</blockquote><div className="citation-bottom"><details><summary>来源版本</summary><span>材料 {citation.materialId} · 版本 {citation.versionId}</span></details><a href={api.fileUrl(citation.materialId, citation.pageStart)} target="_blank" rel="noreferrer">打开原 PDF 第 {citation.pageStart} 页<ArrowUpRight size={14} /></a></div></section>}
          <div className="reader-footnote">{oldView ? '正在阅读历史来源；提问范围仍为当前材料。' : current ? '读原文，核对出处，再留下自己的理解。' : '材料保存在本机服务，等待你继续阅读。'}</div>
        </div>
        <aside className="tools-panel panel" id="assistant-view" role="tabpanel" aria-labelledby="assistant-view-tab" tabIndex={0}>
          <StudyTabs label="学习工具" value={tab} onChange={setTab} items={[
            { value: 'ask', id: 'ask-tab', panelId: 'ask-panel', label: <><MessageSquare size={16} />材料问答</> },
            { value: 'cards', id: 'cards-tab', panelId: 'cards-panel', label: <><BookOpen size={16} />我的理解<span className="tab-count">{study.state.cards.length}</span>{editor && <span className="draft-dot" title="有编辑草稿" />}</> },
          ]} />
          <div hidden={tab !== 'ask'} role="tabpanel" id="ask-panel" aria-labelledby="ask-tab" className="ask-panel" tabIndex={0}>
            <div className="ask-scroll"><div className="assistant-intro"><span className="assistant-mark"><Sparkles size={19} /></span><div><h2>带着问题，读得更深</h2><p>根据当前材料回答，每个引用都可回到原文。</p></div></div>
              {!answer && !asking && !askError && <div className="ask-empty"><span className="mini-label">从一个好问题开始</span>{['这个概念的核心是什么？', '这一步推导为什么成立？', '材料里的例子说明了什么？'].map(q => <button key={q} disabled={!readyMaterial || locked} onClick={() => { setQuestion(q); questionInput.current?.focus(); }}><span>{q}</span><ArrowUpRight size={15} /></button>)}<div className="grounding-note"><BookOpen size={18} /><p>回答是起点，原文是依据。<br />材料未涵盖的内容，会明确说明。</p></div></div>}
              {asking && <div className="answer-loading" role="status"><LoaderCircle size={21} className="spin" /><strong>正在阅读材料，组织回答…</strong><p>请求期间，你可以继续阅读原文。</p></div>}
              {askError && <div className="ask-error" role="alert"><strong>这次提问未完成</strong><p>{askError}</p><span>问题仍保留在下方，可修改后重试。</span></div>}
              {answer && <div className="answer"><div className="question-bubble">{answeredQuestion}</div><div className="answer-label"><Sparkles size={15} /><strong>AI 草稿</strong><span>请核对出处</span></div>
                {answer.answerSegments.map(segment => <div className="answer-segment" key={segment.id}><p>{segment.text}</p><div className="inline-citations">{segment.citationIds.map(id => { const c = answer.citations.find(c => c.id === id)!; const number = usedCitations.findIndex(item => item.id === id) + 1; return <button key={id} onClick={() => openCitation(c)} aria-label={`引用 ${number}，${c.title}，${pageLabel(c)}`}><span>{number}</span>{pageLabel(c)}<ArrowUpRight size={12} /></button>; })}</div></div>)}
                <SourceList refs={usedCitations} onOpen={openCitation} label="核对回答来源" showQuotes />
                {answer.limitations.length > 0 && <div className="limitations"><strong>材料范围与不足</strong>{answer.limitations.map((text, i) => <p key={i}>{text}</p>)}</div>}
                <button className="button secondary new-card-action" disabled={locked || !answer.answerSegments.length} onClick={createFromAnswer}><Plus size={16} />新建理解卡片<ArrowRight size={15} /></button>
              </div>}
            </div>
            <form className="question-composer" onSubmit={e => { e.preventDefault(); void ask(); }}>
              <div className="chat-context"><FileText size={14} /><span title={current?.title}>{current?.title || '尚未添加材料'}</span><small>{current ? current.pageCount ? `全部 ${current.pageCount} 页` : '全部页面' : 'PDF'}</small></div>
              <label htmlFor="question" className="sr-only">向材料提问</label><textarea id="question" ref={questionInput} value={question} maxLength={4000} disabled={!readyMaterial || locked || uploading} onChange={e => setQuestion(e.target.value)} placeholder={readyMaterial ? '写下你对这份材料的疑问…' : '添加一份材料，开启有依据的问答…'} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void ask(); } }} />
              <div className="composer-bottom"><button className="icon-button composer-add" type="button" aria-label="添加 PDF 材料" onClick={() => input.current?.click()} disabled={locked || uploading || asking}><Plus size={17} /></button><span className="send-hint">⌘ / Ctrl + Enter</span><button type="submit" className="send-button" aria-label={asking ? '正在提问' : '发送问题'} disabled={locked || !readyMaterial || !question.trim() || asking || uploading}>{asking ? <LoaderCircle className="spin" size={17} /> : <><span>提问</span><ArrowUp size={17} /></>}</button></div>
              {questionStorageError && <p className="error-text">本机问题草稿存储不可用，请保留当前页面。</p>}
            </form><p className="ai-notice">AI 回答仅供学习参考，请结合原文判断。</p>
          </div>
          <div hidden={tab !== 'cards'} role="tabpanel" id="cards-panel" aria-labelledby="cards-tab" className="cards-tab-content" tabIndex={0}><CardsPanel cards={study.state.cards} editor={editor} setEditor={setEditor} onSave={saveCard} onReview={(id, reviewStatus) => study.update(s => ({ ...s, cards: s.cards.map(c => c.id === id ? { ...c, reviewStatus, updatedAt: new Date().toISOString() } : c) }), true)} onSource={openCitation} disabled={locked} /></div>
        </aside>
      </div>
      <footer className="workspace-footer"><span><Leaf size={14} />学习的进步，藏在你自己的表述里。</span><button className={`service-status ${health}`} onClick={checkHealth} title="点击检查本机后端连接"><span className="dot" />{health === 'online' ? fixture ? '接口测试桩已连接' : '本机服务已连接' : health === 'checking' ? '正在检查本机服务' : '本机服务未连接'}<RotateCw size={12} /></button></footer>
    </main>
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>;
}
function QuoteIcon() { return <FileText size={16} />; }
