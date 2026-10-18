import {afterEach,expect,it,vi} from 'vitest';
import {api} from '../src/api';
import {ExamReportSchema} from '../src/domain';
const ref={id:'r',materialId:'exam',versionId:'v1',title:'往年卷',pageStart:1,pageEnd:1,quote:'卷积'};
const report={id:'report',courseId:'course',createdAt:'2026-10-18T10:00:00Z',examMaterialIds:['exam'],topics:[{id:'topic',title:'卷积',analysis:'考查卷积计算',examRefs:[ref],knowledgeRefs:[],relatedCardIds:[]}],practice:[{id:'p',topicId:'topic',question:'求卷积',hint:'先确定范围',answer:'分段积分'}],limitations:[]};
afterEach(()=>vi.unstubAllGlobals());
it('rejects invalid topic mapping and unrelated exam references',()=>{
 expect(ExamReportSchema.safeParse(report).success).toBe(true);
 expect(ExamReportSchema.safeParse({...report,practice:[{...report.practice[0],topicId:'missing'}]}).success).toBe(false);
 expect(ExamReportSchema.safeParse({...report,examMaterialIds:['other']}).success).toBe(false);
});
it('rejects reports belonging to another course or unselected exam',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(report))));
 await expect(api.analyzeExams('other',['exam'],'',3,'req')).rejects.toThrow('不匹配');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(report))));
 await expect(api.analyzeExams('course',['different'],'',3,'req')).rejects.toThrow('不匹配');
});
it('sends explicit exam type and year and preserves server errors',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'MODEL_ERROR',message:'服务暂不可用'}}),{status:503}));
 vi.stubGlobal('fetch',fetcher);
 await expect(api.registerExam('course','exam','2024','midterm')).rejects.toMatchObject({status:503,code:'MODEL_ERROR'});
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({materialId:'exam',year:'2024',examType:'midterm'});
});
