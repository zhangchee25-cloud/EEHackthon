import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui';
import './BoardViewport.css';

type Props = {nodes:{id:string;x:number;y:number}[];scale:number;onScaleChange:(scale:number)=>void;children:ReactNode};
const clamp=(value:number)=>Math.max(.02,Math.min(2,value));

export default function BoardViewport({nodes,scale,onScaleChange,children}:Props) {
  const viewport=useRef<HTMLDivElement>(null);
  const canvas=useRef<HTMLDivElement>(null);
  const pendingScroll=useRef<{left:number;top:number}|null>(null);
  const [fitMode,setFitMode]=useState(false);
  const [size,setSize]=useState({width:0,height:0});
  const [extent,setExtent]=useState({left:0,top:0,right:860,bottom:600});
  useLayoutEffect(()=>{
    const element=viewport.current;if(!element)return;
    const update=()=>setSize(previous=>previous.width===element.clientWidth&&previous.height===element.clientHeight?previous:{width:element.clientWidth,height:element.clientHeight});
    update();const observer=new ResizeObserver(update);observer.observe(element);return ()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    const elements=Array.from(canvas.current?.querySelectorAll<HTMLElement>('.board-node')||[]);
    if(!elements.length){setExtent(previous=>previous.right===860&&previous.bottom===600&&previous.left===0&&previous.top===0?previous:{left:0,top:0,right:860,bottom:600});return;}
    const measure=()=>{
      const next={left:Math.min(...elements.map(e=>e.offsetLeft)),top:Math.min(...elements.map(e=>e.offsetTop)),right:Math.max(...elements.map(e=>e.offsetLeft+e.offsetWidth)),bottom:Math.max(...elements.map(e=>e.offsetTop+e.offsetHeight))};
      setExtent(previous=>Object.keys(next).every(key=>next[key as keyof typeof next]===previous[key as keyof typeof next])?previous:next);
    };
    measure();const observer=new ResizeObserver(measure);elements.forEach(element=>observer.observe(element));return ()=>observer.disconnect();
  },[nodes]);
  const fit=useCallback(()=>{
    if(!size.width||!size.height)return;
    const next=clamp(Math.min(1,(size.width-32)/(extent.right-extent.left+48),(size.height-32)/(extent.bottom-extent.top+48)));
    pendingScroll.current={left:Math.max(0,(extent.left-24)*next),top:Math.max(0,(extent.top-24)*next)};
    onScaleChange(next);
    if(viewport.current){viewport.current.scrollLeft=pendingScroll.current.left;viewport.current.scrollTop=pendingScroll.current.top;}
  },[size,extent,onScaleChange]);
  useEffect(()=>{if(fitMode)fit();},[fitMode,fit]);
  useLayoutEffect(()=>{
    if(pendingScroll.current&&viewport.current){viewport.current.scrollLeft=pendingScroll.current.left;viewport.current.scrollTop=pendingScroll.current.top;pendingScroll.current=null;}
  },[scale,extent]);
  const zoom=(next:number)=>{
    const element=viewport.current;next=clamp(next);setFitMode(false);
    if(element)pendingScroll.current={left:(element.scrollLeft+element.clientWidth/2)*next/scale-element.clientWidth/2,top:(element.scrollTop+element.clientHeight/2)*next/scale-element.clientHeight/2};
    onScaleChange(next);
  };
  const width=Math.max(860,extent.right+24),height=Math.max(600,extent.bottom+24);
  return <div className="board-viewport">
    <div className="board-zoom-tools" role="group" aria-label="白板视图">
      <Button aria-label="缩小白板" disabled={scale<=.02} onClick={()=>zoom(scale/1.25)}>−</Button>
      <output aria-label="白板缩放比例">{Math.round(scale*100)}%</output>
      <Button aria-label="放大白板" disabled={scale>=2} onClick={()=>zoom(scale*1.25)}>＋</Button>
      <Button aria-pressed={fitMode} onClick={()=>{setFitMode(true);fit();}}>适合全部</Button>
      <Button aria-label="重置为 100%" onClick={()=>zoom(1)}>100%</Button>
    </div>
    <div className="board-scroll" ref={viewport} aria-label="白板画布视口" tabIndex={0}>
      <div className="board-scaled-space" style={{width:width*scale,height:height*scale}}>
        <div className="board-canvas" ref={canvas} onPointerDownCapture={event=>{if(event.target instanceof Element&&event.target.closest('.board-drag'))setFitMode(false);}} style={{width,height,transform:`scale(${scale})`,transformOrigin:'top left'}}>{children}</div>
      </div>
    </div>
  </div>;
}
