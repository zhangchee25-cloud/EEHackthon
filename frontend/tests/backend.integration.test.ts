import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { api } from '../src/api';
import type { Material } from '../src/domain';

const base = process.env.STUDY_TEST_URL;
const dataset = process.env.STUDY_TEST_PDFS;
const live = process.env.STUDY_TEST_LIVE === '1';
const originalFetch = globalThis.fetch;
const materials: Material[] = [];
if (base) globalThis.fetch = (input, init) => originalFetch(new URL(String(input), base), init);
afterAll(() => { globalThis.fetch = originalFetch; });

describe.skipIf(!base || !dataset)('real backend and supplied PDFs through the frontend client', () => {
  for (const filename of dataset ? readdirSync(dataset).filter(f => f.endsWith('.pdf')).sort() : []) {
    it(`uploads, reads, deduplicates and saves ${filename}`, async () => {
      const bytes = readFileSync(join(dataset!, filename));
      const material = await api.upload(new File([bytes], filename, { type: 'application/pdf' }));
      expect(material.status).toBe('ready');
      expect(material.pageCount).toBeGreaterThan(20);
      materials.push(material);
      const file = await fetch(api.fileUrl(material.materialId));
      expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
      const range = await fetch(api.fileUrl(material.materialId), { headers: { Range: 'bytes=0-7' } });
      expect(range.status).toBe(206);
      expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(0, 8));
      expect((await api.upload(new File([bytes], filename))).materialId).toBe(material.materialId);
      const before = await api.getState();
      const saved = await api.saveState({ ...before, goal: '课程讲义集成验收',
        readingPosition: { materialId: material.materialId, versionId: material.versionId, page: material.pageCount } });
      expect(saved.revision).toBe(before.revision + 1);
      expect(await api.getState()).toEqual(saved);
      await expect(api.saveState(before)).rejects.toThrow();
      const stamp = new Date().toISOString();
      let state = await api.saveState({ ...saved, cards: [...saved.cards, {
        id: `manual_${material.materialId}`, courseId: null, title: material.title, body: '本机联调手写卡片', sourceRefs: [],
        reviewStatus: 'to_review', createdAt: stamp, updatedAt: stamp,
      }] });
      state = await api.saveState({ ...state, cards: state.cards.map(c => c.id === `manual_${material.materialId}` ? { ...c, reviewStatus: 'self_checked' } : c) });
      expect(state.cards.at(-1)?.selfCheckedAt).toBeTruthy();
      state = await api.saveState({ ...state, cards: state.cards.map(c => c.id === `manual_${material.materialId}` ? { ...c, body: '改写后的个人理解' } : c) });
      expect(state.cards.at(-1)?.reviewStatus).toBe('to_review');
      expect(state.cards.at(-1)?.selfCheckedAt).toBeNull();
      const exported = await (await fetch('/api/export')).text();
      expect(exported).toContain(material.title);
      expect(exported).toContain('改写后的个人理解');
    }, 120000);
  }

  it.skipIf(live)('surfaces the actual unconfigured-model error without a canned answer', async () => {
    const material = materials[0];
    await expect(api.ask(material.materialId, material.versionId, '解释一个概念')).rejects.toThrow('配置');
  });

  it.skipIf(!live)('asks the real provider, validates sources and persists rewritten cards', async () => {
    for (const material of materials) {
      const answer = await api.ask(material.materialId, material.versionId,
        '请选出这份讲义明确讲解的一个核心概念，用一两句话解释，并引用支持解释的原文。');
      expect(answer.answerSegments.length).toBeGreaterThan(0);
      expect(answer.citations.length).toBeGreaterThan(0);
      expect(answer.citations.every(c => c.pageEnd <= material.pageCount)).toBe(true);
      let state = await api.getState();
      const stamp = new Date().toISOString();
      const card = { id: `check_${material.materialId}`, courseId: null, title: material.title,
        body: answer.answerSegments.map(s => s.text).join('\n'), sourceRefs: answer.citations,
        reviewStatus: 'to_review' as const, createdAt: stamp, updatedAt: stamp };
      state = await api.saveState({ ...state, cards: [...state.cards, card] });
      state = await api.saveState({ ...state, cards: state.cards.map(c => c.id === card.id ? { ...c, reviewStatus: 'self_checked' } : c) });
      expect(state.cards.find(c => c.id === card.id)?.selfCheckedAt).toBeTruthy();
      state = await api.saveState({ ...state, cards: state.cards.map(c => c.id === card.id ? { ...c, body: c.body + '\n我的补充理解。' } : c) });
      expect(state.cards.find(c => c.id === card.id)?.reviewStatus).toBe('to_review');
      expect(state.cards.find(c => c.id === card.id)?.selfCheckedAt).toBeNull();
      const exported = await (await fetch('/api/export')).text();
      expect(exported).toContain(card.title);
      expect(exported).toContain(card.sourceRefs[0].versionId);
    }
  }, 900000);
});
