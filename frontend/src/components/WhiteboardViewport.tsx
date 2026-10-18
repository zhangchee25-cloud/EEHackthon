import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Minus, Plus, Scan } from 'lucide-react';
import { Button } from './ui';
import './WhiteboardViewport.css';

export type WhiteboardViewportHandle = { exitFullscreen: () => Promise<void> };
type Props = { children: ReactNode; width: number; height: number; onScaleChange?: (scale: number) => void; toolbar?: ReactNode };
type Bounds = { left: number; top: number; right: number; bottom: number };
const clamp = (value: number) => Math.max(.02, Math.min(2, value));

const WhiteboardViewport = forwardRef<WhiteboardViewportHandle, Props>(function WhiteboardViewport({ children, width, height, onScaleChange, toolbar }, ref) {
  const mount = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  // Keep one portal host so moving the viewport never remounts its cards or controls.
  const [host] = useState(() => document.createElement('div'));
  const [fullscreen, setFullscreen] = useState(false);
  const active = useRef(false);
  const native = useRef(false);
  const previousOverflow = useRef('');
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [bounds, setBounds] = useState<Bounds>({ left: 0, top: 0, right: width, bottom: height });
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    host.className = 'whiteboard-viewport-host';
    mount.current?.appendChild(host);
    const element = root.current;
    return () => {
      if (active.current) document.body.style.overflow = previousOverflow.current;
      active.current = false;
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
      host.remove();
    };
  }, [host]);

  const restore = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    native.current = false;
    document.body.style.overflow = previousOverflow.current;
    mount.current?.appendChild(host);
    setFullscreen(false);
    fullscreenButton.current?.focus({ preventScroll: true });
  }, [host]);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement === root.current) {
      try { await document.exitFullscreen(); } catch { /* Keep the in-page exit available. */ }
    }
    restore();
  }, [restore]);
  useImperativeHandle(ref, () => ({ exitFullscreen }), [exitFullscreen]);

  const enterFullscreen = () => {
    if (active.current || !root.current) return;
    active.current = true;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // A fixed element inside the study panel can still be clipped by its ancestors.
    // Moving the existing portal to body also makes the fallback fill the viewport.
    document.body.appendChild(host);
    setFullscreen(true);
    setFitMode(true);
    fullscreenButton.current?.focus({ preventScroll: true });
    if (root.current.requestFullscreen) {
      try {
        void root.current.requestFullscreen().then(() => {
          if (!active.current && document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {});
        }).catch(() => {});
      } catch { /* Use the viewport fallback. */ }
    }
  };

  useEffect(() => {
    const changed = () => {
      if (document.fullscreenElement === root.current) native.current = true;
      else if (native.current) restore();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!active.current) return;
      // A nested confirmation dialog owns Escape until it is dismissed.
      if (root.current?.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        void exitFullscreen();
      } else if (event.key === 'Tab') {
        const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(element => element.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      document.removeEventListener('keydown', keyboard);
    };
  }, [exitFullscreen, restore]);

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const measure = () => setSize(previous => previous.width === element.clientWidth && previous.height === element.clientHeight ? previous : { width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const elements = Array.from(canvas.current?.querySelectorAll<HTMLElement>('.board-node') || []);
    const measure = () => {
      const next = elements.length ? {
        left: Math.min(...elements.map(element => element.offsetLeft)),
        top: Math.min(...elements.map(element => element.offsetTop)),
        right: Math.max(...elements.map(element => element.offsetLeft + element.offsetWidth)),
        bottom: Math.max(...elements.map(element => element.offsetTop + element.offsetHeight)),
      } : { left: 0, top: 0, right: width, bottom: height };
      setBounds(previous => previous.left === next.left && previous.top === next.top && previous.right === next.right && previous.bottom === next.bottom ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [children, width, height]);

  const fit = useCallback(() => {
    if (!size.width || !size.height) return;
    const next = clamp(Math.min(1, (size.width - 32) / (bounds.right - bounds.left + 48), (size.height - 32) / (bounds.bottom - bounds.top + 48)));
    pendingScroll.current = { left: Math.max(0, (bounds.left - 24) * next), top: Math.max(0, (bounds.top - 24) * next) };
    setScale(next);
    if (scroll.current) {
      scroll.current.scrollLeft = pendingScroll.current.left;
      scroll.current.scrollTop = pendingScroll.current.top;
    }
  }, [bounds, size]);
  useLayoutEffect(() => { if (fitMode) fit(); }, [fit, fitMode]);
  useLayoutEffect(() => { onScaleChange?.(scale); }, [scale, onScaleChange]);
  useLayoutEffect(() => {
    if (pendingScroll.current && scroll.current) {
      scroll.current.scrollLeft = pendingScroll.current.left;
      scroll.current.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [scale, bounds, size]);

  const zoom = (value: number) => {
    const next = clamp(value), element = scroll.current;
    setFitMode(false);
    if (element) pendingScroll.current = { left: (element.scrollLeft + element.clientWidth / 2) * next / scale - element.clientWidth / 2, top: (element.scrollTop + element.clientHeight / 2) * next / scale - element.clientHeight / 2 };
    setScale(next);
  };
  // Fill the visible viewport even when the graph is small or zoomed out. Keep
  // these dimensions separate from graph bounds so fitting cannot feed back.
  const canvasWidth = Math.max(width, bounds.right + 24, size.width / scale);
  const canvasHeight = Math.max(height, bounds.bottom + 24, size.height / scale);

  return <div className="whiteboard-viewport-mount" ref={mount}>{createPortal(
    <div ref={root} className={`whiteboard-viewport${fullscreen ? ' is-fullscreen' : ''}`} role={fullscreen ? 'dialog' : undefined} aria-modal={fullscreen ? true : undefined} aria-label={fullscreen ? '全屏课程白板' : '白板视图'}>
      <div className="whiteboard-canvas-toolbar">
        <div className="whiteboard-view-tools" role="group" aria-label="白板缩放">
          <Button aria-label="缩小白板" title="缩小白板" disabled={scale <= .02} onClick={() => zoom(scale / 1.25)}><Minus size={14} aria-hidden="true" /></Button>
          <output aria-label="白板缩放比例">{Math.round(scale * 100)}%</output>
          <Button aria-label="放大白板" title="放大白板" disabled={scale >= 2} onClick={() => zoom(scale * 1.25)}><Plus size={14} aria-hidden="true" /></Button>
          <Button aria-pressed={fitMode} onClick={() => { setFitMode(true); fit(); }}><Scan size={14} aria-hidden="true" />适合全部</Button>
          <Button aria-label="重置为 100%" onClick={() => zoom(1)}>100%</Button>
        </div>
        <Button ref={fullscreenButton} className="whiteboard-fullscreen-button" variant="primary" onClick={() => fullscreen ? void exitFullscreen() : enterFullscreen()}>
          {fullscreen ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}{fullscreen ? '退出全屏' : '全屏白板'}
        </Button>
        {toolbar && <div className="whiteboard-selection-tools">{toolbar}</div>}
      </div>
      <div ref={scroll} className="board-scroll" aria-label="白板画布视口" tabIndex={0}>
        <div className="whiteboard-scaled-space" style={{ width: canvasWidth * scale, height: canvasHeight * scale }}>
          <div ref={canvas} className="board-canvas" style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            onPointerDownCapture={event => { if (event.target instanceof Element && event.target.closest('.board-drag')) setFitMode(false); }}
            onKeyDownCapture={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && event.target instanceof Element && event.target.closest('.board-drag')) setFitMode(false); }}>{children}</div>
        </div>
      </div>
    </div>, host
  )}</div>;
});

export default WhiteboardViewport;
