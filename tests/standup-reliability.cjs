const assert=require('node:assert/strict');
const {StandupService}=require('../server/services/standup-service');
const {EventService}=require('../server/services/event-service');
const {UsageService}=require('../server/services/usage-service');

class MemoryStateManager{
 constructor(state){this.state=state;this.persistCount=0;}
 get(){return this.state;}
 async persist(){this.persistCount++;}
}

function baseState(){
 const cid='cmp_test';
 return{
  activeCompanyId:cid,
  companies:[{id:cid,name:'Test Co'}],
  agents:[{id:'agt_1',companyId:cid,displayName:'Maya',role:'Researcher',status:'active'}],
  tasks:[
   {id:'tsk_done',companyId:cid,assigneeAgentId:'agt_1',title:'Competitor scan',status:'done'},
   {id:'tsk_review',companyId:cid,assigneeAgentId:'agt_1',title:'Launch brief',status:'review'},
   {id:'tsk_blocked',companyId:cid,assigneeAgentId:'agt_1',title:'Pricing analysis',status:'blocked',error:'Waiting for pricing input'},
   {id:'tsk_next',companyId:cid,assigneeAgentId:'agt_1',title:'Draft positioning',status:'queued'},
  ],
  meetings:[{id:'mtg_1',companyId:cid,status:'completed',result:{summary:'Team recommends a small pilot.'}}],
  approvals:[{id:'apr_1',companyId:cid,status:'pending',title:'Approve launch direction'}],
  standups:[],usage:[],events:[],settings:{},
 };
}

async function testProviderFailureFallsBack(){
 const stateManager=new MemoryStateManager(baseState());
 const provider={name:'vertex',plannerModel:'gemini-2.5-flash',async generate(){throw new Error('simulated upstream 503');}};
 const service=new StandupService({stateManager,provider,eventService:new EventService(stateManager),usageService:new UsageService(stateManager),config:{}});
 const result=await service.generate();
 assert.equal(result.generation.mode,'deterministic-fallback');
 assert.equal(result.generation.degraded,true);
 assert.equal(result.summary.completed[0].ref,'task:tsk_done');
 assert.ok(result.summary.needsAttention.some(item=>item.ref==='approval:apr_1'));
 assert.equal(stateManager.get().standups.length,1);
 assert.equal(stateManager.get().usage.length,0,'failed provider call must not create usage row');
 assert.equal(service.latest().id,result.id);
 assert.ok(stateManager.get().events.some(event=>event.type==='standup.generated'&&event.payload.degraded===true));
}

async function testAiSummaryIsBoundToVerifiedRefs(){
 const stateManager=new MemoryStateManager(baseState());
 const provider={
  name:'vertex',plannerModel:'gemini-2.5-flash',
  async generate(){return{
   provider:'vertex',model:'gemini-2.5-flash',requestId:'req_1',latencyMs:10,usage:{inputTokens:10,outputTokens:20,totalTokens:30},
   data:{
    headline:'Owner-ready summary',
    completed:[{summary:'Rephrased verified completion',ref:'task:tsk_done'},{summary:'Invented completion',ref:'task:not_real'}],
    decisions:[{summary:'Rephrased meeting decision',ref:'meeting:mtg_1'}],
    needsAttention:[{priority:'high',summary:'Please approve the launch direction',ref:'approval:apr_1'}],
    blockers:[{summary:'Pricing is waiting for input',ref:'task:tsk_blocked'}],
    next:[{summary:'Positioning is ready',ref:'task:tsk_next'}],
    usageSummary:'30 tokens in this test.',
   },
  };}
 };
 const service=new StandupService({stateManager,provider,eventService:new EventService(stateManager),usageService:new UsageService(stateManager),config:{}});
 const result=await service.generate();
 assert.equal(result.generation.mode,'ai');
 assert.equal(result.generation.degraded,false);
 assert.equal(result.summary.headline,'Owner-ready summary');
 assert.deepEqual(result.summary.completed.map(item=>item.ref),['task:tsk_done']);
 assert.ok(!JSON.stringify(result.summary).includes('task:not_real'));
 assert.equal(stateManager.get().usage.length,1);
 assert.equal(stateManager.get().usage[0].purpose,'standup');
}

async function testMissingCompanyIsActionable(){
 const state=baseState();state.activeCompanyId=null;
 const stateManager=new MemoryStateManager(state);
 const service=new StandupService({stateManager,provider:{name:'dry-run',async generate(){throw new Error('should not run');}},eventService:new EventService(stateManager),usageService:new UsageService(stateManager),config:{}});
 await assert.rejects(()=>service.generate(),error=>error.status===409&&/activate an organization/i.test(error.message));
}

(async()=>{
 await testProviderFailureFallsBack();
 await testAiSummaryIsBoundToVerifiedRefs();
 await testMissingCompanyIsActionable();
 console.log('PASS: stand-up survives provider failures, preserves verified provenance, and returns actionable workspace errors');
})().catch(error=>{console.error(error);process.exitCode=1;});
