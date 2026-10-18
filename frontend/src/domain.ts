import { z } from 'zod';

const nonempty = z.string().min(1);
const page = z.number().int().positive();
export const CitationSchema = z.object({
  id: nonempty, materialId: nonempty, versionId: nonempty, title: nonempty,
  pageStart: page, pageEnd: page, quote: nonempty,
}).refine(c => c.pageEnd >= c.pageStart, '引用结束页不能小于起始页');
export const CardSchema = z.object({
  origin: z.enum(['ai', 'manual', 'unknown']).optional(),
  id: nonempty, courseId: nonempty.nullable().default(null), title: nonempty, body: nonempty, sourceRefs: z.array(CitationSchema),
  reviewStatus: z.enum(['to_review', 'self_checked']), createdAt: nonempty, updatedAt: nonempty, selfCheckedAt: z.string().nullable().optional(),
});
export const PositionSchema = z.object({ materialId: nonempty, versionId: nonempty, page });
export const StateSchema = z.object({
  revision: z.number().int().nonnegative(), activeCourseId: nonempty.nullable(), updatedAt: z.string().nullable(),
  goal: z.string(), nextStep: z.string(), readingPosition: PositionSchema.nullable(), cards: z.array(CardSchema),
}).refine(s => new Set(s.cards.map(c => c.id)).size === s.cards.length, '卡片 ID 重复');
export const MaterialSchema = z.object({
  materialId: nonempty, versionId: nonempty, title: nonempty,
  status: z.enum(['processing', 'ready', 'failed']), pageCount: z.number().int().nonnegative(),
  error: z.string().nullable(), warnings: z.array(z.string()), fileUrl: z.string(),
}).refine(m => m.status !== 'ready' || m.pageCount > 0, '可用材料必须有页数');
export const ScopeSchema = z.object({ materialId: nonempty, versionId: nonempty, title: nonempty });
export const AnswerSchema = z.object({
  supported: z.boolean(),
  answerSegments: z.array(z.object({ id: nonempty, text: nonempty, citationIds: z.array(nonempty) })),
  citations: z.array(CitationSchema),
  selectedScope: z.array(ScopeSchema),
  limitations: z.array(z.string()),
}).superRefine((answer, ctx) => {
  if (!answer.supported && (answer.answerSegments.length || answer.citations.length || !answer.limitations.length)) ctx.addIssue({ code: 'custom', message: '依据不足的回答格式无效' });
  const ids = new Set(answer.citations.map(c => c.id));
  if (ids.size !== answer.citations.length) ctx.addIssue({ code: 'custom', message: '引用 ID 重复' });
  for (const c of answer.citations) {
    if (!answer.selectedScope.some(s => s.materialId === c.materialId && s.versionId === c.versionId))
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
export const initialState: StudyState = { revision: 0, activeCourseId: null, updatedAt: null, goal: '', nextStep: '', readingPosition: null, cards: [] };

export function editCard(card: Card, title: string, body: string): Card {
  return { ...card, selfCheckedAt: body.trim() !== card.body ? null : card.selfCheckedAt, title: title.trim(), body: body.trim(), reviewStatus: body.trim() !== card.body ? 'to_review' : card.reviewStatus, updatedAt: new Date().toISOString() };
}
export function pageLabel(c: Citation) { return c.pageStart === c.pageEnd ? `第 ${c.pageStart} 页` : `第 ${c.pageStart}–${c.pageEnd} 页`; }
export function toMarkdown(state: StudyState) {
  // Indent user text so Markdown syntax cannot hide the attribution or change document structure.
  const block = (s: string) => s.replace(/\r\n?/g, '\n').split('\n').map(line => `> ${line}`).join('\n');
  return ['# 我的课程学习卡片', '', `导出时间：${new Date().toLocaleString('zh-CN')}`, '',
    '## 本次目标', block(state.goal || '尚未填写'), '', '## 下次继续', block(state.nextStep || '尚未填写'), '',
    ...state.cards.flatMap((card, i) => [
      `## ${i + 1}. ${card.title.replace(/[\r\n]/g, ' ')}`, '', block(card.body), '',
      `内容来源：${card.origin === 'ai' ? 'AI 生成（可经用户编辑）' : card.origin === 'manual' ? '手动创建' : '未记录'}`,
      `复习状态：${card.reviewStatus === 'self_checked' ? '已自检（本人标记）' : '待复习'}`, `更新时间：${card.updatedAt}`, '',
      '### 来源', ...(card.sourceRefs.length ? card.sourceRefs.flatMap(c => [
        `- ${c.title.replace(/[\r\n]/g, ' ')} · 文件${pageLabel(c)} · 材料 ID：${c.materialId} · 版本：${c.versionId}`, block(c.quote), '',
      ]) : ['手写卡片，无材料来源。', '']),
    ]),
    '---', '仅导出卡片正文和引用摘录；不包含原 PDF。', '',
  ].join('\n');
}

export const CourseSchema = z.object({ courseId: nonempty, semesterId: nonempty, upstreamCourseId: nonempty, name: nonempty });
export const LearnStatusSchema = z.object({ status: z.enum(['disconnected','connecting','connected','needs_auth','error']), message: z.string(), loginUrl: z.literal('/api/learn/connect') });
export const CourseFileSchema = z.object({ fileId: nonempty, courseId: nonempty, title: nonempty, fileType: z.string(), sizeBytes: z.number().nonnegative().nullable(), supported: z.boolean(), unsupportedReason: z.string().nullable() });
export const ImportBatchSchema = z.object({ batchId: nonempty, courseId: nonempty, status: z.enum(['running','needs_auth','completed','partial_failed','failed']), updatedAt: nonempty,
  items: z.array(z.object({ itemId: nonempty, fileId: nonempty, title: nonempty, status: z.enum(['pending','downloading','processing','ready','failed','needs_auth','unsupported']), materialId: nonempty.nullable(), versionId: nonempty.nullable(), error: z.string().nullable() })) });
export const BoardSchema = z.object({ courseId: nonempty, revision: z.number().int().nonnegative(), updatedAt: z.string().nullable(),
  nodes: z.array(z.object({ id: nonempty, cardId: nonempty, x: z.number().finite(), y: z.number().finite() })),
  edges: z.array(z.object({ id: nonempty, source: nonempty, target: nonempty, label: z.string() }))
}).superRefine((b, ctx) => {
  const ids = new Set(b.nodes.map(n => n.id));
  if (ids.size !== b.nodes.length || new Set(b.edges.map(e => e.id)).size !== b.edges.length || b.edges.some(e => !ids.has(e.source) || !ids.has(e.target))) ctx.addIssue({code:'custom',message:'白板节点或连线无效'});
});
export type Course = z.infer<typeof CourseSchema>;
export type CourseFile = z.infer<typeof CourseFileSchema>;
export type LearnStatus = z.infer<typeof LearnStatusSchema>;
export type ImportBatch = z.infer<typeof ImportBatchSchema>;
export type Board = z.infer<typeof BoardSchema>;
export type Scope = z.infer<typeof ScopeSchema>;

export const BoardPreviewSchema = z.object({
  previewId: nonempty, courseId: nonempty, cards: z.array(CardSchema),
  nodes: z.array(z.object({id: nonempty, cardId: nonempty, x:z.number().finite(), y:z.number().finite()})),
  edges: z.array(z.object({id:nonempty, source:nonempty, target:nonempty, label:z.string()})),
  limitations:z.array(z.string()), selectedScope:z.array(ScopeSchema),
}).superRefine((preview,ctx)=>{
  const cards=new Set(preview.cards.map(c=>c.id));
  const nodes=new Set(preview.nodes.map(n=>n.id));
  if(cards.size!==preview.cards.length || nodes.size!==preview.nodes.length ||
     preview.cards.some(c=>c.courseId!==preview.courseId) ||
     preview.nodes.some(n=>!cards.has(n.cardId)) ||
     preview.edges.some(e=>!nodes.has(e.source)||!nodes.has(e.target)||e.source===e.target))
    ctx.addIssue({code:'custom',message:'AI白板的课程、节点或连线不匹配'});
  for(const card of preview.cards) for(const c of card.sourceRefs) {
    if(!preview.selectedScope.some(s=>s.materialId===c.materialId && s.versionId===c.versionId))
      ctx.addIssue({code:'custom',message:'AI白板引用不属于生成范围'});
  }
});
export type BoardPreview = z.infer<typeof BoardPreviewSchema>;

export const ExamTypeSchema = z.enum(['midterm','final','other']);
export const ExamReportSchema = z.object({
  id:nonempty, courseId:nonempty, createdAt:nonempty, examMaterialIds:z.array(nonempty),
  topics:z.array(z.object({id:nonempty,title:nonempty,analysis:nonempty,examRefs:z.array(CitationSchema),knowledgeRefs:z.array(CitationSchema),relatedCardIds:z.array(nonempty)})),
  practice:z.array(z.object({id:nonempty,topicId:nonempty,question:nonempty,hint:z.string(),answer:nonempty})),
  limitations:z.array(z.string()),
}).superRefine((report,ctx)=>{
  const topics=new Set(report.topics.map(t=>t.id));
  if(topics.size!==report.topics.length || report.practice.some(p=>!topics.has(p.topicId)))ctx.addIssue({code:'custom',message:'练习关联的考点无效'});
  if(report.topics.some(t=>t.examRefs.some(r=>!report.examMaterialIds.includes(r.materialId))))ctx.addIssue({code:'custom',message:'真题引用不属于所选试卷'});
});
export const ExamListSchema=z.object({exams:z.array(z.object({material:MaterialSchema,year:z.string(),examType:ExamTypeSchema})),reports:z.array(ExamReportSchema)});
export type ExamReport=z.infer<typeof ExamReportSchema>;
export type ExamList=z.infer<typeof ExamListSchema>;
export type ExamType=z.infer<typeof ExamTypeSchema>;
