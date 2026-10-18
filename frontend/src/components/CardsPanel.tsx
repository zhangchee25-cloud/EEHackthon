import { Button, Input, Textarea, Badge, ConfirmDialog, EmptyState, Alert } from './ui';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, ClipboardPen, Pencil, Plus, Save, X } from 'lucide-react';
import { z } from 'zod';
import { CardSchema, CitationSchema, editCard, type Card, type Citation } from '../domain';
import SourceList from './SourceList';
import { readDraft, storeDraft } from '../hooks/useStudyState';

const EditorSchema = z.object({ id: z.string().nullable(), courseId: z.string().nullable().default(null), title: z.string(), body: z.string(), baseline: z.string().nullable(), sourceRefs: z.array(CitationSchema) });
export type EditorDraft = z.infer<typeof EditorSchema>;
export const EDITOR_KEY = 'zhiye:card-draft:v1';
export function getEditorDraft(courseId: string | null = null): EditorDraft | null {
  const key=`${EDITOR_KEY}:${courseId || 'standalone'}`;
  const stored=readDraft(key);
  const old=stored===null&&courseId===null?readDraft(EDITOR_KEY):null;
  const r=EditorSchema.safeParse(stored ?? old);
  if(r.success&&old&&storeDraft(key,r.data))storeDraft(EDITOR_KEY,null);
  return r.success?r.data:null;
}
type Props = { courseId: string | null; cards: Card[]; editor: EditorDraft | null; setEditor: (e: EditorDraft | null) => void; onSave: (card: Card) => void; onReview: (id: string, value: Card['reviewStatus']) => void; onSource: (c: Citation) => void; disabled: boolean };
export default function CardsPanel({ courseId, cards, editor, setEditor, onSave, onReview, onSource, disabled }: Props) {
  const [filter, setFilter] = useState<'all' | 'to_review' | 'self_checked'>('all');
  const [storageError, setStorageError] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const hadEditor = useRef(!!editor);
  useEffect(() => {
    if (editor) document.getElementById('card-title')?.focus({ preventScroll: true });
    else if (hadEditor.current) createButton.current?.focus({ preventScroll: true });
    hadEditor.current = !!editor;
  }, [!!editor]);
  useEffect(() => { if (editor && editor.courseId !== courseId) return; setStorageError(!storeDraft(`${EDITOR_KEY}:${courseId || 'standalone'}`, editor)); }, [editor, courseId]);
  const filtered = cards.filter(c => filter === 'all' || c.reviewStatus === filter);
  const aiOrigin = (editor?.baseline !== null && editor?.baseline !== undefined) || cards.find(c => c.id === editor?.id)?.origin === 'ai';
  const valid = editor && editor.title.trim() && editor.body.trim();
  const commit = () => {
    if (!editor || !valid) return;
    const old = cards.find(c => c.id === editor.id);
    const time = new Date().toISOString();
    const card = old ? editCard(old, editor.title, editor.body) : {
      id: editor.id || crypto.randomUUID(), courseId: editor.courseId, title: editor.title.trim(), body: editor.body.trim(),
      origin: editor.baseline !== null ? 'ai' as const : 'manual' as const, sourceRefs: editor.sourceRefs, reviewStatus: 'to_review' as const, createdAt: time, updatedAt: time,
    };
    onSave(CardSchema.parse(card)); setEditor(null);
  };
  const discard = () => { if (!editor || (!editor.title && !editor.body)) setEditor(null); else setConfirmDiscard(true); };
  return <div className="cards-panel">
    <ConfirmDialog open={confirmDiscard} title="放弃当前卡片草稿？" onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); setEditor(null); }}>未提交的标题和正文将被清除。已保存的卡片仍会保留。</ConfirmDialog>
    {editor ? <div className="editor">
      <div className="editor-header"><button className="text-button" onClick={discard}><ArrowLeft size={14} />返回卡片</button><Badge tone={aiOrigin ? 'warning' : 'neutral'}>{aiOrigin ? 'AI 生成 · 可直接保存' : '我的理解 · 编辑中'}</Badge></div>
      <h3>保存学习卡片</h3><p className="muted small">{aiOrigin ? '可直接保存 AI 内容，也可以按需编辑。来源和 AI 标识会随卡片保留。' : '保存个人表述，来源会随卡片一起保留。'}</p>
      <label className="field-label" htmlFor="card-title">卡片标题</label><Input disabled={disabled} id="card-title" value={editor.title} maxLength={120} onChange={e => setEditor({ ...editor, title: e.target.value })} placeholder="给这次理解起个名字" />
      <label className="field-label" htmlFor="card-body">{aiOrigin ? '卡片内容' : '我的理解'}</label><Textarea disabled={disabled} id="card-body" className="card-body" value={editor.body} maxLength={20000} onChange={e => setEditor({ ...editor, body: e.target.value })} placeholder="试着向一位同学解释这个概念…" />
      <div className="field-label">保留的来源</div>{editor.sourceRefs.length ? <SourceList refs={editor.sourceRefs} onOpen={onSource} /> : <p className="muted small">手写卡片，无材料来源。</p>}
      {storageError && <Alert title="浏览器草稿存储不可用">请保留当前页面，提交后确认服务端保存成功。</Alert>}
      <div className="editor-actions"><Button onClick={discard}><X size={14} />放弃草稿</Button><Button variant="primary" disabled={disabled || !valid} onClick={commit}><Save size={15} />{aiOrigin ? '保存卡片' : '保存我的理解'}</Button></div>
      <p className="muted fine">保存后标记为待复习；“已自检”由你本人主动标记。</p>
    </div> : <>
      <div className="cards-toolbar"><select aria-label="筛选卡片" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">全部卡片 · {cards.length}</option><option value="to_review">待复习 · {cards.filter(c => c.reviewStatus === 'to_review').length}</option><option value="self_checked">已自检 · {cards.filter(c => c.reviewStatus === 'self_checked').length}</option></select><button ref={createButton} className="text-button" disabled={disabled} onClick={() => setEditor({ id: null, courseId, title: '', body: '', baseline: null, sourceRefs: [] })}><Plus size={14} />手写卡片</button></div>
      {filtered.length === 0 ? <EmptyState icon={<ClipboardPen size={20} />} title={cards.length ? '这个分类还没有卡片' : '留下第一张理解卡片'} action={!cards.length && <Button disabled={disabled} onClick={() => setEditor({ id: null, courseId, title: '', body: '', baseline: null, sourceRefs: [] })}><Plus size={14} />新建手写卡片</Button>}>{cards.length ? '切换分类，查看其他理解卡片。' : '从 AI 回答直接创建卡片，或手写一张卡片。'}</EmptyState> : <div className="card-list">{filtered.map(card => <article className="study-card" key={card.id}>
        <div className="study-card-top"><Badge tone={card.reviewStatus === 'self_checked' ? 'brand' : 'warning'}>{card.reviewStatus === 'self_checked' ? <CheckCheck size={12} /> : <span className="dot" />}{card.reviewStatus === 'self_checked' ? '已自检' : '待复习'}</Badge><button className="icon-button" aria-label={`编辑卡片 ${card.title}`} disabled={disabled} onClick={() => setEditor({ id: card.id, courseId: card.courseId, title: card.title, body: card.body, baseline: null, sourceRefs: card.sourceRefs })}><Pencil size={14} /></button></div>
        {card.origin === 'ai' && <Badge tone="neutral">AI 生成</Badge>}<h3>{card.title}</h3><p className="card-content">{card.body}</p><SourceList refs={card.sourceRefs} onOpen={onSource} />
        <div className="study-card-bottom"><span>{new Date(card.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} 更新</span><button className="text-button" disabled={disabled} onClick={() => onReview(card.id, card.reviewStatus === 'to_review' ? 'self_checked' : 'to_review')}>{card.reviewStatus === 'to_review' ? <><Check size={13} />标记已自检</> : '设为待复习'}</button></div>
      </article>)}</div>}
      <div className="self-check-note">自检是你对自己的记录，不代表系统认证掌握。</div>
    </>}
  </div>;
}
