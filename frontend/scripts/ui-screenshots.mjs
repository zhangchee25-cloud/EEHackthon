// Capture actual pages without intercepting APIs or injecting success data.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const stage = process.argv[2] || 'D';
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4173';
const output = resolve(import.meta.dirname, `../../docs/screenshots/ui-refactor/${stage}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true});
const report = [];
try {
  for (const [width,height] of [[1440,900],[768,1024],[375,812]]) {
    const context = await browser.newContext({viewport: {width,height}, reducedMotion: 'reduce', deviceScaleFactor: 1});
    for (const [name,hash] of [['home','#home'],['study','#study'],['guide','#study/guide']]) {
      const page = await context.newPage();
      const errors = []; const failures = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if(r.status() >= 400) failures.push({url:r.url(),status:r.status()}); });
      await page.goto(`${base}/${hash}`, {waitUntil:'networkidle'});
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});
      const layout = await page.evaluate(() => ({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,headerHeight:document.querySelector(location.hash.startsWith('#study')?'.app-header':'.landing-header')?.getBoundingClientRect().height,readerTop:document.querySelector('.reader')?.getBoundingClientRect().top,fixture:!!document.querySelector('.fixture-banner'),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)}));
      report.push({name,width,height,...layout,errors,failures});
      if(name === 'study' && width < 900) {
        const tabs=page.getByRole('tablist',{name:'工作区视图'});
        await tabs.getByRole('tab',{name:'阅读材料'}).focus();
        await page.keyboard.press('ArrowRight');
        if(await tabs.getByRole('tab',{name:/学习助手/}).getAttribute('aria-selected') !== 'true') throw Error('Mobile tabs keyboard failed');
        await page.screenshot({path:`${output}/assistant-${width}.png`,fullPage:true});
      }
      await page.close();
    }
    await context.close();
  }
} finally {await browser.close();}
await writeFile(`${output}/report.json`,JSON.stringify({browser:'Playwright / Chrome',base,stage,pages:report},null,2)+'\n');
console.log(JSON.stringify(report.map(x=>({name:x.name,width:x.width,overflow:x.scrollWidth>x.viewport,errors:x.errors,apiFailures:x.failures.length})),null,2));
if(report.some(x=>x.errors.length || x.scrollWidth>x.viewport)) process.exitCode=1;
