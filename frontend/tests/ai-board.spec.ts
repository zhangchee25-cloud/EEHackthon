import {test,expect,type Page} from '@playwright/test';
const fixture='http://127.0.0.1:8012';
async function state(p:Page){return (await p.request.get(fixture+'/__fixture__/state')).json();}
async function showBoard(p:Page){await p.getByRole('button',{name:'课程白板',exact:true}).click();}
test.beforeEach(async({page:p})=>{
  await p.request.get(fixture+'/__fixture__/reset');
  const batch=await (await p.request.post(fixture+'/api/learn/imports',{data:{courseId:'course-a',fileIds:['course-a-f0','course-a-f1'],requestId:'ai-board-import'}})).json();
  for(let i=0;i<4;i++)await p.request.get(fixture+'/api/learn/imports/'+batch.batchId);
  const base=await state(p);
  await p.request.put(fixture+'/api/state',{data:{...base,activeCourseId:'course-a'}});
  await p.goto('/#study');await showBoard(p);
});
test('AI preview creates cards and linked board, quick connections persist',async({page:p})=>{
  await p.getByLabel('AI 白板要求').fill('梳理核心概念与联系');
  await p.getByRole('button',{name:'AI 生成白板',exact:true}).click();
  const preview=p.getByRole('region',{name:'AI 白板预览'});
  await expect(preview).toContainText('3 张卡片');
  expect((await state(p)).cards).toHaveLength(0);
  await p.getByRole('button',{name:'创建卡片并加入白板',exact:true}).click();
  await expect(p.locator('.board-node')).toHaveCount(3);
  await expect(p.locator('.board-edge-list li')).toHaveCount(2);
  await expect.poll(async()=>(await state(p)).cards.length).toBe(3);
  await p.getByLabel('快捷连线说明').fill('复习顺序');
  await p.locator('.board-node').last().getByRole('button',{name:'从这里连线',exact:true}).click();
  await p.locator('.board-node').first().getByRole('button',{name:'连接到这里',exact:true}).click();
  await expect(p.locator('.board-edge-list')).toContainText('复习顺序');
  await expect(p.locator('.board-heading')).toContainText('白板已保存');
  await p.reload();await showBoard(p);
  await expect(p.locator('.board-node')).toHaveCount(3);
  await expect(p.locator('.board-edge-list li')).toHaveCount(3);
  await p.getByRole('button',{name:'AI 生成白板',exact:true}).click();
  await p.getByRole('button',{name:'创建卡片并加入白板',exact:true}).click();
  await expect(p.locator('.board-node')).toHaveCount(6);
  await expect.poll(async()=>(await state(p)).cards.length).toBe(6);
});
test('failed generation and apply retain input and preview for retry',async({page:p})=>{
  await p.getByLabel('AI 白板要求').fill('测试失败');
  await p.getByRole('button',{name:'AI 生成白板',exact:true}).click();
  await expect(p.getByRole('alert')).toContainText('AI 白板暂未完成');
  await expect(p.getByLabel('AI 白板要求')).toHaveValue('测试失败');
  await p.getByLabel('AI 白板要求').fill('解释联系');
  await p.getByRole('button',{name:'AI 生成白板',exact:true}).click();
  await expect(p.getByRole('region',{name:'AI 白板预览'})).toBeVisible();
  await p.request.get(fixture+'/__fixture__/fail-board?enabled=1');
  await p.getByRole('button',{name:'创建卡片并加入白板',exact:true}).click();
  await expect(p.getByRole('alert')).toContainText('AI 白板暂未完成');
  expect((await state(p)).cards).toHaveLength(0);
  await expect(p.getByRole('region',{name:'AI 白板预览'})).toBeVisible();
  await p.request.get(fixture+'/__fixture__/fail-board?enabled=0');
  await p.request.get(fixture+'/__fixture__/conflict');
  await p.getByRole('button',{name:'创建卡片并加入白板',exact:true}).click();
  await expect(p.getByRole('button',{name:'刷新版本后重试',exact:true})).toBeVisible();
  await p.getByRole('button',{name:'刷新版本后重试',exact:true}).click();
  await expect(p.getByRole('button',{name:'刷新版本后重试',exact:true})).toHaveCount(0);
  await p.getByRole('button',{name:'创建卡片并加入白板',exact:true}).click();
  await expect(p.locator('.board-node')).toHaveCount(3);
});

test('click relationship to edit type, direction, cancel and delete persistently',async({page:p})=>{
 await p.getByRole('button',{name:'AI 生成白板',exact:true}).click();
 await p.getByRole('button',{name:'创建卡片并加入白板',exact:true}).click();
 await expect(p.locator('.board-node')).toHaveCount(3);
 // Click the actual SVG label between the nodes, not a synthetic event.
 await p.locator('.board-edge-interactive text').first().click();
 const dialog=p.getByRole('dialog',{name:'编辑卡片关系'});
 await expect(dialog).toBeVisible();
 await dialog.getByLabel('关系类型',{exact:true}).selectOption('前置知识');
 await dialog.getByLabel('反转连线方向').check();
 await dialog.getByRole('button',{name:'保存关系',exact:true}).click();
 await expect(p.locator('.board-edge-list')).toContainText('电压 → 电荷：前置知识');
 await expect(p.locator('.board-heading')).toContainText('白板已保存');
 await p.reload();await showBoard(p);
 await p.locator('.board-edge-list').getByRole('button',{name:'电压 → 电荷：前置知识',exact:true}).click();
 await dialog.getByLabel('编辑关系说明').fill('不应保存的草稿');
 await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await expect(p.locator('.board-edge-list')).not.toContainText('不应保存');
 await p.locator('.board-edge-list').getByRole('button',{name:'电压 → 电荷：前置知识',exact:true}).click();
 await dialog.getByRole('button',{name:'删除这条关系',exact:true}).click();
 await expect(p.locator('.board-edge-list li')).toHaveCount(1);
 await expect(p.locator('.board-node')).toHaveCount(3);
 await expect(p.locator('.board-heading')).toContainText('白板已保存');
});

async function generateBoard(p:Page){
 await p.getByRole('button',{name:'AI 生成白板',exact:true}).click();
 await p.getByRole('button',{name:'创建卡片并加入白板',exact:true}).click();
 await expect(p.locator('.board-node')).toHaveCount(3);
}

test('fullscreen fits all cards and keeps relationship editing usable',async({page:p},testInfo)=>{
 await generateBoard(p);
 await p.getByRole('button',{name:'全屏白板',exact:true}).click();
 const full=p.locator('.board-is-fullscreen');
 await expect(full).toBeVisible();
 await expect(p.getByRole('button',{name:'展开工具',exact:true})).toBeVisible();
 await p.getByRole('button',{name:'适合全部',exact:true}).click();
 await expect.poll(async()=>{
   const viewport=await p.locator('.board-scroll').boundingBox();
   const nodes=await p.locator('.board-node').all();
   if(!viewport)return false;
   for(const node of nodes){const b=await node.boundingBox();if(!b||b.x<viewport.x-2||b.y<viewport.y-2||b.x+b.width>viewport.x+viewport.width+2||b.y+b.height>viewport.y+viewport.height+2)return false;}
   return true;
 }).toBe(true);
 await p.screenshot({path:`test-results/fullscreen-${testInfo.project.name}.png`});
 await p.locator('.board-edge-interactive text').first().click();
 const dialog=p.getByRole('dialog',{name:'编辑卡片关系'});
 await expect(dialog).toBeVisible();
 await p.screenshot({path:`test-results/fullscreen-relation-${testInfo.project.name}.png`});
 await dialog.getByLabel('关系类型',{exact:true}).selectOption('前置知识');
 await dialog.getByRole('button',{name:'保存关系',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(p.locator('.board-edge-interactive text').first()).toHaveText('前置知识');
 await p.locator('.board-edge-interactive text').first().click();
 await p.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(full).toBeVisible();
 await p.keyboard.press('Escape');
 await expect(full).toHaveCount(0);
 await p.getByRole('button',{name:'全屏白板',exact:true}).click();
 await p.getByRole('button',{name:'退出全屏',exact:true}).click();
 await expect(full).toHaveCount(0);
});

test('zoomed pointer movement persists board coordinates and zoom resets',async({page:p})=>{
 await generateBoard(p);
 await p.getByRole('button',{name:'全屏白板',exact:true}).click();
 await p.getByRole('button',{name:'重置为 100%',exact:true}).click();
 await p.getByRole('button',{name:'缩小白板',exact:true}).click();
 const ratio=p.getByLabel('白板缩放比例');
 await expect(ratio).not.toHaveText('100%');
 const scale=Number((await ratio.innerText()).replace('%',''))/100;
 const before=await (await p.request.get(fixture+'/api/courses/course-a/board')).json();
 const node=p.locator('.board-node').first();
 const id=await node.getAttribute('data-node-id');
 const original=before.nodes.find((n:{id:string})=>n.id===id);
 const handle=node.locator('.board-drag');
 await handle.scrollIntoViewIfNeeded();
 const box=await handle.boundingBox();
 expect(box).not.toBeNull();
 const start={x:box!.x+Math.min(20,box!.width/2),y:box!.y+box!.height/2};
 await p.mouse.move(start.x,start.y);await p.mouse.down();
 await p.mouse.move(start.x+24,start.y+20,{steps:5});await p.mouse.up();
 await expect.poll(async()=>{
   const saved=await (await p.request.get(fixture+'/api/courses/course-a/board')).json();
   const moved=saved.nodes.find((n:{id:string})=>n.id===id);
   return Math.abs(moved.x-original.x-24/scale)<1&&Math.abs(moved.y-original.y-20/scale)<1;
 }).toBe(true);
 await p.getByRole('button',{name:'放大白板',exact:true}).click();
 await p.getByRole('button',{name:'重置为 100%',exact:true}).click();
 await expect(ratio).toHaveText('100%');
 await p.getByRole('button',{name:'退出全屏',exact:true}).click();
 await p.reload();await showBoard(p);
 const restored=p.locator(`.board-node[data-node-id="${id}"]`);
 await expect.poll(async()=>Number.parseFloat(await restored.evaluate(el=>(el as HTMLElement).style.left))).toBeCloseTo(original.x+24/scale,0);
});
