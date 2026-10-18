import {test,expect,type Page} from '@playwright/test';
const fixture=process.env.UI_FIXTURE_URL||'http://127.0.0.1:8012';
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
