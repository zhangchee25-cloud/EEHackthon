import {afterEach,expect,it,vi} from 'vitest';
import {api} from '../src/api';
import {BoardPreviewSchema,CardSchema,initialState,toMarkdown} from '../src/domain';

const card={id:'card',courseId:'course',origin:'ai' as const,title:'概念',body:'模型生成的原始正文',sourceRefs:[],reviewStatus:'to_review' as const,createdAt:'now',updatedAt:'now'};
const preview={previewId:'preview',courseId:'course',cards:[card],nodes:[{id:'node',cardId:'card',x:0,y:0}],edges:[],limitations:[],selectedScope:[]};
afterEach(()=>vi.unstubAllGlobals());
it('keeps AI origin and unedited text through validation and Markdown export',()=>{
 const parsed=CardSchema.parse(card);
 expect(parsed.origin).toBe('ai');expect(parsed.body).toBe(card.body);
 expect(toMarkdown({...initialState,cards:[parsed]})).toContain('AI 生成');
});
it('rejects foreign cards, dangling edges and references outside the generated scope',()=>{
 expect(BoardPreviewSchema.safeParse(preview).success).toBe(true);
 expect(BoardPreviewSchema.safeParse({...preview,cards:[{...card,courseId:'other'}]}).success).toBe(false);
 expect(BoardPreviewSchema.safeParse({...preview,edges:[{id:'edge',source:'node',target:'missing',label:'关系'}]}).success).toBe(false);
 expect(BoardPreviewSchema.safeParse({...preview,cards:[{...card,sourceRefs:[{id:'ref',materialId:'other',versionId:'v1',title:'other.pdf',pageStart:1,pageEnd:1,quote:'外部材料'}]}]}).success).toBe(false);
});
it('rejects previews for another course and carries revision conflicts back to the user',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(preview))).mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'STATE_CONFLICT',message:'版本已更新'}}),{status:409})));
 await expect(api.generateBoard('other','构建知识关系','request')).rejects.toThrow('课程不匹配');
 await expect(api.applyBoard('course','preview',3,2)).rejects.toMatchObject({status:409,code:'STATE_CONFLICT'});
});
