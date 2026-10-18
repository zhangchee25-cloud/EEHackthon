import {describe,it,expect,vi,afterEach} from 'vitest';
import {SaveQueue,migrateLegacyStudyDraft} from '../src/hooks/useStudyState';
import {ApiError,validateAnswer} from '../src/api';
import {initialState,BoardSchema,type StudyState,type Material,type Answer} from '../src/domain';

describe('revision contract',()=>{
  it('advances queued revision and does not acknowledge an old snapshot over later typing',async()=>{
    let release!:()=>void;const gate=new Promise<void>(r=>release=r);const sent:StudyState[]=[];const acks:boolean[]=[];
    const q=new SaveQueue(async s=>{sent.push(s);if(sent.length===1)await gate;return {...s,revision:s.revision+1};},()=>{},(_s,idle)=>acks.push(idle));
    q.reset(6);q.enqueue({...initialState,goal:'one'});const run=q.flush();q.enqueue({...initialState,goal:'two'});release();await run;
    expect(sent.map(s=>[s.goal,s.revision])).toEqual([['one',6],['two',7]]);expect(acks).toEqual([false,true]);
  });
  it('blocks automatic retries after conflict until explicit reload/reset',async()=>{
    let calls=0;let fail=true;
    const q=new SaveQueue(async s=>{calls++;if(fail)throw new ApiError('Conflict',409,'STATE_CONFLICT',{currentRevision:9});return {...s,revision:s.revision+1};},()=>{});
    q.enqueue({...initialState,goal:'local'});await q.flush();q.enqueue({...initialState,goal:'newer'});await q.flush();expect(calls).toBe(1);expect(q.hasPending()).toBe(true);
    fail=false;q.reset(9);q.enqueue({...initialState,goal:'explicitly recovered'});await q.flush();expect(calls).toBe(2);
  });
});
describe('course grounding and boards',()=>{
  const mats:Material[]=[{materialId:'a',versionId:'v1',title:'A',pageCount:2,status:'ready',warnings:[],error:null,fileUrl:''},{materialId:'b',versionId:'v1',title:'B',pageCount:20,status:'ready',warnings:[],error:null,fileUrl:''}];
  const answer:Answer={supported:true,selectedScope:mats,answerSegments:[{id:'s',text:'evidence',citationIds:['c']}],citations:[{id:'c',materialId:'b',versionId:'v1',title:'B',pageStart:18,pageEnd:18,quote:'source'}],limitations:[]};
  it('validates a source against its own PDF instead of the currently read PDF',()=>{expect(validateAnswer(answer,mats)).toEqual(answer);expect(()=>validateAnswer(answer,[mats[0]])).toThrow('范围');expect(()=>validateAnswer({...answer,citations:[{...answer.citations[0],pageEnd:21}]},mats)).toThrow('页数');});
  it('rejects invalid board coordinates, duplicate nodes and dangling edges',()=>{
    const b={courseId:'c',revision:0,updatedAt:null,nodes:[{id:'n',cardId:'k',x:0,y:0}],edges:[]};expect(BoardSchema.safeParse(b).success).toBe(true);
    expect(BoardSchema.safeParse({...b,nodes:[...b.nodes,...b.nodes]}).success).toBe(false);
    expect(BoardSchema.safeParse({...b,nodes:[{...b.nodes[0],x:Infinity}]}).success).toBe(false);
    expect(BoardSchema.safeParse({...b,edges:[{id:'e',source:'n',target:'missing',label:''}]}).success).toBe(false);
  });
});

afterEach(()=>vi.unstubAllGlobals());
it('preserves pre-course pending drafts during migration',()=>{
 const values=new Map<string,string>([['zhiye:pending-state:v1',JSON.stringify({goal:'旧草稿',nextStep:'继续',readingPosition:null,cards:[]})]]);
 vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});
 expect(migrateLegacyStudyDraft()).toMatchObject({goal:'旧草稿',activeCourseId:null,revision:0});
 expect(values.has('zhiye:pending-state:v2')).toBe(true);expect(values.has('zhiye:pending-state:v1')).toBe(false);
});
