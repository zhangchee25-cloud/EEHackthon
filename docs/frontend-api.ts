/** Copy into frontend/src/api.ts. Never put backend credentials here. */
export interface Citation {
  id: string; materialId: string; versionId: string; title: string;
  pageStart: number; pageEnd: number; quote: string;
}
export interface Material {
  materialId: string; versionId: string; title: string;
  status: 'processing' | 'ready' | 'failed'; pageCount: number;
  warnings: string[]; error: string | null; createdAt: string;
  fileUrl: string; deduplicated?: boolean;
}
export interface Card {
  id: string; title: string; body: string; sourceRefs: Citation[];
  reviewStatus: 'to_review' | 'self_checked'; createdAt?: string;
  updatedAt?: string; selfCheckedAt?: string | null;
}
export interface WorkspaceState {
  revision: number; goal: string; nextStep: string;
  readingPosition: { materialId: string; versionId: string; page: number } | null;
  cards: Card[]; updatedAt?: string | null;
}
export interface Answer {
  supported: boolean; answerId: string; question: string;
  answerSegments: { id: string; text: string; citationIds: string[] }[];
  citations: Citation[];
  selectedScope: { materialId: string; versionId: string; title: string }[];
  limitations: string[]; model: string; createdAt: string;
  usage: Record<string, number>;
}
export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, status: number,
    details?: Record<string, unknown>) {
    super(message); this.code = code; this.status = status; this.details = details;
  }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch('/api' + path, options); }
  catch { throw new ApiError('NETWORK_ERROR', '无法连接本机后端，请保留输入并检查服务。', 0); }
  let payload: any;
  try { payload = await response.json(); }
  catch { throw new ApiError('INVALID_RESPONSE', '接口没有返回 JSON，请检查前端代理。', response.status); }
  if (!response.ok) throw new ApiError(payload.error?.code || 'REQUEST_FAILED',
    payload.error?.message || '请求失败，请保留输入重试。', response.status, payload.error?.details);
  return payload as T;
}
export const api = {
  health: () => request<{ status: string; mode: string; modelConfigured: boolean;
    missingSettings: string[]; model: string | null; apiStyle: string; notice: string }>('/health'),
  materials: () => request<{ materials: Material[] }>('/materials'),
  upload: (file: File) => {
    const form = new FormData(); form.append('file', file);
    return request<Material>('/materials', { method: 'POST', body: form });
  },
  ask: (materialId: string, question: string, requestId = 'q_' + crypto.randomUUID()) =>
    request<Answer>('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialId, question, requestId }) }),
  state: () => request<WorkspaceState>('/state'),
  saveState: (state: WorkspaceState) => request<WorkspaceState>('/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }),
  exportUrl: '/api/export',
  citationUrl: (citation: Citation) => '/api/materials/' +
    encodeURIComponent(citation.materialId) + '/file#page=' + citation.pageStart,
};
export function cardDraft(answer: Answer): Card {
  if (!answer.supported) throw new Error('材料不足时不能创建回答卡片。');
  const used = new Set(answer.answerSegments.flatMap(s => s.citationIds));
  return { id: 'card_' + crypto.randomUUID(), title: answer.question.slice(0, 200),
    body: answer.answerSegments.map(s => s.text).join(String.fromCharCode(10, 10)),
    sourceRefs: answer.citations.filter(c => used.has(c.id)).map(c => ({ ...c })),
    reviewStatus: 'to_review' };
}
// Show cardDraft in an editor; save only after the user edits and confirms.
// Await saveState and adopt its returned revision before the next save.
