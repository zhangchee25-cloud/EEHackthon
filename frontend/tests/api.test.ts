import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api';
import { initialState } from '../src/domain';
const respond = (data: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status })));
afterEach(() => vi.unstubAllGlobals());
describe('backend failure handling', () => {
  it('never accepts an empty/malformed state as a blank saved workspace', async () => {
    respond({}); await expect(api.getState()).rejects.toThrow('接口数据不符合约定');
  });
  it('requires explicit durable save acknowledgement', async () => {
    respond({ ok: true }); await expect(api.saveState(initialState)).rejects.toThrow('接口数据不符合约定');
    respond(initialState); await expect(api.saveState(initialState)).rejects.toThrow('下一版本');
    respond({...initialState,revision:1}); await expect(api.saveState(initialState)).resolves.toEqual({...initialState,revision:1});
  });
  it('preserves a readable backend error', async () => {
    respond({ error: '材料未提取到文字，请上传文本 PDF' }, 422);
    await expect(api.upload(new File(['broken'], 'bad.pdf'))).rejects.toThrow('材料未提取到文字');
  });
  it('rejects a response from a different material rather than showing it', async () => {
    respond({ supported:false, answerSegments: [], citations: [], selectedScope: [{ materialId: 'other', versionId: 'v1',title:'other.pdf' }], limitations: ['insufficient'] });
    await expect(api.ask('mat', 'v1', 'Question')).rejects.toThrow('回答范围与当前材料版本不一致');
  });
  it('gives a proxy diagnostic for HTML error pages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 })));
    await expect(api.getState()).rejects.toThrow('服务未返回 JSON');
  });
  it('keeps JSON HTTP 500 visible and allows a subsequent real retry', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: '模型不可用' }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(initialState), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const error = await api.getState().catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.message).toContain('模型不可用');
    expect(error.message).toContain('HTTP 500');
    await expect(api.getState()).resolves.toEqual(initialState);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

});

it('retains structured conflict details for recovery UI', async () => {
  respond({error:{code:'STATE_CONFLICT',message:'状态已在另一个窗口更新',details:{currentRevision:8}}},409);
  const error=await api.saveState(initialState).catch(e=>e);
  expect(error).toBeInstanceOf(ApiError);expect(error.status).toBe(409);expect(error.code).toBe('STATE_CONFLICT');expect(error.details).toEqual({currentRevision:8});expect(error.message).toContain('状态已在另一个窗口更新');
});
