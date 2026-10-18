import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { initialState, StateSchema, type StudyState } from '../domain';

const STORAGE_KEY = 'zhiye:pending-state:v1';
export function readDraft<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null; } catch { return null; }
}
export function storeDraft(key: string, value: unknown) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// A single writer coalesces changes made while PUT is in flight; older requests cannot finish last.
export class SaveQueue {
  private running = false;
  private pending: StudyState | null = null;
  constructor(private save: (s: StudyState) => Promise<void>, private onResult: (error: string | null, idle: boolean) => void) {}
  enqueue(state: StudyState) { this.pending = structuredClone(state); }
  hasPending() { return this.running || this.pending !== null; }
  async flush() {
    if (this.running || !this.pending) return;
    this.running = true;
    this.onResult(null, false);
    try {
      while (this.pending) {
        const snapshot = this.pending; this.pending = null;
        try { await this.save(snapshot); }
        catch (error) {
          // Retain the newest snapshot, including any edits made during a failed request.
          this.pending ??= snapshot;
          this.onResult(error instanceof Error ? error.message : '保存失败', false);
          return;
        }
      }
      this.onResult(null, true);
    } finally { this.running = false; }
  }
}

export function useStudyState() {
  const [state, setState] = useState<StudyState>(initialState);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [draftWarning, setDraftWarning] = useState(false);
  const [recovery, setRecovery] = useState<StudyState | null>(null);
  const current = useRef(state);
  const loadGeneration = useRef(0);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<SaveQueue | null>(null);
  if (!queue.current) queue.current = new SaveQueue(api.saveState, (error, idle) => {
    if (!mounted.current) return;
    setSaveError(error || '');
    setSaveStatus(error ? 'error' : idle ? 'saved' : 'saving');
    if (idle) { storeDraft(STORAGE_KEY, null); setDraftWarning(false); }
  });
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoadError('');
    try {
      const saved = await api.getState();
      if (!mounted.current || generation !== loadGeneration.current) return;
      current.current = saved; setState(saved); setReady(true);
      const draft = StateSchema.safeParse(readDraft(STORAGE_KEY));
      if (draft.success && JSON.stringify(draft.data) !== JSON.stringify(saved)) setRecovery(draft.data);
      else storeDraft(STORAGE_KEY, null);
    } catch (e) { if (mounted.current && generation === loadGeneration.current) setLoadError(e instanceof Error ? e.message : '读取失败'); }
  }, []);
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; loadGeneration.current++; if (timer.current) clearTimeout(timer.current); };
  }, [load]);
  const update = useCallback((fn: (s: StudyState) => StudyState, immediate = false) => {
    if (!mounted.current) return;
    const next = fn(current.current);
    current.current = next; setState(next);
    setDraftWarning(!storeDraft(STORAGE_KEY, next));
    queue.current!.enqueue(next); setSaveStatus('pending');
    if (timer.current) clearTimeout(timer.current);
    if (immediate) void queue.current!.flush();
    else timer.current = setTimeout(() => void queue.current!.flush(), 650);
  }, []);
  const flush = useCallback(() => { if (timer.current) clearTimeout(timer.current); void queue.current!.flush(); }, []);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (queue.current!.hasPending()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, []);
  return { state, ready, loadError, reload: load, update, flush, saveStatus, saveError, draftWarning, recovery,
    restore: () => { if (recovery) update(() => recovery, true); setRecovery(null); },
    discardRecovery: () => { setRecovery(null); storeDraft(STORAGE_KEY, null); },
  };
}
