import { z } from 'zod';
import { AnswerSchema, MaterialSchema, StateSchema, CourseSchema, CourseFileSchema, LearnStatusSchema, ImportBatchSchema, BoardSchema, type StudyState, type Board, type Material, type Answer } from './domain';

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string, readonly details?: Record<string, unknown>) { super(message); this.name = 'ApiError'; }
}
async function request(path: string, init: RequestInit = {}, timeout = 20000): Promise<unknown> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`/api${path}`, { ...init, signal: controller.signal });
    const raw = await res.text(); let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new ApiError(`服务未返回 JSON（HTTP ${res.status}），请检查后端与 /api 代理。`, res.status); }
    if (!res.ok) {
      const body = data as {error?: string | {message?:string;code?:string;details?:Record<string,unknown>};detail?:string;message?:string} | null;
      const error = body?.error;
      throw new ApiError(`${typeof error === 'object' ? error?.message || '请求失败' : error || body?.detail || body?.message || '请求失败'}（HTTP ${res.status}）`, res.status, typeof error === 'object' ? error?.code : undefined, typeof error === 'object' ? error?.details : undefined);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError('请求超时，输入已保留。请检查服务后重试。');
    throw new ApiError('无法连接本机服务，请确认后端已启动并检查代理地址。');
  } finally { clearTimeout(timer); }
}
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiError(`接口数据不符合约定：${result.error.issues[0]?.message || '字段缺失'}。请检查本轮集成契约。`);
  return result.data;
}
const json = (method: string, data: unknown): RequestInit => ({method, headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const id = encodeURIComponent;
export function validateAnswer(answer: Answer, materials: Material[]) {
  for (const scope of answer.selectedScope) if (!materials.some(m => m.materialId === scope.materialId && m.versionId === scope.versionId && m.status === 'ready')) throw new ApiError('回答范围与当前材料版本不一致，已停止展示。');
  for (const c of answer.citations) {
    const material = materials.find(m => m.materialId === c.materialId && m.versionId === c.versionId);
    if (!material || !material.pageCount || c.pageEnd > material.pageCount) throw new ApiError('引用超出对应材料页数，已停止展示。');
  }
  return answer;
}
export const api = {
  health: () => request('/health'),
  getState: async () => parse(StateSchema, await request('/state')),
  saveState: async (state: StudyState) => parse(StateSchema, await request('/state', json('PUT',state))),
  material: async (materialId: string) => parse(MaterialSchema, await request(`/materials/${id(materialId)}`)),
  upload: async (file: File) => { const body = new FormData(); body.append('file', file); return parse(MaterialSchema, await request('/materials', { method: 'POST', body }, 90000)); },
  ask: async (materialId: string, versionId: string, question: string, requestId: string = crypto.randomUUID()) => {
    const answer = parse(AnswerSchema, await request('/ask', json('POST',{materialId,question,requestId}),120000));
    if (answer.selectedScope.some(s => s.materialId !== materialId || s.versionId !== versionId)) throw new ApiError('回答范围与当前材料版本不一致，已停止展示。');
    return answer;
  },
  askCourse: async (courseId: string, question: string, materials: Material[], requestId: string) => validateAnswer(parse(AnswerSchema, await request(`/courses/${id(courseId)}/ask`,json('POST',{question,requestId,materialScope:materials.map(({materialId,versionId,title})=>({materialId,versionId,title}))}),120000)), materials),
  learnStatus: async () => parse(LearnStatusSchema, await request('/learn/status')),
  semesters: async () => parse(z.object({semesters:z.array(z.object({id:z.string(),name:z.string()}))}), await request('/learn/semesters')),
  courses: async (semesterId: string) => parse(z.object({courses:z.array(CourseSchema)}), await request(`/learn/courses?semesterId=${id(semesterId)}`)),
  files: async (courseId: string) => parse(z.object({files:z.array(CourseFileSchema),complete:z.boolean(),warnings:z.array(z.string())}), await request(`/learn/courses/${id(courseId)}/files`)),
  courseMaterials: async (courseId: string) => parse(z.object({course:CourseSchema,materials:z.array(MaterialSchema),warnings:z.array(z.string())}), await request(`/courses/${id(courseId)}/materials`)),
  imports: async (courseId: string) => parse(z.object({batches:z.array(ImportBatchSchema)}), await request(`/learn/imports?courseId=${id(courseId)}`)),
  startImport: async (courseId: string, fileIds: string[], requestId: string) => parse(ImportBatchSchema, await request('/learn/imports',json('POST',{courseId,fileIds,requestId}))),
  importBatch: async (batchId: string) => parse(ImportBatchSchema, await request(`/learn/imports/${id(batchId)}`)),
  retryImport: async (batchId: string, itemIds: string[]) => parse(ImportBatchSchema, await request(`/learn/imports/${id(batchId)}/retry`,json('POST',{itemIds}))),
  getBoard: async (courseId: string) => { const b = parse(BoardSchema, await request(`/courses/${id(courseId)}/board`)); if (b.courseId !== courseId) throw new ApiError('白板课程不匹配'); return b; },
  saveBoard: async (board: Board) => { const b = parse(BoardSchema, await request(`/courses/${id(board.courseId)}/board`,json('PUT',board))); if (b.courseId !== board.courseId) throw new ApiError('白板课程不匹配'); return b; },
  fileUrl: (materialId: string, page = 1) => `/api/materials/${id(materialId)}/file#page=${page}`,
};
