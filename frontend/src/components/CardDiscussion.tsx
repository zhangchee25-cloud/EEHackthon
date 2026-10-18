import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api, validateAnswer } from '../api';
import { AnswerSchema, type Citation, type Material } from '../domain';
import { readDraft, storeDraft } from '../hooks/useStudyState';
import type { EditorDraft } from './CardsPanel';
import { Alert, Button, Textarea } from './ui';
import SourceList from './SourceList';

const DiscussionSchema = z.object({draft:z.string(), turns:z.array(z.object({question:z.string(),answer:AnswerSchema}))});
type Discussion = z.infer<typeof DiscussionSchema>;

export default function CardDiscussion({card,materials,onSource,disabled}:{card:EditorDraft;materials:Material[];onSource:(source:Citation)=>void;disabled:boolean}) {
  const key=`zhiye:card-discussion:v1:${card.courseId || 'standalone'}:${card.id}`;
  const [discussion,setDiscussion]=useState<Discussion>(()=>{const saved=DiscussionSchema.safeParse(readDraft(key));return saved.success?saved.data:{draft:'',turns:[]};});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [storageError,setStorageError]=useState(false);
  const alive=useRef(true);
  const inFlight=useRef(false);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  useEffect(()=>{setStorageError(!storeDraft(key,discussion));},[key,discussion]);
  const ready=materials.filter(m=>m.status==='ready');
  const referenced=ready.filter(m=>card.sourceRefs.some(c=>c.materialId===m.materialId&&c.versionId===m.versionId));
  const scope=referenced.length?referenced:ready;
  const send=async()=>{
    if(inFlight.current||disabled||!discussion.draft.trim()||!scope.length)return;
    inFlight.current=true;setBusy(true);setError('');
    const question=discussion.draft.trim();
    // Keep the latest question intact within the existing 4,000-character API limit.
    const history=discussion.turns.slice(-3).map(t=>`用户：${t.question.slice(0,200)}\nAI：${t.answer.answerSegments.map(s=>s.text).join('\n').slice(0,300)}`).join('\n').slice(-1000);
    const prompt=`围绕下面的学习卡片继续讨论，结合材料核对，不要把卡片或历史回答当作已证实的事实。回答本轮问题；缺少依据时明确说明。\n卡片标题：${card.title.slice(0,120)}\n卡片内容（最多前1500字）：${card.body.slice(0,1500)}\n最近讨论摘要：${history}\n本轮问题：${question}`;
    try {
      const answer=card.courseId?await api.askCourse(card.courseId,prompt,scope,crypto.randomUUID()):validateAnswer(await api.ask(scope[0].materialId,scope[0].versionId,prompt),[scope[0]]);
      if(alive.current)setDiscussion(current=>({draft:'',turns:[...current.turns,{question,answer}].slice(-30)}));
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'讨论失败，请重试。');}
    finally{inFlight.current=false;if(alive.current)setBusy(false);}
  };
  return <section aria-label="卡片 AI 讨论" className="card-discussion">
    <h3>围绕这张卡片继续讨论</h3>
    <p className="muted small">AI 会参考当前卡片、最近讨论和相关课程材料。最近 30 轮保存在本机浏览器中；讨论不会自动修改卡片。</p>
    {discussion.turns.map((turn,index)=><article key={index} className="study-card"><strong>你：{turn.question}</strong><div aria-label="AI 讨论回答">{turn.answer.answerSegments.map(segment=><p key={segment.id} style={{whiteSpace:'pre-wrap'}}>{segment.text}</p>)}{turn.answer.limitations.map((text,i)=><p className="muted small" key={i}>{text}</p>)}</div><SourceList refs={turn.answer.citations} onOpen={onSource}/></article>)}
    {!scope.length&&<p role="status">当前没有可用的材料，请先导入课程材料，再继续讨论。</p>}
    {storageError&&<Alert title="讨论记录未能保存到浏览器">请保留当前页面，避免丢失讨论。</Alert>}
    {error&&<Alert title="讨论暂未完成">{error} 输入已保留，可再次发送。</Alert>}
    <label className="field-label" htmlFor="card-discussion-question">继续提问</label>
    <Textarea id="card-discussion-question" maxLength={800} disabled={busy||disabled} value={discussion.draft} onChange={event=>setDiscussion(current=>({...current,draft:event.target.value}))} placeholder="例如：能用一个例子解释这张卡片吗？"/>
    <Button variant="primary" disabled={busy||disabled||!scope.length||!discussion.draft.trim()} onClick={()=>void send()}>{busy?'AI 正在讨论…':'发送讨论'}</Button>
  </section>;
}
