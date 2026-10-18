import { cloneElement, useEffect, useId, useRef, useState, type ComponentPropsWithRef, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { AlertCircle, Check, LoaderCircle } from 'lucide-react';

export function Button({ variant = 'secondary', className = '', type = 'button', loading = false, disabled, children, ...props }: ComponentPropsWithRef<'button'> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; loading?: boolean }) {
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={`button ${variant} ${className}`}>{loading && <LoaderCircle size={14} className="spin" aria-hidden="true" />}{children}</button>;
}
export function Input({ className = '', ...props }: ComponentPropsWithRef<'input'>) {
  return <input {...props} className={`input ${className}`} />;
}
export function Textarea({ className = '', ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} className={`textarea ${className}`} />;
}
export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`panel ${className}`} />;
}
export function Badge({ tone = 'neutral', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'brand' | 'warning' | 'danger' }) {
  return <span {...props} className={`badge badge-${tone} ${className}`} />;
}
export function Alert({ title, children, action, tone = 'danger', ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & { title: ReactNode; action?: ReactNode; tone?: 'danger' | 'warning' | 'neutral' }) {
  return <div {...props} className={`alert alert-${tone} ${props.className || ''}`} role={tone === 'danger' ? 'alert' : 'status'}><AlertCircle size={16} aria-hidden="true" /><div className="alert-content"><strong>{title}</strong>{children && <div>{children}</div>}</div>{action && <div className="alert-actions">{action}</div>}</div>;
}
export function Toast({ children }: { children: ReactNode }) {
  return <div className="toast" role="status"><Check size={16} aria-hidden="true" />{children}</div>;
}
export function EmptyState({ title, children, icon, action, className = '' }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={`empty-state ${className}`}>{icon && <span className="empty-state-icon" aria-hidden="true">{icon}</span>}<h2>{title}</h2>{children && <p>{children}</p>}{action && <div className="empty-state-action">{action}</div>}</div>;
}
export function LoadingState({ children }: { children: ReactNode }) {
  return <div className="loading-state" role="status"><LoaderCircle size={16} className="spin" aria-hidden="true" />{children}</div>;
}
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}
export function ErrorState({ title = '暂时无法完成', children, onRetry }: { title?: string; children: ReactNode; onRetry?: () => void }) {
  return <Alert title={title} action={onRetry && <Button onClick={onRetry}>重试</Button>}>{children}</Alert>;
}
export function Tooltip({ label, children }: { label: string; children: ReactElement<{ 'aria-describedby'?: string }> }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <span className="tooltip-anchor" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} onKeyDown={e => { if (e.key === 'Escape') setVisible(false); }}>
    {cloneElement(children, { 'aria-describedby': [children.props['aria-describedby'], visible ? id : ''].filter(Boolean).join(' ') || undefined })}
    {visible && <span role="tooltip" id={id} className="tooltip">{label}</span>}
  </span>;
}
export function ConfirmDialog({ open, title, children, confirmLabel = '确认放弃', onCancel, onConfirm }: { open: boolean; title: string; children: ReactNode; confirmLabel?: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [open]);
  return <dialog ref={ref} className="dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={e => { e.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>{title}</h2><p id={descriptionId}>{children}</p><div className="dialog-actions"><Button autoFocus onClick={onCancel}>继续编辑</Button><Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button></div>
  </dialog>;
}
