import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, LoaderCircle, Minus, Plus, RotateCw, Sparkles } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../api';
import type { Position } from '../domain';
GlobalWorkerOptions.workerSrc = workerUrl;

type Props = { position: Position | null; title: string; onPage: (page: number) => void; onLoaded: (id: string, count: number, title: string) => void; onAsk: () => void; askDisabled: boolean };
export default function PdfReader({ position, title, onPage, onLoaded, onAsk, askDisabled }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [retry, setRetry] = useState(0);
  const [width, setWidth] = useState(600);
  const host = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onLoaded, onPage }); callbacks.current = { onLoaded, onPage };
  const id = position?.materialId;
  const page = position?.page || 1;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width - 48)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPdf(null); setError('');
    if (!id) return;
    let stopped = false;
    setLoading(true);
    const task = getDocument({ url: api.fileUrl(id).split('#')[0], cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/' });
    void task.promise.then(async doc => {
      if (stopped) return;
      setPdf(doc); setLoading(false);
      const metadata = await doc.getMetadata().catch(() => null);
      if (!stopped) callbacks.current.onLoaded(id, doc.numPages, (metadata as { contentDispositionFilename?: string } | null)?.contentDispositionFilename || (metadata?.info as { Title?: string })?.Title || '');
    }).catch(e => { if (!stopped) { setError(`无法打开原 PDF：${e instanceof Error ? e.message : '文件读取失败'}`); setLoading(false); } });
    return () => { stopped = true; void task.destroy(); };
  }, [id, retry]);
  useEffect(() => {
    if (!pdf || !canvasHost.current) return;
    let stopped = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    const container = canvasHost.current;
    setRendering(true); setError('');
    void (async () => {
      if (page > pdf.numPages) { callbacks.current.onPage(pdf.numPages); return; }
      const pdfPage = await pdf.getPage(page);
      if (stopped) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: Math.min(width / natural.width, 1.6) * zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', `原 PDF 文件第 ${page} 页`);
      canvas.setAttribute('role', 'img');
      canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      render = pdfPage.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (!stopped) container.replaceChildren(canvas);
    })().catch(e => { if (!stopped && e?.name !== 'RenderingCancelledException') setError('这一页暂时无法显示，请重试或打开原 PDF。'); })
      .finally(() => { if (!stopped) setRendering(false); });
    return () => { stopped = true; render?.cancel(); container.replaceChildren(); };
  }, [pdf, page, width, zoom]);
  return <section className="reader panel" aria-label="PDF 阅读器">
    <div className="reader-top"><div className="reader-file"><FileText size={17} /><span>{title || '课程材料'}</span></div>
      <div className="reader-top-actions"><button className="ask-ai-button" disabled={askDisabled} onClick={onAsk}><Sparkles size={13} />Ask AI</button>{id && <a className="icon-button" href={api.fileUrl(id, page)} target="_blank" rel="noreferrer" title={`打开原 PDF 第 ${page} 页`} aria-label={`打开原 PDF 第 ${page} 页`}><ExternalLink size={16} /></a>}</div>
    </div>
    <div className={`paper-area ${!id ? 'empty-paper' : ''}`} ref={host}>
      {!id ? <div className="reader-empty"><div className="empty-book"><FileText size={40} strokeWidth={1.2} /></div><span className="eyebrow">COURSE MATERIAL</span><h2>从一份课程材料开始</h2><p>将 PDF 拖到左侧，或点击添加材料。<br />阅读原文，与 AI 对话，再留下你的理解。</p><div className="reading-steps"><span>01 读材料</span><i /><span>02 问难点</span><i /><span>03 留下理解</span></div></div> : <>
        {(loading || rendering) && <div className="pdf-loading" role="status"><LoaderCircle size={16} className="spin" />{loading ? '正在读取原 PDF…' : '正在定位页面…'}</div>}
        {error && <div className="pdf-error" role="alert"><p>{error}</p><button className="button secondary" onClick={() => setRetry(n => n + 1)}><RotateCw size={14} />重试读取</button><a href={api.fileUrl(id, page)} target="_blank" rel="noreferrer">打开原 PDF 第 {page} 页 ↗</a></div>}
        <div className="canvas-host" ref={canvasHost} />
      </>}
    </div>
    <div className="reader-bottom"><div className="page-navigation"><button className="icon-button" aria-label="上一页" disabled={!pdf || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={17} /></button><label><span className="sr-only">文件页序</span><input aria-label="文件页序" type="number" min="1" max={pdf?.numPages || 1} value={page} disabled={!pdf} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n > 0 && n <= (pdf?.numPages || 0)) onPage(n); }} /><span>/ {pdf?.numPages || '—'}</span></label><button className="icon-button" aria-label="下一页" disabled={!pdf || page >= pdf.numPages} onClick={() => onPage(page + 1)}><ChevronRight size={17} /></button></div><span className="page-caption">文件页序</span><div className="zoom-controls"><button className="icon-button" aria-label="缩小" disabled={!pdf || zoom <= .6} onClick={() => setZoom(z => Math.max(.6, z - .1))}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label="放大" disabled={!pdf || zoom >= 1.8} onClick={() => setZoom(z => Math.min(1.8, z + .1))}><Plus size={15} /></button></div></div>
  </section>;
}
