// Isolated interface fixture for A's UI checks. No model, PDF parsing or durable storage.
// Never use this process as backend/ or as evidence that the real D0 chain passed.
import { createServer } from 'node:http';
import { createTestPdf } from './create-test-pdf.mjs';
const port = Number(process.env.FIXTURE_PORT || 8011);
let state = { goal: '', nextStep: '', readingPosition: null, cards: [] };
let failSave = false;
const pdf = createTestPdf();
const server = createServer(async (req, res) => {
  const json = (data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/health') return json({ status: 'ok', mode: 'test-fixture' });
  if (url.pathname === '/__fixture__/fail-save') { failSave = url.searchParams.get('enabled') === '1'; return json({ failSave }); }
  if (url.pathname === '/__fixture__/state') return json(state);
  if (url.pathname === '/api/state' && req.method === 'GET') return json(state);
  if (url.pathname === '/api/state' && req.method === 'PUT') {
    if (failSave) return json({ error: '接口测试：磁盘保存失败' }, 503);
    let raw = ''; for await (const chunk of req) raw += chunk;
    state = JSON.parse(raw); return json({ saved: true });
  }
  if (/^\/api\/materials\/[^/]+\/file$/.test(url.pathname)) {
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'Content-Disposition': 'inline; filename="capacitors-self-authored.pdf"' }); return res.end(pdf);
  }
  if (url.pathname === '/api/materials' && req.method === 'POST') {
    let raw = ''; for await (const chunk of req) raw += chunk.toString('latin1');
    if (raw.includes('broken.pdf')) return json({ error: '接口测试：文件损坏，无法提取文本。' }, 422);
    return json({ materialId: `fixture-${Date.now()}`, versionId: 'fixture-v1', title: 'capacitors-self-authored.pdf', status: 'ready', pageCount: 3, error: null });
  }
  if (url.pathname === '/api/ask') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const { materialId, question } = JSON.parse(raw);
    if (question.includes('失败')) return json({ error: '接口测试：模型请求失败，请重试。' }, 502);
    const selectedScope = { materialId, versionId: 'fixture-v1' };
    if (question.includes('量子')) return json({ answerSegments: [], citations: [], selectedScope, limitations: ['接口测试桩：这份材料不包含量子计算，依据不足。'] });
    return json({ answerSegments: [{ id: 'segment-1', text: `【接口测试桩，非真实模型回答】关于“${question}”：电容的能量储存在电场中，储能公式为 U = 1/2 C V²。`, citationIds: ['source-1'] }], citations: [{ id: 'source-1', materialId, versionId: 'fixture-v1', title: 'capacitors-self-authored.pdf', pageStart: 2, pageEnd: 2, quote: 'Energy is stored in the electric field.' }], selectedScope, limitations: ['仅验证前端交互；模型调用与真实引用核验待 B 联调。'] });
  }
  return json({ error: 'Test fixture endpoint not found' }, 404);
});
server.listen(port, '127.0.0.1', () => console.log(`INTERFACE TEST FIXTURE ONLY: http://127.0.0.1:${port}`));
