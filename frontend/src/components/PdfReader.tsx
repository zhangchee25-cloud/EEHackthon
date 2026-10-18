import { Button, Input, EmptyState, ErrorState, LoadingState } from './ui';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Minus, Plus, Sparkles } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../api';
import type { Position } from '../domain';
GlobalWorkerOptions.workerSrc = workerUrl;

type Props = { onUpload: () => void; uploadDisabled: boolean; position: Position | null; title: string; onPage: (page: number) => void; onLoaded: (id: string, count: number, title: string) => void; onAsk: () => void; askDisabled: boolean };
export default function PdfReader({ onUpload, uploadDisabled, position, title, onPage, onLoaded, onAsk, askDisabled }: Props) {
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
    const observer = new ResizeObserver(entries => {
      // contentRect already excludes padding. Hidden tabs must not resize the PDF.
      const measured = entries[0].contentRect.width;
      if (measured <= 0) return;
      const next = Math.max(1, Math.floor(measured));
      setWidth(previous => previous === next ? previous : next);
    });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPdf(null); setError(''); setRendering(false);
    canvasHost.current?.replaceChildren();
    if (!id) return;
    let stopped = false;
    setLoading(true);
    const task = getDocument({ url: api.fileUrl(id).split('#')[0], cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/' });
    void task.promise.then(async doc => {
      if (stopped) return;
      setPdf(doc); setLoading(false);
      const metadata = await doc.getMetadata().catch(() => null);
      if (!stopped) callbacks.current.onLoaded(id, doc.numPages, (metadata as { contentDispositionFilename?: string } | null)?.contentDispositionFilename || (metadata?.info as { Title?: string })?.Title || '');
    }).catch(e => { if (!stopped) { setError(`无法打开阅读版：${e instanceof Error ? e.message : '文件读取失败'}`); setLoading(false); } });
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
    })().catch(e => { if (!stopped && e?.name !== 'RenderingCancelledException') setError('这一页暂时无法显示，请重试或打开阅读版。'); })
      .finally(() => { if (!stopped) setRendering(false); });
    // Keep the last completed bitmap until the replacement is fully rendered.
    // Clearing it here changes scrollbars/width and can retrigger ResizeObserver.
    return () => { stopped = true; render?.cancel(); };
  }, [pdf, page, width, zoom]);
  return <section className="reader panel" aria-label="PDF 阅读器">
    <div className="reader-top"><div className="reader-file"><FileText size={17} /><span>{title || '课程材料'}</span></div>
      <div className="reader-top-actions"><button className="ask-ai-button" disabled={askDisabled} onClick={onAsk}><Sparkles size={13} />Ask AI</button>{id && <a className="icon-button" href={api.fileUrl(id, page)} target="_blank" rel="noreferrer" title={`打开阅读版第 ${page} 页`} aria-label={`打开阅读版第 ${page} 页`}><ExternalLink size={16} /></a>}</div>
    </div>
    <div className={`paper-area ${!id ? 'empty-paper' : ''}`} ref={host} tabIndex={0} role="region" aria-label="PDF 页面内容">
      {!id ? <EmptyState className="reader-empty" icon={<FileText size={20} />} title="添加课程材料" action={<Button variant="primary" disabled={uploadDisabled} onClick={onUpload}><Plus size={14} />上传材料</Button>}>上传 PDF、Word、PPT、Markdown 或 TXT，在这里阅读材料、核对引用。非 PDF 使用生成的阅读版。{uploadDisabled && <span className="empty-disabled-hint">请先连接学习服务，或完成顶部的草稿恢复选择。</span>}</EmptyState> : <>
        {(loading || rendering) && <div className="pdf-loading"><LoadingState>{loading ? '正在读取阅读版…' : '正在定位页面…'}</LoadingState></div>}
        {error && <ErrorState title="阅读版未能显示" onRetry={() => setRetry(n => n + 1)}>{error}<a className="pdf-fallback" href={api.fileUrl(id, page)} target="_blank" rel="noreferrer">打开阅读版第 {page} 页 ↗</a></ErrorState>}
        <div className="canvas-host" ref={canvasHost} />
      </>}
    </div>
    <div className="reader-bottom"><div className="page-navigation"><button className="icon-button" aria-label="上一页" disabled={!pdf || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={17} /></button><label><span className="sr-only">文件页序</span><Input aria-label="文件页序" type="number" min="1" max={pdf?.numPages || 1} value={page} disabled={!pdf} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n > 0 && n <= (pdf?.numPages || 0)) onPage(n); }} /><span>/ {pdf?.numPages || '—'}</span></label><button className="icon-button" aria-label="下一页" disabled={!pdf || page >= pdf.numPages} onClick={() => onPage(page + 1)}><ChevronRight size={17} /></button></div><span className="page-caption">文件页序</span><div className="zoom-controls"><button className="icon-button" aria-label="缩小" disabled={!pdf || zoom <= .6} onClick={() => setZoom(z => Math.max(.6, z - .1))}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label="放大" disabled={!pdf || zoom >= 1.8} onClick={() => setZoom(z => Math.min(1.8, z + .1))}><Plus size={15} /></button></div></div>
  </section>;
}
