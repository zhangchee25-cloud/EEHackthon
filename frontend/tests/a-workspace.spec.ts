import {readFile} from 'node:fs/promises';
import {test,expect,type Page} from '@playwright/test';
const fixture='http://127.0.0.1:8012';

test('PDF rendering settles and keeps the previous page during resize', async ({page:p}) => {
 await p.getByLabel('上传课程 PDF').setInputFiles('../docs/acceptance/capacitors-self-authored.pdf');
 await expect(p.locator('.canvas-host canvas')).toBeVisible();
 // Force an overflowing reader, including on platforms with classic scrollbars.
 await p.addStyleTag({content:'.paper-area {height:320px !important; flex:none !important;}'});
 await expect(p.locator('.pdf-loading')).toHaveCount(0);
 const changes=await p.locator('.canvas-host').evaluate(async host=>{
   let replacements=0, blanks=0;
   const observer=new MutationObserver(()=>{replacements++;if(!host.querySelector('canvas'))blanks++;});
   observer.observe(host,{childList:true});
   const reader=host.closest('.reader') as HTMLElement;
   const original=reader.style.width;
   reader.style.width='90%';
   await new Promise(resolve=>setTimeout(resolve,1200));
   reader.style.width=original;
   await new Promise(resolve=>setTimeout(resolve,1200));
   observer.disconnect();return {replacements,blanks};
 });
 expect(changes.blanks).toBe(0);
 expect(changes.replacements).toBeLessThanOrEqual(4);
 await expect(p.locator('.pdf-loading')).toHaveCount(0);
 await p.getByRole('button',{name:'下一页',exact:true}).click();
 await expect(p.getByRole('img',{name:'原 PDF 文件第 2 页'})).toBeVisible();
});
async function state(p:Page){return (await p.request.get(fixture+'/__fixture__/state')).json();}
async function assistant(p:Page){const t=p.getByRole('tab',{name:/学习助手/});if(await t.isVisible())await t.click();}
async function choose(p:Page,id='course-a'){const d=p.locator('.learn-import');if(!await d.evaluate(e=>(e as HTMLDetailsElement).open))await d.locator('summary').click();await expect(p.getByLabel('课程',{exact:true}).locator(`option[value="${id}"]`)).toHaveCount(1);await p.getByLabel('课程',{exact:true}).selectOption(id);await expect.poll(async()=>(await state(p)).activeCourseId).toBe(id);}
async function card(p:Page,title:string){await assistant(p);await p.getByRole('tab',{name:/我的理解/}).click();await p.getByRole('button',{name:'手写卡片',exact:true}).click();await p.getByLabel('卡片标题').fill(title);await p.getByLabel('我的理解',{exact:true}).fill(title+'：自己的解释');await p.getByRole('button',{name:'保存我的理解',exact:true}).click();await expect.poll(async()=>(await state(p)).cards.some((c:any)=>c.title===title)).toBe(true);}
async function board(p:Page){if(!await p.locator('.board-container').isVisible())await p.getByRole('button',{name:'课程白板',exact:true}).click();}
test.beforeEach(async({page:p})=>{await p.request.get(fixture+'/__fixture__/reset');await p.goto('/#study');await expect(p.locator('.fixture-banner')).toBeVisible();});
test('course import, citations, cards, board persistence and course isolation',async({page:p},info)=>{
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await choose(p);
 await expect(p.getByText('暂不支持视频',{exact:false})).toBeVisible();await p.getByRole('button',{name:/一键获取并构建知识库/}).click();await expect(p.getByText('已就绪 2 / 4',{exact:true})).toBeVisible({timeout:20000});await expect(p.getByText('登录已失效，请重新连接后重试。')).toBeVisible();
 const pop=p.waitForEvent('popup');await p.getByRole('button',{name:'连接网络学堂',exact:true}).click();const login=await pop;await login.waitForLoadState();await login.close();await p.getByRole('button',{name:'刷新连接状态',exact:true}).click();await p.getByRole('button',{name:'重试失败或待认证项'}).click();await expect(p.getByText('已就绪 4 / 4',{exact:true})).toBeVisible({timeout:20000});
 await assistant(p);await expect(p.getByLabel('提问范围')).toContainText('本课程全部已就绪材料（4）');await p.getByLabel('向材料提问').fill('解释电容储能');await p.getByRole('button',{name:'发送问题',exact:true}).click();await expect(p.locator('.answer-segment')).toBeVisible();
 for(const n of [1,2]){await assistant(p);await p.getByRole('button',{name:new RegExp(`^引用 ${n}，`)}).click();await expect(p.locator('.citation-detail')).toContainText(`讲义${n===1?'一':'二'}.pdf`);await expect(p.locator('.citation-detail a')).toHaveAttribute('href',new RegExp(`course-a-f${n-1}/file#page=${n}`));}
 await assistant(p);await p.getByRole('button',{name:'直接创建卡片',exact:true}).click();await expect.poll(async()=>(await state(p)).cards.length).toBe(1);const generated=(await state(p)).cards[0];expect(generated.origin).toBe('ai');expect(generated.reviewStatus).toBe('to_review');expect(generated.sourceRefs).toHaveLength(4);await expect(p.getByText('AI 生成',{exact:true})).toBeVisible();await p.getByRole('button',{name:'编辑卡片 解释电容储能'}).click();await p.getByLabel('卡片标题').fill('储能理解');await expect(p.getByRole('button',{name:'保存卡片',exact:true})).toBeEnabled();await p.getByRole('button',{name:'保存卡片',exact:true}).click();
 await p.getByRole('button',{name:'标记已自检'}).click();await expect.poll(async()=>(await state(p)).cards[0].reviewStatus).toBe('self_checked');await p.getByRole('button',{name:'编辑卡片 储能理解'}).click();await p.getByLabel('卡片内容',{exact:true}).fill('修订后的解释：电场中储能。');await p.getByRole('button',{name:'保存卡片',exact:true}).click();await expect.poll(async()=>(await state(p)).cards[0].reviewStatus).toBe('to_review');
 await card(p,'电压');await card(p,'电荷');const downloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:'导出 Markdown',exact:true}).click();const download=await downloadPromise;const markdown=await readFile((await download.path())!,'utf8');expect(markdown).toContain('修订后的解释');expect(markdown).toContain('讲义一.pdf');await board(p);
 for(const title of ['储能理解','电压','电荷']){await p.getByLabel('选择上板卡片').selectOption({label:title});await p.getByRole('button',{name:'加入白板',exact:true}).click();await expect(p.getByRole('button',{name:`移动 ${title}`,exact:true})).toBeVisible();}
 await p.getByLabel('连线起点').selectOption({label:'储能理解'});await p.getByLabel('连线终点').selectOption({label:'电压'});await p.getByLabel('连线说明',{exact:true}).fill('依赖');await p.getByRole('button',{name:'连接节点',exact:true}).click();await expect(p.locator('.board-edge-list')).toContainText('依赖');
 const handle=p.getByRole('button',{name:'移动 储能理解',exact:true}),node=p.locator('.board-node').filter({has:handle});const old=await node.evaluate(e=>(e as HTMLElement).style.left);await handle.focus();await p.keyboard.press('ArrowRight');await expect.poll(()=>node.evaluate(e=>(e as HTMLElement).style.left)).not.toBe(old);
 if(info.project.name==='desktop'){const b=await handle.boundingBox();await p.mouse.move(b!.x+20,b!.y+8);await p.mouse.down();await p.mouse.move(b!.x+80,b!.y+48,{steps:5});await p.mouse.up();}await expect(p.locator('.board-heading')).toContainText('白板已保存');
 await p.reload();await expect(p.getByRole('button',{name:'课程白板',exact:true})).toBeVisible();await board(p);await expect(p.locator('.board-node')).toHaveCount(3);await expect(p.locator('.board-edge-list')).toContainText('依赖');
 await p.locator('.board-node').filter({has:p.getByRole('button',{name:'移动 电荷',exact:true})}).getByRole('button',{name:'移除节点'}).click();await expect(p.locator('.board-node')).toHaveCount(2);expect((await state(p)).cards).toHaveLength(3);
 await p.locator('.board-node').filter({has:p.getByRole('button',{name:'移动 电压',exact:true})}).getByRole('button',{name:'打开卡片'}).click();await p.getByLabel('我的理解',{exact:true}).fill('板上同步的新正文');await p.getByRole('button',{name:'保存我的理解',exact:true}).click();const rt=p.getByRole('tab',{name:'阅读材料'});if(await rt.isVisible())await rt.click();await expect(p.locator('.board-node').filter({has:p.getByRole('button',{name:'移动 电压',exact:true})})).toContainText('板上同步的新正文');
 await assistant(p);await p.getByRole('button',{name:'手写卡片',exact:true}).click();await p.getByLabel('卡片标题').fill('课程 A 未保存草稿');await choose(p,'course-b');await assistant(p);await expect(p.locator('.answer-segment')).toHaveCount(0);await expect(p.getByLabel('卡片标题')).toHaveCount(0);await card(p,'另一课程');await choose(p,'course-a');await assistant(p);await expect(p.getByLabel('卡片标题')).toHaveValue('课程 A 未保存草稿');
 const saved=await state(p);expect(saved.cards.filter((c:any)=>c.courseId==='course-a')).toHaveLength(3);expect(saved.cards.filter((c:any)=>c.courseId==='course-b')).toHaveLength(1);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);expect(errors).toEqual([]);await p.screenshot({path:`test-results/a-${info.project.name}.png`,fullPage:true});
});
test('AI cards save unchanged, keep provenance after reload, and direct creation is repeat-safe',async({page:p})=>{
 await p.getByLabel('上传课程 PDF').setInputFiles('../docs/acceptance/capacitors-self-authored.pdf');
 await expect(p.locator('.canvas-host canvas')).toBeVisible();await assistant(p);
 await p.getByLabel('向材料提问').fill('解释电场储能');await p.getByRole('button',{name:'发送问题',exact:true}).click();
 await expect(p.locator('.answer-segment')).toBeVisible();const body=await p.locator('.answer-segment > p').allTextContents();
 await p.getByRole('button',{name:'直接创建卡片',exact:true}).click();await expect.poll(async()=>(await state(p)).cards.length).toBe(1);
 await p.getByRole('tab',{name:/材料问答/}).click();await p.getByRole('button',{name:'直接创建卡片',exact:true}).click();
 expect((await state(p)).cards).toHaveLength(1);
 await p.getByRole('tab',{name:/材料问答/}).click();await p.getByRole('button',{name:'编辑后创建',exact:true}).click();
 await expect(p.getByLabel('卡片内容',{exact:true})).toHaveValue(body.join('\n\n'));
 await expect(p.getByRole('button',{name:'保存卡片',exact:true})).toBeEnabled();await p.getByRole('button',{name:'保存卡片',exact:true}).click();
 await expect.poll(async()=>(await state(p)).cards.length).toBe(2);await p.reload();await assistant(p);await p.getByRole('tab',{name:/我的理解/}).click();
 await expect(p.getByText('AI 生成',{exact:true})).toHaveCount(2);
 for(const c of (await state(p)).cards){expect(c.body).toBe(body.join('\n\n'));expect(c.origin).toBe('ai');expect(c.reviewStatus).toBe('to_review');expect(c.sourceRefs.length).toBeGreaterThan(0);}
});

test('state 503 and 409 preserve local edits for explicit recovery',async({page:p})=>{
 await p.request.get(fixture+'/__fixture__/fail-save?enabled=1');await p.getByLabel('本次目标').fill('磁盘失败保留目标');await p.getByLabel('本次目标').blur();await expect(p.getByText('保存未成功 · 草稿已保留',{exact:true})).toBeVisible();await p.getByLabel('本次目标').fill('连续输入后的最终目标');await p.request.get(fixture+'/__fixture__/fail-save?enabled=0');await p.getByRole('button',{name:'重试保存',exact:true}).click();await expect.poll(async()=>(await state(p)).goal).toBe('连续输入后的最终目标');
 await p.request.get(fixture+'/__fixture__/conflict');await p.getByLabel('本次目标').fill('遇到冲突的本机目标');await p.getByLabel('本次目标').blur();await expect(p.getByRole('button',{name:'重读并选择版本'})).toBeVisible();await p.getByRole('button',{name:'重读并选择版本'}).click();await expect(p.getByText('发现未保存的本机修改',{exact:true})).toBeVisible();await p.getByRole('button',{name:'用本机草稿替换并保存',exact:true}).click();await expect.poll(async()=>(await state(p)).goal).toBe('遇到冲突的本机目标');await p.reload();await expect(p.getByLabel('本次目标')).toHaveValue('遇到冲突的本机目标');
});

test('ten-card board, independent 503 recovery and 409 handling',async({page:p})=>{
 const cards=Array.from({length:10},(_,i)=>({id:`card-${i}`,courseId:'course-a',title:`概念 ${i+1}`,body:`第 ${i+1} 张理解卡片`,sourceRefs:[],reviewStatus:'to_review',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
 const base=await state(p);await p.request.put(fixture+'/api/state',{data:{...base,activeCourseId:'course-a',cards}});await p.reload();await expect(p.getByRole('button',{name:'课程白板',exact:true})).toBeVisible();await board(p);
 for(const c of cards){await p.getByLabel('选择上板卡片').selectOption(c.id);await p.getByRole('button',{name:'加入白板',exact:true}).click();}
 await expect(p.locator('.board-node')).toHaveCount(10);await expect(p.locator('.board-heading')).toContainText('白板已保存');
 await p.request.get(fixture+'/__fixture__/fail-board?enabled=1');await p.getByRole('button',{name:'移动 概念 1',exact:true}).focus();await p.keyboard.press('ArrowDown');await expect(p.getByText('白板保存未成功',{exact:true})).toBeVisible();await p.reload();await board(p);await expect(p.getByText('发现白板本机草稿',{exact:true})).toBeVisible();await p.request.get(fixture+'/__fixture__/fail-board?enabled=0');await p.getByRole('button',{name:'用本机草稿替换并保存',exact:true}).click();await expect(p.locator('.board-heading')).toContainText('白板已保存');
 let b=await (await p.request.get(fixture+'/api/courses/course-a/board')).json();expect(b.nodes).toHaveLength(10);expect(b.nodes[0].y).toBe(44);
 await p.request.get(fixture+'/__fixture__/board-conflict?courseId=course-a');await p.getByRole('button',{name:'移动 概念 1',exact:true}).focus();await p.keyboard.press('ArrowRight');await expect(p.getByRole('button',{name:'重读并选择版本',exact:true})).toBeVisible();await p.getByRole('button',{name:'重读并选择版本',exact:true}).click();await p.getByRole('button',{name:'用本机草稿替换并保存',exact:true}).click();await expect(p.locator('.board-heading')).toContainText('白板已保存');
 b=await (await p.request.get(fixture+'/api/courses/course-a/board')).json();expect(b.nodes[0].x).toBe(44);expect((await state(p)).cards).toHaveLength(10);await p.screenshot({path:`test-results/a-board-${test.info().project.name}.png`,fullPage:true});
});

test('standalone PDF, insufficient evidence and idempotent question retry',async({page:p})=>{
 const ids:string[]=[];
 p.on('request',req=>{if(req.url().endsWith('/api/ask')&&req.method()==='POST')ids.push(req.postDataJSON().requestId);});
 await p.getByLabel('上传课程 PDF').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-broken')});
 // Upload errors are in the material sidebar, which is collapsible on narrow screens.
 if(!await p.getByText('上传失败',{exact:true}).isVisible())await p.getByRole('button',{name:/^材料/}).click();
 await expect(p.getByText('上传失败',{exact:true})).toBeVisible();
 await p.getByLabel('上传课程 PDF').setInputFiles('../docs/acceptance/capacitors-self-authored.pdf');
 await expect(p.getByRole('img',{name:'原 PDF 文件第 1 页'})).toBeVisible();
 await assistant(p);await p.getByLabel('向材料提问').fill('测试失败');await p.getByRole('button',{name:'发送问题',exact:true}).click();await expect(p.locator('.ask-error')).toBeVisible();await expect(p.getByLabel('向材料提问')).toHaveValue('测试失败');await p.locator('.ask-error').getByRole('button',{name:'重试',exact:true}).click();await expect(p.locator('.ask-error')).toBeVisible();expect(ids).toHaveLength(2);expect(ids[1]).toBe(ids[0]);
 await p.getByLabel('向材料提问').fill('量子纠错');await p.getByRole('button',{name:'发送问题',exact:true}).click();await expect(p.locator('.limitations')).toContainText('依据不足');expect(ids[2]).not.toBe(ids[1]);
 await p.getByLabel('向材料提问').fill('解释电场储能');await p.getByRole('button',{name:'发送问题',exact:true}).click();await expect(p.locator('.answer-segment')).toBeVisible();await p.getByRole('button',{name:/^引用 1，/}).click();await expect(p.getByRole('img',{name:'原 PDF 文件第 1 页'})).toBeVisible();
});

test('previous frontend drafts migrate without losing work',async({page:p})=>{
 await p.evaluate(()=>{
   localStorage.clear();
   localStorage.setItem('zhiye:pending-state:v1',JSON.stringify({goal:'升级前尚未保存的目标',nextStep:'继续旧任务',cards:[],readingPosition:null}));
   localStorage.setItem('zhiye:card-draft:v1',JSON.stringify({id:null,title:'升级前卡片草稿',body:'原来的正文',baseline:null,sourceRefs:[]}));
   localStorage.setItem('zhiye:question-draft:v1',JSON.stringify('升级前的问题'));
 });
 await p.reload();await expect(p.getByText('发现未保存的本机修改',{exact:true})).toBeVisible();await p.getByRole('button',{name:'用本机草稿替换并保存',exact:true}).click();await expect.poll(async()=>(await state(p)).goal).toBe('升级前尚未保存的目标');
 await assistant(p);await expect(p.getByLabel('向材料提问')).toHaveValue('升级前的问题');await p.getByRole('tab',{name:/我的理解/}).click();await expect(p.getByLabel('卡片标题')).toHaveValue('升级前卡片草稿');await expect(p.getByLabel('我的理解',{exact:true})).toHaveValue('原来的正文');
 await p.getByRole('button',{name:'保存我的理解',exact:true}).click();await expect.poll(async()=>(await state(p)).cards.length).toBe(1);await p.reload();await expect(p.getByText('发现未保存的本机修改',{exact:true})).toHaveCount(0);
});


test('restores the saved course PDF and page after reload',async({page:p})=>{
 const response=await p.request.post(fixture+'/api/learn/imports',{data:{courseId:'course-a',fileIds:['course-a-f0','course-a-f1'],requestId:'reading-restore'}});
 const batch=await response.json();
 for(let i=0;i<4;i++)await p.request.get(fixture+'/api/learn/imports/'+batch.batchId);
 const before=await state(p);
 await p.request.put(fixture+'/api/state',{data:{...before,activeCourseId:'course-a',readingPosition:{materialId:'course-a-f1',versionId:'fixture-v1',page:2}}});
 await p.reload();
 await expect(p.getByRole('img',{name:'原 PDF 文件第 2 页'})).toBeVisible();
 await expect(p.getByRole('link',{name:'打开原 PDF 第 2 页',exact:true})).toHaveAttribute('href','/api/materials/course-a-f1/file#page=2');
 await expect.poll(async()=>(await state(p)).readingPosition).toEqual({materialId:'course-a-f1',versionId:'fixture-v1',page:2});
});
