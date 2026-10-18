import { useCallback, useRef, useState } from 'react';
import { api } from '../api';
import { BoardSchema, type Board, type Card, type Citation } from '../domain';
import { useRevisionState } from '../hooks/useStudyState';
import { Alert, Button } from './ui';

type Props = {courseId:string;cards:Card[];disabled:boolean;onOpen:(card:Card)=>void;onSource:(c:Citation)=>void};
export default function Whiteboard({courseId,cards,disabled,onOpen,onSource}:Props) {
  const get = useCallback(()=>api.getBoard(courseId),[courseId]);
  const initial:Board={courseId,revision:0,nodes:[],edges:[],updatedAt:null};
  const board=useRevisionState(`zhiye:board:${courseId}`,initial,BoardSchema,get,api.saveBoard);
  const [chosen,setChosen]=useState('');
  const [source,setSource]=useState(''); const [target,setTarget]=useState(''); const [label,setLabel]=useState('');
  const [moving,setMoving]=useState<{id:string;x:number;y:number}|null>(null);
  const drag=useRef<{id:string;startX:number;startY:number;x:number;y:number;lastX:number;lastY:number}|null>(null);
  const locked=disabled||!board.ready||!!board.recovery||board.conflict;
  const nodes=board.state.nodes.map(n=>moving?.id===n.id?{...n,x:moving.x,y:moving.y}:n);
  const remove=(id:string)=>board.update(b=>({...b,nodes:b.nodes.filter(n=>n.id!==id),edges:b.edges.filter(e=>e.source!==id&&e.target!==id)}),true);
  const add=()=>{const card=cards.find(c=>c.id===chosen);if(!card)return;board.update(b=>({...b,nodes:[...b.nodes,{id:crypto.randomUUID(),cardId:card.id,x:24+(b.nodes.length%3)*270,y:24+Math.floor(b.nodes.length/3)*210}]}),true);};
  return <section className="whiteboard panel" aria-label="课程白板">
    <div className="board-heading"><h2>课程白板</h2><span role="status">{board.saveStatus==='saved'?'白板已保存':board.saveStatus==='error'?'白板草稿已保留': '白板待保存…'}</span></div>
    {board.loadError&&<Alert title="白板读取失败" action={<Button onClick={()=>void board.reload()}>重读白板</Button>}>{board.loadError}</Alert>}
    {board.saveError&&<Alert title="白板保存未成功" action={<Button onClick={board.conflict?()=>void board.reload():board.flush}>{board.conflict?'重读并选择版本':'重试白板保存'}</Button>}>{board.saveError}</Alert>}
    {board.recovery&&<Alert title="发现白板本机草稿" tone="warning" action={<><Button onClick={board.discardRecovery}>使用服务端白板</Button><Button onClick={board.restore}>用本机草稿替换并保存</Button></>}>重读已完成，请选择保留哪份白板布局。</Alert>}
    {board.draftWarning&&<Alert title="白板草稿存储不可用">保存成功前请勿离开当前课程。</Alert>}
    <div className="board-tools"><label>已保存卡片<select aria-label="选择上板卡片" value={chosen} onChange={e=>setChosen(e.target.value)}><option value="">选择一张卡片</option>{cards.filter(c=>!board.state.nodes.some(n=>n.cardId===c.id)).map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></label><Button disabled={locked||!chosen||board.state.nodes.some(n=>n.cardId===chosen)} onClick={add}>加入白板</Button></div>
    <div className="board-tools"><label>起点<select aria-label="连线起点" value={source} onChange={e=>setSource(e.target.value)}><option value="">选择节点</option>{nodes.map(n=><option key={n.id} value={n.id}>{cards.find(c=>c.id===n.cardId)?.title || '卡片不可用'}</option>)}</select></label><label>终点<select aria-label="连线终点" value={target} onChange={e=>setTarget(e.target.value)}><option value="">选择节点</option>{nodes.map(n=><option key={n.id} value={n.id}>{cards.find(c=>c.id===n.cardId)?.title || '卡片不可用'}</option>)}</select></label><input aria-label="连线说明" placeholder="关系（可选）" value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/><Button disabled={locked||!source||!target||source===target||!nodes.some(n=>n.id===source)||!nodes.some(n=>n.id===target)} onClick={()=>board.update(b=>({...b,edges:[...b.edges,{id:crypto.randomUUID(),source,target,label}]}),true)}>连接节点</Button></div>
    <p className="muted small">拖动卡片标题移动位置；键盘方向键移动 20 像素。移除节点只改变白板。</p>
    <div className="board-scroll"><div className="board-canvas" style={{width:Math.max(860,...nodes.map(n=>n.x+270)),height:Math.max(600,...nodes.map(n=>n.y+220))}}>
      <svg className="board-edges" width="100%" height="100%" aria-hidden="true">{board.state.edges.map(e=>{const a=nodes.find(n=>n.id===e.source),b=nodes.find(n=>n.id===e.target);return a&&b?<g key={e.id}><line x1={a.x+120} y1={a.y+70} x2={b.x+120} y2={b.y+70}/><text x={(a.x+b.x)/2+120} y={(a.y+b.y)/2+65}>{e.label}</text></g>:null;})}</svg>
      {!nodes.length&&<p className="board-empty">先保存课程卡片，再将它们加入白板。</p>}
      {nodes.map(n=>{const card=cards.find(c=>c.id===n.cardId);return <article className="board-node" key={n.id} data-node-id={n.id} style={{left:n.x,top:n.y}}>
        <button className="board-drag" aria-label={`移动 ${card?.title || '卡片'}`} disabled={locked} onKeyDown={e=>{const moves:Record<string,number[]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};const delta=moves[e.key];if(!delta)return;e.preventDefault();board.update(b=>({...b,nodes:b.nodes.map(v=>v.id===n.id?{...v,x:Math.max(0,v.x+delta[0]),y:Math.max(0,v.y+delta[1])}:v)}),true);}}
        onPointerDown={e=>{if(e.button!==0)return; e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:n.id,startX:e.clientX,startY:e.clientY,x:n.x,y:n.y,lastX:n.x,lastY:n.y};}}
        onPointerMove={e=>{const d=drag.current;if(!d||d.id!==n.id)return;d.lastX=Math.max(0,d.x+e.clientX-d.startX);d.lastY=Math.max(0,d.y+e.clientY-d.startY);setMoving({id:n.id,x:d.lastX,y:d.lastY});}}
        onPointerUp={()=>{const d=drag.current;if(!d)return;board.update(b=>({...b,nodes:b.nodes.map(v=>v.id===d.id?{...v,x:d.lastX,y:d.lastY}:v)}),true);drag.current=null;setMoving(null);}}
        onPointerCancel={()=>{drag.current=null;setMoving(null);}}>{card?.title || '卡片不可用'}</button>
        <p>{card?.body || '请重读学习状态。'}</p><div className="board-node-actions"><Button disabled={!card||disabled} onClick={()=>card&&onOpen(card)}>打开卡片</Button><Button disabled={locked} onClick={()=>remove(n.id)}>移除节点</Button></div>{card?.sourceRefs.map(c=><button className="text-button" key={c.id} onClick={()=>onSource(c)}>{c.title} · 第 {c.pageStart} 页</button>)}
      </article>;})}
    </div></div>
    {!!board.state.edges.length&&<ul className="board-edge-list">{board.state.edges.map(e=><li key={e.id}>{cards.find(c=>c.id===nodes.find(n=>n.id===e.source)?.cardId)?.title} → {cards.find(c=>c.id===nodes.find(n=>n.id===e.target)?.cardId)?.title}：{e.label||'关联'} <Button disabled={locked} onClick={()=>board.update(b=>({...b,edges:b.edges.filter(v=>v.id!==e.id)}),true)}>删除连线</Button></li>)}</ul>}
  </section>;
}
