import { z } from 'zod';
import { AnswerSchema, MaterialSchema, StateSchema, type StudyState } from './domain';

export class ApiError extends Error {}
async function request(path: string, init: RequestInit = {}, timeout = 20000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`/api${path}`, { ...init, signal: controller.signal });
    const raw = await res.text();
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new ApiError(`服务未返回 JSON（HTTP ${res.status}），请检查后端与 /api 代理。`); }
    if (!res.ok) {
      const body = data as Record<string, unknown> | null;
      const detail = body && (body.error || body.detail || body.message);
      throw new ApiError(typeof detail === 'string' ? detail : `请求失败（HTTP ${res.status}），请稍后重试。`);
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
  if (!result.success) throw new ApiError(`接口数据不符合约定：${result.error.issues[0]?.message || '字段缺失'}。请检查 docs/api-contract.md。`);
  return result.data;
}
export const api = {
  health: () => request('/health'),
  getState: async () => parse(StateSchema, await request('/state')),
  saveState: async (state: StudyState) => {
    const result = await request('/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    if (!result || typeof result !== 'object' || (result as { saved?: unknown }).saved !== true)
      throw new ApiError('保存接口缺少 saved: true 确认；草稿已保留，请与 B 核对接口。');
  },
  upload: async (file: File) => {
    const body = new FormData(); body.append('file', file);
    return parse(MaterialSchema, await request('/materials', { method: 'POST', body }, 90000));
  },
  ask: async (materialId: string, versionId: string, question: string) => {
    const answer = parse(AnswerSchema, await request('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialId, question }) }, 120000));
    if (answer.selectedScope.materialId !== materialId || answer.selectedScope.versionId !== versionId)
      throw new ApiError('回答范围与当前材料版本不一致，已停止展示。请重新提问。');
    return answer;
  },
  fileUrl: (id: string, page = 1) => `/api/materials/${encodeURIComponent(id)}/file#page=${page}`,
};
