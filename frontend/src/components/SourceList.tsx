import { ChevronDown, FileText, ArrowUpRight } from 'lucide-react';
import { pageLabel, type Citation } from '../domain';

export default function SourceList({ refs, onOpen, label = '查看来源', showQuotes = false }: {
  refs: Citation[]; onOpen: (c: Citation) => void; label?: string; showQuotes?: boolean;
}) {
  if (!refs.length) return null;
  return <details className="sources-disclosure">
    <summary><FileText size={14} /><span>{label}</span><span className="source-count">{refs.length}</span><ChevronDown size={15} /></summary>
    <ol className="source-list">{refs.map((c, index) => <li key={`${c.materialId}:${c.versionId}:${c.id}`}>
      <button className="source-chip" onClick={() => onOpen(c)} title={`${c.title} · 版本 ${c.versionId}`}>
        <span className="source-number">{index + 1}</span><span className="source-name">{c.title}<small>文件{pageLabel(c)}</small></span><ArrowUpRight size={15} />
      </button>
      {showQuotes && <blockquote>{c.quote}</blockquote>}
    </li>)}</ol>
  </details>;
}
