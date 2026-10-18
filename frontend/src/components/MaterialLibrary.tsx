import { useState } from 'react';
import { Check, FileText, LoaderCircle, Upload } from 'lucide-react';
import type { Material } from '../domain';
import { Alert, Badge, Button } from './ui';

type Props = {
  materials: Material[]; current: Material | null; disabled: boolean;
  uploading: boolean; uploadName: string; error: string;
  onUpload: () => void; onDrop: (file?: File) => void; onSelect: (material: Material) => void;
};
export default function MaterialLibrary({ materials, current, disabled, uploading, uploadName, error, onUpload, onDrop, onSelect }: Props) {
  const [dragging, setDragging] = useState(false);
  return <div className="material-library" onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={e => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); onDrop(e.dataTransfer.files[0]); }}>
    <div className="section-heading"><h2>材料库</h2><span className="count">{materials.length}</span></div>
    <Button className={`upload-button ${dragging ? 'dragging' : ''}`} disabled={disabled} loading={uploading} onClick={onUpload}>{!uploading && <Upload size={14} />}上传 PDF</Button>
    <p className="material-format">文本 PDF · 最大 20 MB · 支持拖放</p>
    <ul className="material-list" aria-label="本次会话材料">
      {materials.map(item => <li key={`${item.materialId}:${item.versionId}`}><button className="material-row" aria-current={item.materialId === current?.materialId && item.versionId === current.versionId ? 'true' : undefined} disabled={disabled} onClick={() => onSelect(item)}>
        <FileText size={16} /><span className="material-row-content"><strong>{item.title}</strong><span>{item.pageCount ? `${item.pageCount} 页 · ` : ''}<span className="ready-text"><Check size={12} />已就绪</span></span></span>
      </button></li>)}
      {uploading && <li className="material-pending" role="status"><LoaderCircle size={16} className="spin" /><span><strong>{uploadName}</strong><Badge>解析中</Badge></span></li>}
    </ul>
    {!materials.length && !uploading && <p className="no-material">还没有课程材料。<br />上传讲义，开始阅读与提问。</p>}
    {error && <Alert title="上传失败" action={<Button disabled={disabled} onClick={onUpload}>重新选择</Button>}>{uploadName && <span className="failed-filename">{uploadName}</span>}{error}</Alert>}
    <p className="scope-note">本次会话材料及恢复的当前材料。<br />卡片的历史来源可随时回看。</p>
  </div>;
}
