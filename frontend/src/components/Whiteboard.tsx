import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { BoardSchema, type Board, type BoardPreview, type Card, type Citation } from '../domain';
import { useRevisionState } from '../hooks/useStudyState';
import { Alert, Button } from './ui';
import BoardViewport from './BoardViewport';
import './Whiteboard.css';

type Props = {courseId:string;cards:Card[];disabled:boolean;stateRevision:number;onApplied:()=>Promise<void>;onBusyChange:(busy:boolean)=>void;onOpen:(card:Card)=>void;onSource:(c:Citation)=>void};
export default function Whiteboard({courseId,cards,disabled,stateRevision,onApplied,onBusyChange,onOpen,onSource}:Props) {
  const get = useCallback(()=>api.getBoard(courseId),[courseId]);
  const initial:Board={courseId,revision:0,nodes:[],edges:[],updatedAt:null};
  const board=useRevisionState(`zhiye:board:${courseId}`,initial,BoardSchema,get,api.saveBoard);
  const fullscreenRoot=useRef<HTMLElement>(null);
  const fullscreenTrigger=useRef<HTMLDivElement>(null);
  const [fullscreen,setFullscreen]=useState(false);
  const [toolsExpanded,setToolsExpanded]=useState(true);
  const exitFullscreen=useCallback(async()=>{
    if(document.fullscreenElement===fullscreenRoot.current){
      try{await document.exitFullscreen();}catch{/* Keep the visible exit control available. */}
      if(document.fullscreenElement===fullscreenRoot.current)return;
    }
    setFullscreen(false);
  },[]);
  const openSource=async(c:Citation)=>{await exitFullscreen();onSource(c);};
  const openCard=async(card:Card)=>{await exitFullscreen();onOpen(card);};
  const enterFullscreen=async()=>{
    setFullscreen(true);setToolsExpanded(false);
    try{await fullscreenRoot.current?.requestFullscreen?.();}catch{/* Fixed viewport fallback also works on mobile browsers. */}
  };
  useEffect(()=>{
    let wasNative=false;
    const changed=()=>{
      if(document.fullscreenElement===fullscreenRoot.current){wasNative=true;setFullscreen(true);}
      else if(wasNative){wasNative=false;setFullscreen(false);}
    };
    document.addEventListener('fullscreenchange',changed);
    return ()=>document.removeEventListener('fullscreenchange',changed);
  },[]);
  useEffect(()=>{
    if(!fullscreen)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!fullscreenRoot.current?.querySelector('dialog[open]')){
        event.preventDefault();void exitFullscreen();
      }
    };
    document.addEventListener('keydown',escape);
    return ()=>{
      document.body.style.overflow=previousOverflow;
      document.removeEventListener('keydown',escape);
      fullscreenTrigger.current?.querySelector('button')?.focus();
    };
  },[fullscreen,exitFullscreen]);
  const [chosen,setChosen]=useState('');
  const [source,setSource]=useState(''); const [target,setTarget]=useState(''); const [label,setLabel]=useState('');
  const [linkStart,setLinkStart]=useState('');
  const [edgeEdit,setEdgeEdit]=useState<{id:string;label:string;reverse:boolean}|null>(null);
  const edgeDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if(!edgeEdit||!edgeDialog.current)return;
    const dialog=edgeDialog.current,previous=document.activeElement;
    dialog.showModal();
    return ()=>{dialog.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
  },[edgeEdit?.id]);
  const [instruction,setInstruction]=useState('');
  const [preview,setPreview]=useState<BoardPreview|null>(null);
  const [generating,setGenerating]=useState(false),[applying,setApplying]=useState(false);
  const [aiError,setAiError]=useState(''),[notice,setNotice]=useState('');
  const [aiConflict,setAiConflict]=useState(false);
  const generationRequest=useRef<{instruction:string;id:string}|null>(null);
  const [moving,setMoving]=useState<{id:string;x:number;y:number}|null>(null);
  const [scale,setScale]=useState(1);
  const drag=useRef<{id:string;startX:number;startY:number;x:number;y:number;lastX:number;lastY:number}|null>(null);
  const locked=disabled||applying||!board.ready||!!board.recovery||board.conflict;
  const aiLocked=locked||board.saveStatus!=='saved';
  const nodes=board.state.nodes.map(n=>moving?.id===n.id?{...n,x:moving.x,y:moving.y}:n);
  const nodeTitle=(id:string)=>cards.find(c=>c.id===nodes.find(n=>n.id===id)?.cardId)?.title||'卡片';
  const editEdge=(edge:Board['edges'][number])=>{if(!locked)setEdgeEdit({id:edge.id,label:edge.label,reverse:false});};
  const selectedEdge=board.state.edges.find(e=>e.id===edgeEdit?.id);
  const duplicateReverse=!!(edgeEdit?.reverse&&selectedEdge&&board.state.edges.some(e=>e.id!==selectedEdge.id&&e.source===selectedEdge.target&&e.target===selectedEdge.source));
  const saveEdge=()=>{
    if(locked||!edgeEdit||!selectedEdge||duplicateReverse)return;
    board.update(b=>({...b,edges:b.edges.map(e=>e.id===edgeEdit.id?{...e,label:edgeEdit.label.trim(),source:edgeEdit.reverse?e.target:e.source,target:edgeEdit.reverse?e.source:e.target}:e)}),true);
    setEdgeEdit(null);
  };
  const remove=(id:string)=>board.update(b=>({...b,nodes:b.nodes.filter(n=>n.id!==id),edges:b.edges.filter(e=>e.source!==id&&e.target!==id)}),true);
  const add=()=>{const card=cards.find(c=>c.id===chosen);if(!card)return;board.update(b=>({...b,nodes:[...b.nodes,{id:crypto.randomUUID(),cardId:card.id,x:24+(b.nodes.length%3)*270,y:24+Math.floor(b.nodes.length/3)*210}]}),true);};
  const connect=(from:string,to:string)=>{
    if(locked||from===to||!nodes.some(n=>n.id===from)||!nodes.some(n=>n.id===to))return;
    if(board.state.edges.some(e=>e.source===from&&e.target===to)){setNotice('这两个节点已有连线。');setLinkStart('');return;}
    board.update(b=>({...b,edges:[...b.edges,{id:crypto.randomUUID(),source:from,target:to,label:label.trim()}]}),true);
    setLinkStart('');setNotice('连线已添加。');
  };
  const generate=async()=>{
    if(aiLocked||generating)return;
    setGenerating(true);setAiError('');setNotice('');
    if(generationRequest.current?.instruction!==instruction)generationRequest.current={instruction,id:crypto.randomUUID()};
    try{setPreview(await api.generateBoard(courseId,instruction,generationRequest.current.id));}
    catch(error){setAiError(error instanceof Error?error.message:'白板生成失败，请重试。');}
    finally{setGenerating(false);}
  };
  const apply=async()=>{
    if(aiLocked||!preview)return;
    setApplying(true);onBusyChange(true);setAiError('');setAiConflict(false);
    try{
      await api.applyBoard(courseId,preview.previewId,stateRevision,board.state.revision);
      setPreview(null);generationRequest.current=null;
      await onApplied();await board.reload();setNotice('AI 卡片与连线已加入白板。');
    }catch(error){setAiError(error instanceof Error?error.message:'应用失败，预览已保留，请重试。');setAiConflict(error instanceof ApiError&&error.status===409);}
    finally{setApplying(false);onBusyChange(false);}
  };
  return <section ref={fullscreenRoot} className={`whiteboard panel ${fullscreen?'board-is-fullscreen':''}`} aria-label="课程白板">
    <dialog ref={edgeDialog} className="dialog edge-editor" aria-label="编辑卡片关系" onCancel={e=>{e.preventDefault();setEdgeEdit(null);}}>
      <h2>编辑卡片关系</h2>
      {edgeEdit&&selectedEdge&&<>
        <p>{nodeTitle(edgeEdit.reverse?selectedEdge.target:selectedEdge.source)} → {nodeTitle(edgeEdit.reverse?selectedEdge.source:selectedEdge.target)}</p>
        <label>关系类型<select aria-label="关系类型" disabled={locked} value={['关联','前置知识','包含','导致','对比','应用','举例'].includes(edgeEdit.label)?edgeEdit.label:'自定义'} onChange={e=>setEdgeEdit({...edgeEdit,label:e.target.value==='自定义'?'':e.target.value})}>{['关联','前置知识','包含','导致','对比','应用','举例','自定义'].map(value=><option key={value}>{value}</option>)}</select></label>
        <label>关系说明<input aria-label="编辑关系说明" disabled={locked} maxLength={100} value={edgeEdit.label} onChange={e=>setEdgeEdit({...edgeEdit,label:e.target.value})}/></label>
        <label className="edge-reverse"><input type="checkbox" checked={edgeEdit.reverse} disabled={locked} onChange={e=>setEdgeEdit({...edgeEdit,reverse:e.target.checked})}/>反转连线方向</label>
        {duplicateReverse&&<p role="alert">反向连线已存在，请保留当前方向或先删除重复关系。</p>}
        <div className="dialog-actions"><Button variant="danger" disabled={locked} onClick={()=>{board.update(b=>({...b,edges:b.edges.filter(e=>e.id!==edgeEdit.id)}),true);setEdgeEdit(null);}}>删除这条关系</Button><Button onClick={()=>setEdgeEdit(null)}>取消</Button><Button variant="primary" disabled={locked||duplicateReverse} onClick={saveEdge}>保存关系</Button></div>
      </>}
    </dialog>
    <div className="board-heading"><h2>课程白板</h2><span role="status">{board.saveStatus==='saved'?'白板已保存':board.saveStatus==='error'?'白板草稿已保留': '白板待保存…'}</span><div className="board-view-actions" ref={fullscreenTrigger}><Button aria-pressed={fullscreen} onClick={()=>void(fullscreen?exitFullscreen():enterFullscreen())}>{fullscreen?'退出全屏':'全屏白板'}</Button><Button aria-expanded={toolsExpanded} aria-controls={`board-tools-${courseId}`} onClick={()=>setToolsExpanded(value=>!value)}>{toolsExpanded?'收起工具':'展开工具'}</Button></div></div>
    {board.loadError&&<Alert title="白板读取失败" action={<Button onClick={()=>void board.reload()}>重读白板</Button>}>{board.loadError}</Alert>}
    {board.saveError&&<Alert title="白板保存未成功" action={<Button onClick={board.conflict?()=>void board.reload():board.flush}>{board.conflict?'重读并选择版本':'重试白板保存'}</Button>}>{board.saveError}</Alert>}
    {board.recovery&&<Alert title="发现白板本机草稿" tone="warning" action={<><Button onClick={board.discardRecovery}>使用服务端白板</Button><Button onClick={board.restore}>用本机草稿替换并保存</Button></>}>重读已完成，请选择保留哪份白板布局。</Alert>}
    {board.draftWarning&&<Alert title="白板草稿存储不可用">保存成功前请勿离开当前课程。</Alert>}
    <div id={`board-tools-${courseId}`} className="board-tool-panel" hidden={!toolsExpanded}>
    <div className="board-ai-tools">
      <label htmlFor={`board-ai-${courseId}`}>让 AI 整理课程知识</label>
      <textarea id={`board-ai-${courseId}`} aria-label="AI 白板要求" placeholder="例如：梳理核心概念，连接前置知识与应用" value={instruction} maxLength={1000} disabled={generating||applying} onChange={e=>{setInstruction(e.target.value);generationRequest.current=null;}}/>
      <Button variant="primary" disabled={aiLocked} loading={generating} onClick={()=>void generate()}>AI 生成白板</Button>
      <p className="muted small">根据本课程已导入材料，生成带出处的卡片和关系；确认后追加到当前白板。</p>
    </div>
    {aiError&&<Alert title="AI 白板暂未完成" action={aiConflict&&<Button disabled={locked} onClick={async()=>{onBusyChange(true);try{await onApplied();await board.reload();setAiConflict(false);setAiError('');}finally{onBusyChange(false);}}}>刷新版本后重试</Button>}>{aiError}</Alert>}
    {preview&&<section className="board-ai-preview" aria-label="AI 白板预览">
      <h3>生成预览 · {preview.cards.length} 张卡片 · {preview.edges.length} 条连线</h3>
      <div className="board-preview-cards">{preview.cards.map(c=><article key={c.id}><h4>{c.title}</h4><p>{c.body}</p>{c.sourceRefs.map(ref=><button key={ref.id} className="text-button" onClick={()=>void openSource(ref)}>{ref.title} · 第 {ref.pageStart} 页</button>)}</article>)}</div>
      <ul>{preview.edges.map(e=>{const title=(id:string)=>preview.cards.find(c=>c.id===preview.nodes.find(n=>n.id===id)?.cardId)?.title;return <li key={e.id}>{title(e.source)} → {title(e.target)}：{e.label||'关联'}</li>;})}</ul>
      {preview.limitations.map((text,i)=><p className="muted small" key={i}>{text}</p>)}
      <div className="board-tools"><Button variant="primary" disabled={aiLocked||generating} loading={applying} onClick={()=>void apply()}>创建卡片并加入白板</Button><Button disabled={applying||generating} onClick={()=>{setPreview(null);generationRequest.current=null;}}>放弃预览</Button></div>
    </section>}
    {notice&&<p role="status">{notice}</p>}
    <div className="board-tools"><label>已保存卡片<select aria-label="选择上板卡片" value={chosen} onChange={e=>setChosen(e.target.value)}><option value="">选择一张卡片</option>{cards.filter(c=>!board.state.nodes.some(n=>n.cardId===c.id)).map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></label><Button disabled={locked||!chosen||board.state.nodes.some(n=>n.cardId===chosen)} onClick={add}>加入白板</Button></div>
    <div className="board-quick-link"><p>点击节点的“从这里连线”，再点击另一节点的“连接到这里”。</p><input aria-label="快捷连线说明" placeholder="关系说明（可选）" value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/>{linkStart&&<div role="status">已选起点：{cards.find(c=>c.id===nodes.find(n=>n.id===linkStart)?.cardId)?.title}<Button onClick={()=>setLinkStart('')}>取消连线</Button></div>}</div>
    <div className="board-tools board-advanced-link"><label>起点<select aria-label="连线起点" value={source} onChange={e=>setSource(e.target.value)}><option value="">选择节点</option>{nodes.map(n=><option key={n.id} value={n.id}>{cards.find(c=>c.id===n.cardId)?.title || '卡片不可用'}</option>)}</select></label><label>终点<select aria-label="连线终点" value={target} onChange={e=>setTarget(e.target.value)}><option value="">选择节点</option>{nodes.map(n=><option key={n.id} value={n.id}>{cards.find(c=>c.id===n.cardId)?.title || '卡片不可用'}</option>)}</select></label><input aria-label="连线说明" placeholder="关系（可选）" value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/><Button disabled={locked||!source||!target||source===target||!nodes.some(n=>n.id===source)||!nodes.some(n=>n.id===target)} onClick={()=>connect(source,target)}>连接节点</Button></div>
    <p className="muted small">拖动卡片标题移动位置；键盘方向键移动 20 像素。移除节点只改变白板。</p>
    </div>
    <BoardViewport nodes={nodes} scale={scale} onScaleChange={setScale}>
      <svg className="board-edges" width="100%" height="100%" aria-label="知识关系连线">{board.state.edges.map(e=>{const a=nodes.find(n=>n.id===e.source),b=nodes.find(n=>n.id===e.target);return a&&b?<g key={e.id} className="board-edge-interactive" role="button" tabIndex={locked?-1:0} aria-disabled={locked} aria-label={`编辑关系：${nodeTitle(e.source)} → ${nodeTitle(e.target)}，${e.label||'关联'}`} onClick={()=>editEdge(e)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();editEdge(e);}}}><line className="board-edge-hit" x1={a.x+120} y1={a.y+70} x2={b.x+120} y2={b.y+70}/><line x1={a.x+120} y1={a.y+70} x2={b.x+120} y2={b.y+70}/><text textAnchor="middle" x={(a.x+b.x)/2+120} y={(a.y+b.y)/2+65}>{e.label||'关联'}</text></g>:null;})}</svg>
      {!nodes.length&&<p className="board-empty">先保存课程卡片，再将它们加入白板。</p>}
      {nodes.map(n=>{const card=cards.find(c=>c.id===n.cardId);return <article className={`board-node ${linkStart===n.id?'board-node-selected':''}`} key={n.id} data-node-id={n.id} style={{left:n.x,top:n.y}}>
        <button className="board-drag" aria-label={`移动 ${card?.title || '卡片'}`} disabled={locked} onKeyDown={e=>{const moves:Record<string,number[]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};const delta=moves[e.key];if(!delta)return;e.preventDefault();board.update(b=>({...b,nodes:b.nodes.map(v=>v.id===n.id?{...v,x:Math.max(0,v.x+delta[0]),y:Math.max(0,v.y+delta[1])}:v)}),true);}}
        onPointerDown={e=>{if(e.button!==0)return; e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:n.id,startX:e.clientX,startY:e.clientY,x:n.x,y:n.y,lastX:n.x,lastY:n.y};}}
        onPointerMove={e=>{const d=drag.current;if(!d||d.id!==n.id)return;d.lastX=Math.max(0,d.x+(e.clientX-d.startX)/scale);d.lastY=Math.max(0,d.y+(e.clientY-d.startY)/scale);setMoving({id:n.id,x:d.lastX,y:d.lastY});}}
        onPointerUp={()=>{const d=drag.current;if(!d)return;board.update(b=>({...b,nodes:b.nodes.map(v=>v.id===d.id?{...v,x:d.lastX,y:d.lastY}:v)}),true);drag.current=null;setMoving(null);}}
        onPointerCancel={()=>{drag.current=null;setMoving(null);}}>{card?.title || '卡片不可用'}</button>
        <p>{card?.body || '请重读学习状态。'}</p><div className="board-node-actions"><Button aria-pressed={linkStart===n.id} disabled={locked} onClick={()=>{if(linkStart&&linkStart!==n.id)connect(linkStart,n.id);else setLinkStart(linkStart===n.id?'':n.id);}}>{linkStart===n.id?'取消起点':linkStart?'连接到这里':'从这里连线'}</Button><Button disabled={!card||disabled} onClick={()=>card&&void openCard(card)}>打开卡片</Button><Button disabled={locked} onClick={()=>remove(n.id)}>移除节点</Button></div>{card?.sourceRefs.map(c=><button className="text-button" key={c.id} onClick={()=>void openSource(c)}>{c.title} · 第 {c.pageStart} 页</button>)}
      </article>;})}
    </BoardViewport>
    {!!board.state.edges.length&&<ul className="board-edge-list">{board.state.edges.map(e=><li key={e.id}><Button variant="quiet" disabled={locked} onClick={()=>editEdge(e)}>{nodeTitle(e.source)} → {nodeTitle(e.target)}：{e.label||'关联'}</Button> <Button disabled={locked} onClick={()=>board.update(b=>({...b,edges:b.edges.filter(v=>v.id!==e.id)}),true)}>删除连线</Button></li>)}</ul>}
  </section>;
}
