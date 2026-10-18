import { expect, test, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:8018';
const titles = ['电荷', '电压', '储能'];
const state = async (page: Page) => (await page.request.get(`${fixture}/__fixture__/state`)).json();
const board = async (page: Page) => (await page.request.get(`${fixture}/api/courses/course-a/board`)).json();

async function seed(page: Page, withNodes = true) {
  await page.request.get(`${fixture}/__fixture__/reset`);
  const current = await state(page);
  const time = new Date().toISOString();
  const cards = titles.map((title, index) => ({ id: `card-${index}`, courseId: 'course-a', title, body: `${title}的个人学习解释。保留原卡片及其复习状态。`, origin: 'manual', sourceRefs: [], reviewStatus: 'to_review', createdAt: time, updatedAt: time }));
  await page.request.put(`${fixture}/api/state`, { data: { ...current, activeCourseId: 'course-a', cards } });
  if (withNodes) {
    const currentBoard = await board(page);
    await page.request.put(`${fixture}/api/courses/course-a/board`, { data: { ...currentBoard, nodes: cards.map((card, index) => ({ id: `node-${index}`, cardId: card.id, x: 24 + index * 270, y: 24 })), edges: [{ id: 'edge-0', source: 'node-0', target: 'node-1', label: '影响' }, { id: 'edge-1', source: 'node-1', target: 'node-2', label: '决定' }] } });
  }
  await page.goto('/#study');
}

async function showBoard(page: Page) {
  const reading = page.getByRole('tab', { name: '阅读材料', exact: true });
  if (await reading.isVisible()) await reading.click();
  if (!await page.locator('.board-container').isVisible()) await page.getByRole('button', { name: '课程白板', exact: true }).click();
  await expect(page.locator('.whiteboard-viewport')).toBeVisible();
}

async function showCards(page: Page) {
  const assistant = page.getByRole('tab', { name: /学习助手/ });
  if (await assistant.isVisible()) await assistant.click();
  await page.getByRole('tab', { name: /我的理解/ }).click();
}

async function expectFullCanvas(page: Page) {
  await expect(page.getByRole('dialog', { name: '全屏课程白板', exact: true })).toBeVisible();
  await expect.poll(async () => page.locator('.whiteboard-viewport').evaluate(element => {
    const root = element.getBoundingClientRect();
    const viewport = element.querySelector('.board-scroll')!.getBoundingClientRect();
    const canvas = element.querySelector('.board-canvas')!.getBoundingClientRect();
    return root.width >= innerWidth - 2 && root.height >= innerHeight - 2 && Math.abs(root.x) <= 1 && Math.abs(root.y) <= 1 && viewport.width >= innerWidth - 2 && viewport.height >= innerHeight * .74 && canvas.width >= viewport.width - 2 && canvas.height >= viewport.height - 2;
  })).toBe(true);
  // Fit is expected to expose every seeded card, not merely enlarge an outer panel.
  await expect.poll(async () => page.locator('.whiteboard-viewport').evaluate(element => {
    const viewport = element.querySelector('.board-scroll')!.getBoundingClientRect();
    return [...element.querySelectorAll('.board-node')].every(node => {
      const bounds = node.getBoundingClientRect();
      return bounds.left >= viewport.left - 2 && bounds.top >= viewport.top - 2 && bounds.right <= viewport.right + 2 && bounds.bottom <= viewport.bottom + 2;
    });
  })).toBe(true);
}

test('native fullscreen fills viewport and returns to the board toolbar', async ({ page }, info) => {
  await seed(page);
  await showBoard(page);
  const fullscreenButton = page.getByRole('button', { name: '全屏白板', exact: true });
  await fullscreenButton.scrollIntoViewIfNeeded();
  const toolbar = await page.locator('.whiteboard-canvas-toolbar').boundingBox();
  const canvasViewport = await page.getByLabel('白板画布视口', { exact: true }).boundingBox();
  expect(Math.abs(canvasViewport!.y - toolbar!.y - toolbar!.height)).toBeLessThanOrEqual(2);
  const pageOverflow = await page.evaluate(() => document.body.style.overflow);
  await fullscreenButton.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('whiteboard-viewport') || false)).toBe(true);
  await expectFullCanvas(page);
  const fit = page.getByRole('button', { name: '适合全部', exact: true });
  await expect(fit).toHaveAttribute('aria-pressed', 'true');
  const handle = page.getByRole('button', { name: '移动 电荷', exact: true });
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(fit).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await board(page)).nodes[0].x).toBe(44);
  await fit.click();
  await expectFullCanvas(page);
  await page.screenshot({ path: `test-results/whiteboard-fullscreen-${info.project.name}.png` });
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(fullscreenButton).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(pageOverflow);
  await expect(page.locator('.whiteboard-viewport')).not.toHaveClass(/is-fullscreen/);
});

test('fallback fullscreen escapes clipped ancestors and Escape restores the page', async ({ page }, info) => {
  await page.addInitScript(() => { Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: () => Promise.reject(new Error('Fullscreen unavailable in this test')) }); });
  await seed(page);
  await showBoard(page);
  // Reproduce ancestors that used to confine a fixed fullscreen element to a small panel.
  await page.addStyleTag({ content: '.board-container { transform: translateZ(0); contain: paint; overflow: hidden; max-height: 600px; }' });
  await page.getByRole('button', { name: '全屏白板', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '全屏白板', exact: true }).click();
  await expectFullCanvas(page);
  expect(await page.evaluate(() => document.fullscreenElement)).toBe(null);
  await page.screenshot({ path: `test-results/whiteboard-fallback-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('.whiteboard-viewport')).not.toHaveClass(/is-fullscreen/);
  await expect(page.getByRole('button', { name: '全屏白板', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect((await board(page)).nodes).toHaveLength(3);
});

test('cards can be added next to their content, removed by selection, and restored without losing cards', async ({ page }, info) => {
  await seed(page, false);
  await showCards(page);
  for (const [index, title] of titles.entries()) {
    const article = page.locator('.study-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await article.getByRole('button', { name: `把卡片添加到白板 ${title}`, exact: true }).click();
    await expect.poll(async () => (await board(page)).nodes.length).toBe(index + 1);
    await showCards(page);
    await expect(article.getByRole('button', { name: `${title} 已在白板中`, exact: true })).toBeDisabled();
  }
  const current = await board(page);
  await page.request.put(`${fixture}/api/courses/course-a/board`, { data: { ...current, edges: [{ id: 'new-edge-0', source: current.nodes[0].id, target: current.nodes[1].id, label: '影响' }, { id: 'new-edge-1', source: current.nodes[1].id, target: current.nodes[2].id, label: '决定' }] } });
  await page.reload();
  await showCards(page);
  await page.getByRole('checkbox', { name: '选择移出白板 电压', exact: true }).check();
  await page.screenshot({ path: `test-results/whiteboard-card-actions-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '移出选定卡片', exact: true }).click();
  await expect.poll(async () => (await board(page)).nodes.length).toBe(2);
  expect((await board(page)).edges).toHaveLength(0);
  expect((await state(page)).cards).toHaveLength(3);
  await page.reload();
  await showCards(page);
  await expect(page.getByRole('button', { name: '把卡片添加到白板 电压', exact: true })).toBeEnabled();
  await page.locator('.cards-board-toolbar').getByRole('button', { name: '全部移出', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '将全部卡片移出白板？', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '继续编辑', exact: true }).click();
  expect((await board(page)).nodes).toHaveLength(2);
  await page.locator('.cards-board-toolbar').getByRole('button', { name: '全部移出', exact: true }).click();
  await confirm.getByRole('button', { name: '全部移出', exact: true }).click();
  await expect.poll(async () => (await board(page)).nodes.length).toBe(0);
  await page.reload();
  await showBoard(page);
  await expect(page.locator('.board-node')).toHaveCount(0);
  expect((await state(page)).cards).toHaveLength(3);
});

test('fullscreen selection and clear remove incident edges and preserve cards after reload', async ({ page }) => {
  await seed(page);
  await showBoard(page);
  await page.getByRole('button', { name: '全屏白板', exact: true }).click();
  await expectFullCanvas(page);
  await page.getByRole('checkbox', { name: '选择白板卡片 电压', exact: true }).check();
  await page.getByRole('button', { name: '移出选定（1）', exact: true }).click();
  await expect.poll(async () => (await board(page)).nodes.length).toBe(2);
  expect((await board(page)).edges).toHaveLength(0);
  await page.locator('.whiteboard-selection-tools').getByRole('button', { name: '全部移出', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '从白板移出全部卡片？', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expectFullCanvas(page);
  expect((await board(page)).nodes).toHaveLength(2);
  await page.locator('.whiteboard-selection-tools').getByRole('button', { name: '全部移出', exact: true }).click();
  await confirm.getByRole('button', { name: '确认全部移出', exact: true }).click();
  await expect.poll(async () => (await board(page)).nodes.length).toBe(0);
  expect((await state(page)).cards).toHaveLength(3);
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await page.reload();
  await showBoard(page);
  await expect(page.locator('.board-node')).toHaveCount(0);
  expect((await board(page)).edges).toHaveLength(0);
  expect((await state(page)).cards.map((card: { title: string }) => card.title)).toEqual(titles);
});

test('save and add waits for card persistence before creating a node', async ({ page }) => {
  await seed(page, false);
  await showCards(page);
  await page.getByRole('button', { name: '手写卡片', exact: true }).click();
  await page.getByLabel('卡片标题', { exact: true }).fill('新卡片');
  await page.getByLabel('我的理解', { exact: true }).fill('卡片与白板的保存不能互相抢占。');
  await page.getByRole('button', { name: '保存并加入白板', exact: true }).click();
  await expect.poll(async () => (await state(page)).cards.length).toBe(4);
  await expect.poll(async () => (await board(page)).nodes.length).toBe(1);
  const newCard = (await state(page)).cards.find((card: { title: string }) => card.title === '新卡片');
  expect((await board(page)).nodes[0].cardId).toBe(newCard.id);
  await page.reload();
  await showBoard(page);
  await expect(page.locator('.board-node')).toContainText('新卡片');
});

test('failed card save never creates an orphan board node', async ({ page }) => {
  await seed(page, false);
  await showCards(page);
  await page.request.get(`${fixture}/__fixture__/fail-save?enabled=1`);
  const boardWrites: string[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith('/api/courses/course-a/board')) boardWrites.push(request.postData() || ''); });
  await page.getByRole('button', { name: '手写卡片', exact: true }).click();
  await page.getByLabel('卡片标题', { exact: true }).fill('失败草稿');
  await page.getByLabel('我的理解', { exact: true }).fill('服务端保存失败时不应上板。');
  await page.getByRole('button', { name: '保存并加入白板', exact: true }).click();
  await expect(page.getByText('保存未成功 · 草稿已保留', { exact: true })).toBeVisible();
  expect((await state(page)).cards).toHaveLength(3);
  expect((await board(page)).nodes).toHaveLength(0);
  expect(boardWrites).toHaveLength(0);
  await page.request.get(`${fixture}/__fixture__/fail-save?enabled=0`);
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect.poll(async () => (await state(page)).cards.length).toBe(4);
  // A failed save clears the one-shot add intent; retrying storage alone is safe.
  expect((await board(page)).nodes).toHaveLength(0);
  await showCards(page);
  await page.getByRole('button', { name: '把卡片添加到白板 失败草稿', exact: true }).click();
  await expect.poll(async () => (await board(page)).nodes.length).toBe(1);
});
