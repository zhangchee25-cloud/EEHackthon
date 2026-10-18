import { z } from 'zod';

const nonempty = z.string().min(1);
const page = z.number().int().positive();
export const CitationSchema = z.object({
  id: nonempty, materialId: nonempty, versionId: nonempty, title: nonempty,
  pageStart: page, pageEnd: page, quote: nonempty,
}).refine(c => c.pageEnd >= c.pageStart, '引用结束页不能小于起始页');
export const CardSchema = z.object({
  id: nonempty, title: nonempty, body: nonempty, sourceRefs: z.array(CitationSchema),
  reviewStatus: z.enum(['to_review', 'self_checked']), createdAt: nonempty, updatedAt: nonempty,
});
export const PositionSchema = z.object({ materialId: nonempty, versionId: nonempty, page });
export const StateSchema = z.object({
  goal: z.string(), nextStep: z.string(), readingPosition: PositionSchema.nullable(), cards: z.array(CardSchema),
}).refine(s => new Set(s.cards.map(c => c.id)).size === s.cards.length, '卡片 ID 重复');
export const MaterialSchema = z.object({
  materialId: nonempty, versionId: nonempty, title: nonempty,
  status: z.enum(['processing', 'ready', 'failed']), pageCount: z.number().int().nonnegative(),
  error: z.string().nullish(),
}).refine(m => m.status !== 'ready' || m.pageCount > 0, '可用材料必须有页数');
export const AnswerSchema = z.object({
  answerSegments: z.array(z.object({ id: nonempty, text: nonempty, citationIds: z.array(nonempty) })),
  citations: z.array(CitationSchema),
  selectedScope: z.object({ materialId: nonempty, versionId: nonempty }),
  limitations: z.array(z.string()),
}).superRefine((answer, ctx) => {
  const ids = new Set(answer.citations.map(c => c.id));
  if (ids.size !== answer.citations.length) ctx.addIssue({ code: 'custom', message: '引用 ID 重复' });
  for (const c of answer.citations) {
    if (c.materialId !== answer.selectedScope.materialId || c.versionId !== answer.selectedScope.versionId)
      ctx.addIssue({ code: 'custom', message: '引用不属于当前材料版本' });
  }
  for (const s of answer.answerSegments) {
    if (s.citationIds.some(id => !ids.has(id))) ctx.addIssue({ code: 'custom', message: '回答引用不存在' });
  }
});
export type Citation = z.infer<typeof CitationSchema>;
export type Card = z.infer<typeof CardSchema>;
export type StudyState = z.infer<typeof StateSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export const initialState: StudyState = { goal: '', nextStep: '', readingPosition: null, cards: [] };

export function editCard(card: Card, title: string, body: string): Card {
  return { ...card, title: title.trim(), body: body.trim(), reviewStatus: body.trim() !== card.body ? 'to_review' : card.reviewStatus, updatedAt: new Date().toISOString() };
}
export function pageLabel(c: Citation) { return c.pageStart === c.pageEnd ? `第 ${c.pageStart} 页` : `第 ${c.pageStart}–${c.pageEnd} 页`; }
export function toMarkdown(state: StudyState) {
  // Indent user text so Markdown syntax cannot hide the attribution or change document structure.
  const block = (s: string) => s.replace(/\r\n?/g, '\n').split('\n').map(line => `> ${line}`).join('\n');
  return ['# 我的课程学习卡片', '', `导出时间：${new Date().toLocaleString('zh-CN')}`, '',
    '## 本次目标', block(state.goal || '尚未填写'), '', '## 下次继续', block(state.nextStep || '尚未填写'), '',
    ...state.cards.flatMap((card, i) => [
      `## ${i + 1}. ${card.title.replace(/[\r\n]/g, ' ')}`, '', block(card.body), '',
      `复习状态：${card.reviewStatus === 'self_checked' ? '已自检（本人标记）' : '待复习'}`, `更新时间：${card.updatedAt}`, '',
      '### 来源', ...(card.sourceRefs.length ? card.sourceRefs.flatMap(c => [
        `- ${c.title.replace(/[\r\n]/g, ' ')} · 文件${pageLabel(c)} · 材料 ID：${c.materialId} · 版本：${c.versionId}`, block(c.quote), '',
      ]) : ['手写卡片，无材料来源。', '']),
    ]),
    '---', '仅导出个人表述和引用摘录；不包含原 PDF。', '',
  ].join('\n');
}
