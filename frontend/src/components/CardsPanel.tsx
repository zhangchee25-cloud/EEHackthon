import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CheckCheck, ClipboardPen, Pencil, Plus, Save, X } from 'lucide-react';
import { z } from 'zod';
import { CardSchema, CitationSchema, editCard, pageLabel, type Card, type Citation } from '../domain';
import SourceList from './SourceList';
import { readDraft, storeDraft } from '../hooks/useStudyState';

const EditorSchema = z.object({ id: z.string().nullable(), title: z.string(), body: z.string(), baseline: z.string().nullable(), sourceRefs: z.array(CitationSchema) });
export type EditorDraft = z.infer<typeof EditorSchema>;
export const EDITOR_KEY = 'zhiye:card-draft:v1';
export function getEditorDraft(): EditorDraft | null { const r = EditorSchema.safeParse(readDraft(EDITOR_KEY)); return r.success ? r.data : null; }
type Props = { cards: Card[]; editor: EditorDraft | null; setEditor: (e: EditorDraft | null) => void; onSave: (card: Card) => void; onReview: (id: string, value: Card['reviewStatus']) => void; onSource: (c: Citation) => void; disabled: boolean };
export default function CardsPanel({ cards, editor, setEditor, onSave, onReview, onSource, disabled }: Props) {
  const [filter, setFilter] = useState<'all' | 'to_review' | 'self_checked'>('all');
  const [storageError, setStorageError] = useState(false);
  useEffect(() => { setStorageError(!storeDraft(EDITOR_KEY, editor)); }, [editor]);
  const filtered = cards.filter(c => filter === 'all' || c.reviewStatus === filter);
  const changed = editor?.baseline === null || editor?.body.trim() !== editor?.baseline?.trim();
  const valid = editor && editor.title.trim() && editor.body.trim() && changed;
  const commit = () => {
    if (!editor || !valid) return;
    const old = cards.find(c => c.id === editor.id);
    const time = new Date().toISOString();
    const card = old ? editCard(old, editor.title, editor.body) : {
      id: editor.id || crypto.randomUUID(), title: editor.title.trim(), body: editor.body.trim(),
      sourceRefs: editor.sourceRefs, reviewStatus: 'to_review' as const, createdAt: time, updatedAt: time,
    };
    onSave(CardSchema.parse(card)); setEditor(null);
  };
  const discard = () => { if (!editor || (!editor.title && !editor.body) || window.confirm('放弃这张尚未提交的卡片草稿？')) setEditor(null); };
  return <div className="cards-panel">
    {editor ? <div className="editor">
      <div className="editor-header"><button className="text-button" onClick={discard}><ArrowLeft size={14} />返回卡片</button><span className="tag warm">{editor.baseline !== null ? 'AI 草稿 · 待改写' : '我的理解 · 编辑中'}</span></div>
      <h3>用自己的话，再说一遍</h3><p className="muted small">{editor.baseline !== null ? '先核对原文，再改写下面的正文。你的理解，从这里开始。' : '保存个人表述，来源会随卡片一起保留。'}</p>
      <label className="field-label" htmlFor="card-title">卡片标题</label><input id="card-title" value={editor.title} maxLength={120} onChange={e => setEditor({ ...editor, title: e.target.value })} placeholder="给这次理解起个名字" />
      <label className="field-label" htmlFor="card-body">我的理解</label><textarea id="card-body" className="card-body" value={editor.body} maxLength={20000} onChange={e => setEditor({ ...editor, body: e.target.value })} placeholder="试着向一位同学解释这个概念…" />
      <div className="field-label">保留的来源</div>{editor.sourceRefs.length ? <SourceList refs={editor.sourceRefs} onOpen={onSource} /> : <p className="muted small">手写卡片，无材料来源。</p>}
      {!changed && <p className="inline-hint">请先改写 AI 草稿正文，再保存为自己的理解。</p>}
      {storageError && <p className="error-text" role="alert">浏览器草稿存储不可用，请保留当前页面，提交后确认服务端保存成功。</p>}
      <div className="editor-actions"><button className="button secondary" onClick={discard}><X size={14} />放弃草稿</button><button className="button primary" disabled={disabled || !valid} onClick={commit}><Save size={15} />保存我的理解</button></div>
      <p className="muted fine">保存后标记为待复习；“已自检”由你本人主动标记。</p>
    </div> : <>
      <div className="cards-toolbar"><select aria-label="筛选卡片" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">全部卡片 · {cards.length}</option><option value="to_review">待复习 · {cards.filter(c => c.reviewStatus === 'to_review').length}</option><option value="self_checked">已自检 · {cards.filter(c => c.reviewStatus === 'self_checked').length}</option></select><button className="text-button" disabled={disabled} onClick={() => setEditor({ id: null, title: '', body: '', baseline: null, sourceRefs: [] })}><Plus size={14} />手写卡片</button></div>
      {filtered.length === 0 ? <div className="tool-empty"><ClipboardPen size={30} strokeWidth={1.3} /><h3>{cards.length ? '这个分类还没有卡片' : '把「看懂了」变成「说清楚」'}</h3><p>{cards.length ? '切换分类，继续整理你的理解。' : '从回答创建草稿，或手写一张卡片。\n改写后的理解，会在这里留下来。'}</p></div> : <div className="card-list">{filtered.map(card => <article className="study-card" key={card.id}>
        <div className="study-card-top"><span className={`review-tag ${card.reviewStatus === 'self_checked' ? 'checked' : ''}`}>{card.reviewStatus === 'self_checked' ? <CheckCheck size={12} /> : <span className="dot" />}{card.reviewStatus === 'self_checked' ? '已自检' : '待复习'}</span><button className="icon-button" aria-label={`编辑卡片 ${card.title}`} disabled={disabled} onClick={() => setEditor({ id: card.id, title: card.title, body: card.body, baseline: null, sourceRefs: card.sourceRefs })}><Pencil size={14} /></button></div>
        <h3>{card.title}</h3><p className="card-content">{card.body}</p><SourceList refs={card.sourceRefs} onOpen={onSource} />
        <div className="study-card-bottom"><span>{new Date(card.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} 更新</span><button className="text-button" disabled={disabled} onClick={() => onReview(card.id, card.reviewStatus === 'to_review' ? 'self_checked' : 'to_review')}>{card.reviewStatus === 'to_review' ? <><Check size={13} />标记已自检</> : '设为待复习'}</button></div>
      </article>)}</div>}
      <div className="self-check-note">自检是你对自己的记录，不代表系统认证掌握。</div>
    </>}
  </div>;
}
