import { describe, expect, it } from 'vitest';
import { AnswerSchema, editCard, initialState, toMarkdown, type Card } from '../src/domain';
import { SaveQueue } from '../src/hooks/useStudyState';

const card: Card = { id: 'card', title: 'Capacitor', body: 'My explanation', reviewStatus: 'self_checked', sourceRefs: [{ id: 'ref', materialId: 'mat', versionId: 'v1', title: 'lecture.pdf', pageStart: 2, pageEnd: 2, quote: 'Energy is stored in the electric field.' }], createdAt: '2026-10-18T06:00:00Z', updatedAt: '2026-10-18T06:00:00Z' };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { resolve, promise }; }

describe('save ordering and recovery', () => {
  it('allows only one PUT, coalesces intermediate edits, and saves the latest complete state', async () => {
    const gate = deferred(); const sent: string[] = []; const outcomes: boolean[] = [];
    const queue = new SaveQueue(async s => { sent.push(s.goal); if (sent.length === 1) await gate.promise; }, (_error, idle) => outcomes.push(idle));
    queue.enqueue({ ...initialState, goal: 'first' }); const writing = queue.flush();
    queue.enqueue({ ...initialState, goal: 'middle' }); void queue.flush();
    queue.enqueue({ ...initialState, goal: 'last' });
    expect(sent).toEqual(['first']); expect(queue.hasPending()).toBe(true);
    gate.resolve(); await writing;
    expect(sent).toEqual(['first', 'last']); expect(queue.hasPending()).toBe(false); expect(outcomes.at(-1)).toBe(true);
  });
  it('keeps newer edits when an older save fails, and retries without creating another card', async () => {
    const gate = deferred(); let failing = true; const sent: string[] = []; const errors: (string | null)[] = [];
    const queue = new SaveQueue(async s => { sent.push(s.goal); if (failing) { await gate.promise; throw new Error('disk full'); } }, error => errors.push(error));
    queue.enqueue({ ...initialState, goal: 'old', cards: [card] }); const writing = queue.flush();
    queue.enqueue({ ...initialState, goal: 'new', cards: [card] }); gate.resolve(); await writing;
    expect(queue.hasPending()).toBe(true); expect(errors.at(-1)).toBe('disk full');
    failing = false; await queue.flush(); expect(sent).toEqual(['old', 'new']); expect(queue.hasPending()).toBe(false);
  });
});
describe('understanding cards and sources', () => {
  it('resets self-check only when the body changes, preserving source snapshots', () => {
    expect(editCard(card, 'New title', card.body).reviewStatus).toBe('self_checked');
    const next = editCard(card, card.title, 'Rewritten in my own words');
    expect(next.reviewStatus).toBe('to_review'); expect(next.sourceRefs).toEqual(card.sourceRefs);
  });
  it('exports personal changes, file pages, version and quote without bundling the PDF', () => {
    const text = toMarkdown({ ...initialState, cards: [editCard(card, card.title, 'My new explanation')] });
    for (const part of ['My new explanation', '待复习', 'lecture.pdf', '第 2 页', 'v1', 'Energy is stored']) expect(text).toContain(part);
    expect(text).not.toContain('data:application/pdf');
  });
  it('rejects dangling, cross-version and inverted references', () => {
    const base = { answerSegments: [{ id: 'seg', text: 'Explanation', citationIds: ['ref'] }], citations: card.sourceRefs, selectedScope: { materialId: 'mat', versionId: 'v1' }, limitations: [] };
    expect(AnswerSchema.safeParse(base).success).toBe(true);
    expect(AnswerSchema.safeParse({ ...base, citations: [] }).success).toBe(false);
    expect(AnswerSchema.safeParse({ ...base, selectedScope: { materialId: 'mat', versionId: 'v2' } }).success).toBe(false);
    expect(AnswerSchema.safeParse({ ...base, citations: [{ ...card.sourceRefs[0], pageStart: 3, pageEnd: 1 }] }).success).toBe(false);
  });
});
