import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api, ApiError } from '../api';
import { initialState, StateSchema, type StudyState } from '../domain';

export function readDraft<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null; } catch { return null; }
}
export function storeDraft(key: string, value: unknown) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
type Revisioned = { revision: number; updatedAt: string | null };
// Exactly one writer. Acknowledgements advance revision without overwriting subsequent edits.
export class SaveQueue<T extends Revisioned = StudyState> {
  private running = false;
  private pending: T | null = null;
  private revision: number | null = null;
  private blocked = false;
  constructor(private save: (s: T) => Promise<T>, private onResult: (error: Error | null, idle: boolean) => void, private onAck: (state: T, idle: boolean) => void = () => {}) {}
  reset(revision: number) { this.pending = null; this.revision = revision; this.blocked = false; }
  enqueue(state: T) { this.pending = structuredClone(state); }
  hasPending() { return this.running || this.pending !== null; }
  isRunning() { return this.running; }
  async flush() {
    if (this.running || !this.pending || this.blocked) return;
    this.running = true; this.onResult(null, false);
    try {
      while (this.pending) {
        const snapshot = {...this.pending, revision: this.revision ?? this.pending.revision}; this.pending = null;
        try {
          const saved = await this.save(snapshot);
          if (saved.revision <= snapshot.revision) throw new ApiError('保存响应没有推进版本，草稿已保留。');
          this.revision = saved.revision;
          this.onAck(saved, this.pending === null);
        } catch (error) {
          this.pending ??= snapshot;
          this.blocked = error instanceof ApiError && error.status === 409;
          this.onResult(error instanceof Error ? error : new Error('保存失败'), false); return;
        }
      }
      this.onResult(null, true);
    } finally { this.running = false; }
  }
}
export function useRevisionState<T extends Revisioned>(key: string, initial: T, schema: z.ZodType<T>, get: () => Promise<T>, put: (value: T) => Promise<T>, legacy?: () => T | null) {
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [draftWarning, setDraftWarning] = useState(false);
  const [recovery, setRecovery] = useState<T | null>(null);
  const current = useRef(state);
  const generation = useRef(0);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<SaveQueue<T> | null>(null);
  if (!queue.current) queue.current = new SaveQueue(put, (error, idle) => {
    if (!mounted.current) return;
    setSaveError(error?.message || ''); setConflict(error instanceof ApiError && error.status === 409);
    setSaveStatus(error ? 'error' : idle ? 'saved' : 'saving');
    if (idle) { storeDraft(key, null); setDraftWarning(false); }
  }, (saved, idle) => {
    // An unmounted course must never clear a draft created by a later mount.
    if (!mounted.current) return;
    const next = idle ? saved : {...current.current, revision: saved.revision, updatedAt: saved.updatedAt};
    current.current = next;
    storeDraft(key, idle ? null : next);
    if (mounted.current) setState(next);
  });
  const load = useCallback(async () => {
    if (queue.current!.isRunning()) return;
    if (timer.current) clearTimeout(timer.current);
    const run = ++generation.current; setLoadError(''); setReady(false);
    try {
      const saved = await get();
      if (!mounted.current || run !== generation.current) return;
      const draft = schema.safeParse(readDraft(key) ?? legacy?.());
      queue.current!.reset(saved.revision); current.current = saved; setState(saved); setReady(true); setConflict(false); setSaveError(''); setSaveStatus('saved');
      if (draft.success && JSON.stringify(draft.data) !== JSON.stringify(saved)) setRecovery(draft.data);
      else { setRecovery(null); storeDraft(key, null); }
    } catch (e) { if (mounted.current && run === generation.current) setLoadError(e instanceof Error ? e.message : '读取失败'); }
  }, [get, key, schema, legacy]);
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; generation.current++; if (timer.current) clearTimeout(timer.current); };
  }, [load]);
  const update = useCallback((fn: (s: T) => T, immediate = false) => {
    if (!mounted.current) return;
    const next = fn(current.current); current.current = next; setState(next);
    setDraftWarning(!storeDraft(key, next)); queue.current!.enqueue(next); setSaveStatus('pending');
    if (timer.current) clearTimeout(timer.current);
    if (immediate) void queue.current!.flush(); else timer.current = setTimeout(() => void queue.current!.flush(), 650);
  }, [key]);
  const flush = useCallback(() => { if (timer.current) clearTimeout(timer.current); void queue.current!.flush(); }, []);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (queue.current!.hasPending()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, []);
  return {state, ready, loadError, reload: load, update, flush, saveStatus, saveError, conflict, draftWarning, recovery,
    restore: () => { if (recovery) update(s => ({...recovery,revision:s.revision,updatedAt:s.updatedAt}), true); setRecovery(null); },
    discardRecovery: () => { setRecovery(null); storeDraft(key,null); },
  };
}
export function migrateLegacyStudyDraft(): StudyState | null {
  const old=readDraft<Record<string,unknown>>('zhiye:pending-state:v1');
  if(!old || typeof old!=='object')return null;
  const result=StateSchema.safeParse({...initialState,...old});
  if(!result.success)return null;
  if(storeDraft('zhiye:pending-state:v2',result.data))storeDraft('zhiye:pending-state:v1',null);
  return result.data;
}
export function useStudyState() { return useRevisionState('zhiye:pending-state:v2',initialState,StateSchema,api.getState,api.saveState,migrateLegacyStudyDraft); }
