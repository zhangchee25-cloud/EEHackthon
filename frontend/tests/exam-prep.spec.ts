import {test,expect} from '@playwright/test';
test('uploaded Markdown exam survives registration failure without uploading twice',async({page:p})=>{
 const fixture='http://127.0.0.1:8013';
 await p.request.get(fixture+'/__fixture__/reset');
 const state=await(await p.request.get(fixture+'/__fixture__/state')).json();
 await p.request.put(fixture+'/api/state',{data:{...state,activeCourseId:'course-a'}});
 const material={materialId:'uploaded-exam',versionId:'v1',title:'自编试卷.md',status:'ready',pageCount:1,error:null,warnings:[],fileUrl:'/api/materials/uploaded-exam/file'};
 let uploads=0,registrations=0;
 await p.route('**/api/courses/course-a/materials',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}uploads++;await route.fulfill({json:material});});
 await p.route('**/api/courses/course-a/exams',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:{exams:[],reports:[]}});return;}
  registrations++;expect(route.request().postDataJSON().materialId).toBe(material.materialId);
  if(registrations===1){await route.fulfill({status:503,json:{error:{message:'注册暂不可用'}}});return;}
  await route.fulfill({json:{exams:[{material,year:'',examType:'final'}],reports:[]}});
 });
 await p.goto('/#study');await p.getByRole('button',{name:'真题与练习',exact:true}).click();
 const area=p.getByRole('region',{name:'真题与练习',exact:true});
 await area.getByLabel('上传试卷').setInputFiles({name:'自编试卷.md',mimeType:'text/markdown',buffer:Buffer.from('# 自编练习\n请解释卷积的含义。')});
 await area.getByRole('button',{name:'加入真题库'}).click();
 await expect(area.getByRole('alert')).toContainText('注册暂不可用');
 await expect(area.getByLabel('或选择已有材料')).toHaveValue(material.materialId);
 await area.getByRole('button',{name:'加入真题库'}).click();
 await expect(area.getByText('年份未填写 · 期末')).toBeVisible();
 expect(uploads).toBe(1);expect(registrations).toBe(2);
});
test('exam registration, retry, references, hidden answers and saved report',async({page:p},testInfo)=>{
 const fixture='http://127.0.0.1:8013';
 await p.request.get(fixture+'/__fixture__/reset');
 const batch=await(await p.request.post(fixture+'/api/learn/imports',{data:{courseId:'course-a',fileIds:['course-a-f0','course-a-f1'],requestId:'exam-import'}})).json();
 for(let i=0;i<4;i++)await p.request.get(fixture+'/api/learn/imports/'+batch.batchId);
 const state=await(await p.request.get(fixture+'/__fixture__/state')).json();
 await p.request.put(fixture+'/api/state',{data:{...state,activeCourseId:'course-a'}});
 const course=await(await p.request.get(fixture+'/api/courses/course-a/materials')).json();
 const material=course.materials[0];
 const ref={id:'r',materialId:material.materialId,versionId:material.versionId,title:material.title,pageStart:1,pageEnd:1,quote:'测试引用：卷积'};
 const report={id:'report',courseId:'course-a',createdAt:'2026-10-18T10:00:00Z',examMaterialIds:[material.materialId],topics:[{id:'topic',title:'卷积与系统',analysis:'理解输入和输出的联系',examRefs:[ref],knowledgeRefs:[],relatedCardIds:[]}],practice:[{id:'p',topicId:'topic',question:'请解释卷积的含义',hint:'从输入输出考虑',answer:'原创参考答案：叠加移位响应'}],limitations:['课程讲义不足，请补充材料。']};
 let registered=false,analyzed=false,attempts=0,requestId='';
 await p.route('**/api/courses/course-a/exams',async route=>{
  if(route.request().method()==='POST'){expect(route.request().postDataJSON()).toEqual({materialId:material.materialId,year:'2024',examType:'midterm'});registered=true;}
  await route.fulfill({json:{exams:registered?[{material,year:'2024',examType:'midterm'}]:[],reports:analyzed?[report]:[]}});
 });
 await p.route('**/api/courses/course-a/exams/analyze',async route=>{
  expect(route.request().postDataJSON().examMaterialIds).toEqual([material.materialId]);attempts++;
  if(attempts===2)expect(route.request().postDataJSON().requestId).toBe(requestId);
  if(attempts>2)expect(route.request().postDataJSON().requestId).not.toBe(requestId);
  if(attempts===1)requestId=route.request().postDataJSON().requestId;
  if(attempts===1){await route.fulfill({status:503,json:{error:{message:'模型暂不可用'}}});return;}
  analyzed=true;await route.fulfill({json:report});
 });
 await p.goto('/#study');await p.getByRole('button',{name:'真题与练习',exact:true}).click();
 const area=p.getByRole('region',{name:'真题与练习',exact:true});
 await area.getByLabel('或选择已有材料').selectOption(material.materialId);
 await area.getByLabel('试卷年份').fill('2024');await area.getByLabel('考试类型').selectOption('midterm');
 await area.getByRole('button',{name:'加入真题库'}).click();
 await expect(area.getByText('2024 · 期中')).toBeVisible();
 await area.getByLabel('关注内容').fill('梳理计算题');
 await area.getByRole('button',{name:'分析考点并出题'}).click();
 await expect(area.getByRole('alert')).toContainText('模型暂不可用');
 await expect(area.getByLabel('关注内容')).toHaveValue('梳理计算题');
 await area.getByRole('button',{name:'分析考点并出题'}).click();
 await expect(area.getByRole('region',{name:'真题分析报告'})).toBeVisible();
 await expect(area.getByText('课程讲义不足，请补充材料。')).toBeVisible();
 await expect(area.getByText('原创参考答案：叠加移位响应')).not.toBeVisible();
 await area.getByRole('region',{name:'真题分析报告'}).scrollIntoViewIfNeeded();
 await p.screenshot({path:testInfo.outputPath('exam-report.png'),fullPage:true});
 await area.getByText('查看参考答案',{exact:true}).click();
 await expect(area.getByText('原创参考答案：叠加移位响应')).toBeVisible();
 await area.getByRole('button',{name:'分析考点并出题'}).click();
 await expect.poll(()=>attempts).toBe(3);
 await p.reload();await p.getByRole('button',{name:'真题与练习',exact:true}).click();
 await expect(area.getByRole('region',{name:'真题分析报告'})).toBeVisible();
 await expect(area.getByText('原创参考答案：叠加移位响应')).not.toBeVisible();
 await area.locator('.exam-refs button').first().click();
 await expect(p.locator('.exam-prep')).not.toBeVisible();
});
