import { test, expect } from '@playwright/test';
// This suite deliberately uses a visibly marked, separate interface fixture.
// @ts-expect-error JS test helper has no declaration file.
import { runStudyFlow } from '../scripts/ui-flow.mjs';

test('learning flow preserves citations, drafts, review, retry and export (fixture only)', async ({ page }) => {
  await runStudyFlow(page, 'D');
});

test('actual routes, keyboard tabs and default API errors remain visible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const hash of ['', '#home', '#how-it-works', '#study', '#study/guide']) {
    await page.goto(`http://127.0.0.1:4173/${hash}`, { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    if (hash.startsWith('#study')) {
      await expect(page.getByRole('heading', { name: '学习空间', exact: true })).toBeVisible();
      if (hash === '#study') {
        await page.locator('.skip-link').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#reader-view')).toBeFocused();
        expect(new URL(page.url()).hash).toBe('#study');
      }
      const failure = page.getByRole('alert').filter({ hasText: '学习服务未连接' });
      if (await failure.count()) {
        await expect(failure).toContainText(/HTTP|无法连接|超时|接口数据/);
        await expect(page.getByLabel('本次目标', { exact: true })).toBeDisabled();
        await expect(failure.getByRole('button', { name: '重新连接' })).toBeEnabled();
      }
      if (page.viewportSize()!.width < 900) {
        await page.getByRole('tab', { name: '阅读材料' }).focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.getByRole('tab', { name: /学习助手/ })).toBeFocused();
        await page.keyboard.press('Home');
        await expect(page.getByRole('tab', { name: '阅读材料' })).toBeFocused();
      }
    }
    if (hash === '#how-it-works') {
      expect(await page.locator('#how-it-works').evaluate(e => Math.abs(e.getBoundingClientRect().top) < 500)).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test('materials, processing/failure, PDF retry, history scope, recovery and long content (fixture only)', async ({ page }) => {
  const width=page.viewportSize()!.width;
  const mobile=width<900;
  const empty={goal:'',nextStep:'',readingPosition:null,cards:[]};
  await page.request.get('http://127.0.0.1:8011/__fixture__/fail-save?enabled=0');
  await page.request.put('http://127.0.0.1:8011/api/state',{data:empty});
  await page.goto('http://127.0.0.1:4174/#study');
  await expect(page.locator('.fixture-banner')).toBeVisible();
  if(width<1200) await page.getByRole('button',{name:/^材料/}).click();
  const file=page.getByLabel('上传课程材料');
  await file.setInputFiles({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('text')});
  await expect(page.getByRole('alert').filter({hasText:'上传失败'})).toContainText('请选择 PDF');
  await page.route('**/api/materials',async route=>{await new Promise(r=>setTimeout(r,800));await route.continue();});
  await file.setInputFiles('../docs/acceptance/capacitors-self-authored.pdf');
  await expect(page.locator('.material-pending')).toContainText('解析中');
  await expect(page.getByRole('button',{name:'上传材料',exact:true}).first()).toBeDisabled();
  await page.screenshot({path:`../docs/screenshots/ui-refactor/D/upload-processing-fixture-${width}.png`,fullPage:true});
  await expect(page.locator('canvas')).toBeVisible();
  await page.unroute('**/api/materials');
  const first=await page.getByRole('list',{name:'本次会话材料'}).getByRole('button').first().getAttribute('aria-current');
  expect(first).toBe('true');
  await page.getByLabel('文件页序',{exact:true}).fill('2');
  await file.setInputFiles('../docs/acceptance/capacitors-self-authored.pdf');
  await expect(page.getByRole('list',{name:'本次会话材料'}).getByRole('button')).toHaveCount(2);
  await page.getByRole('list',{name:'本次会话材料'}).getByRole('button').first().click();
  await expect(page.getByLabel('文件页序',{exact:true})).toHaveValue('2');
  await file.setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('broken')});
  await expect(page.getByRole('alert').filter({hasText:'上传失败'})).toContainText('HTTP 422');
  await expect(page.getByRole('list',{name:'本次会话材料'}).getByRole('button')).toHaveCount(2);
  if(width<1200) await page.getByRole('button',{name:/^材料/}).click();
  await page.getByRole('button',{name:'专注阅读',exact:true}).click();
  await expect(page.locator('.material-sidebar')).not.toBeVisible();
  await page.getByRole('button',{name:'退出专注',exact:true}).click();
  if(mobile) await page.getByRole('tab',{name:/学习助手/}).click();
  // Capture a real pending request against the fixture, not a fabricated success.
  await page.route('**/api/ask',async route=>{await new Promise(r=>setTimeout(r,800));await route.continue();});
  await page.getByLabel('向材料提问').fill('电容储能在哪里？');
  await page.getByRole('button',{name:'发送问题',exact:true}).click();
  await expect(page.locator('.answer-loading')).toBeVisible();
  await page.screenshot({path:`../docs/screenshots/ui-refactor/D/answer-loading-fixture-${width}.png`,fullPage:true});
  await expect(page.getByRole('button',{name:'正在提问'})).toBeDisabled();
  await expect(page.locator('.answer-segment')).toBeVisible();
  await page.unroute('**/api/ask');
  // An explicit HTTP error keeps the PDF error state and an actionable retry.
  const savedState=await (await page.request.get('http://127.0.0.1:8011/__fixture__/state')).json();
  let failPdf=true;
  await page.route('**/api/materials/*/file',async route=>{if(failPdf) await route.fulfill({status:500,body:'fixture PDF failure'});else await route.continue();});
  await page.reload();
  await expect(page.getByRole('alert').filter({hasText:'阅读版未能显示'})).toContainText('500');
  failPdf=false;
  await page.getByRole('alert').filter({hasText:'阅读版未能显示'}).getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.unroute('**/api/materials/*/file');
  // Seed explicit fixture state to inspect historical citations and extremes.
  const longTitle='非常长的课程讲义文件名与材料版本说明'.repeat(10)+'.pdf';
  const source={id:'old-ref',materialId:'old-material',versionId:'old-v1',title:longTitle,pageStart:3,pageEnd:3,quote:'这是一段用于界面压力测试的历史引用摘录。'.repeat(40)};
  const longState={...savedState,cards:[{id:'long-card',title:longTitle,body:'长段落、公式及长单词的换行检查。'.repeat(80)+'A'.repeat(300),sourceRefs:[source],reviewStatus:'to_review',createdAt:'2026-10-18T06:00:00Z',updatedAt:'2026-10-18T06:00:00Z'}]};
  await page.request.put('http://127.0.0.1:8011/api/state',{data:longState});
  await page.reload();
  if(mobile) await page.getByRole('tab',{name:/学习助手/}).click();
  await page.getByRole('tab',{name:/我的理解/}).click();
  await page.locator('.sources-disclosure summary').click();
  await page.locator('.source-chip').click();
  await expect(page.locator('.old-source-bar')).toBeVisible();
  await expect(page.getByLabel('文件页序',{exact:true})).toHaveValue('3');
  await expect(page.locator('canvas[aria-label="原 PDF 文件第 3 页"]')).toBeVisible();
  expect((await (await page.request.get('http://127.0.0.1:8011/__fixture__/state')).json()).readingPosition.materialId).toBe(savedState.readingPosition.materialId);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:`../docs/screenshots/ui-refactor/D/history-long-fixture-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'返回当前材料'}).click();
  await expect(page.getByLabel('文件页序',{exact:true})).toHaveValue('2');
  // The local unconfirmed draft must require a recovery choice before writing.
  await page.evaluate(state=>localStorage.setItem('zhiye:pending-state:v1',JSON.stringify({...state,goal:'需要恢复的本机目标'})),longState);
  await page.reload();
  await expect(page.getByRole('status').filter({hasText:'发现未保存的本机修改'})).toBeVisible();
  await expect(page.getByLabel('本次目标',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'恢复并保存草稿'}).click();
  await expect(page.getByLabel('本次目标',{exact:true})).toHaveValue('需要恢复的本机目标');
  await expect(page.locator('.save-indicator')).toContainText('已保存至接口测试桩');
});

test('visible states meet automated WCAG AA checks', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const check = async () => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({html:n.html,summary:n.failureSummary})) }))).toEqual([]);
  };
  await page.goto('http://127.0.0.1:4173/#home', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 14px Inter', 'AI'))).toBe(true);
  await check();
  await page.goto('http://127.0.0.1:4173/#study', { waitUntil: 'networkidle' });
  await check();
  await page.request.get('http://127.0.0.1:8011/__fixture__/fail-save?enabled=0');
  await page.request.put('http://127.0.0.1:8011/api/state',{data:{goal:'',nextStep:'',readingPosition:null,cards:[]}});
  await page.goto('http://127.0.0.1:4174/#study', { waitUntil: 'networkidle' });
  await check();
  if(page.viewportSize()!.width<900) await page.getByRole('tab',{name:/学习助手/}).click();
  await page.getByRole('tab',{name:/我的理解/}).click();
  await page.getByRole('button',{name:'手写卡片',exact:true}).click();
  await page.getByLabel('卡片标题').fill('可访问性检查');
  await check();
  await page.getByRole('button',{name:'放弃草稿',exact:true}).click();
  await check();
  await page.screenshot({path:`../docs/screenshots/ui-refactor/D/dialog-fixture-${page.viewportSize()!.width}.png`,fullPage:true});
  await page.getByRole('dialog').getByRole('button',{name:'确认放弃'}).click();
  await page.getByLabel('上传课程材料').setInputFiles('../docs/acceptance/capacitors-self-authored.pdf');
  await page.getByRole('tab',{name:'材料问答'}).click();
  await page.getByLabel('向材料提问').fill('电容储能在哪里？');
  await page.getByRole('button',{name:'发送问题',exact:true}).click();
  await expect(page.locator('.answer-segment')).toBeVisible();
  await page.locator('.sources-disclosure summary').first().click();
  await check();
  await page.getByRole('button',{name:'新建理解卡片'}).click();
  await page.getByLabel('我的理解',{exact:true}).fill('用自己的话解释电容储能。');
  await page.getByRole('button',{name:'保存我的理解'}).click();
  await expect(page.locator('.study-card')).toHaveCount(1);
  await check();
});
