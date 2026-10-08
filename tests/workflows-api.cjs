const assert=require('node:assert/strict');
const test=require('node:test');
const {StateManager}=require('../server/services/state-manager');
const {AgentService}=require('../server/services/agent-service');
const {MeetingService}=require('../server/services/meeting-service');
const {StandupService,normalizeAiSummary}=require('../server/services/standup-service');
const {EventService}=require('../server/services/event-service');
const {UsageService}=require('../server/services/usage-service');
const {DeliverableService}=require('../server/services/deliverable-service');
const {ApprovalService}=require('../server/services/approval-service');
const {DryRunProvider}=require('../server/ai/dry-run-provider');
const {nusaDemoState}=require('../server/data/default-state');
const {startServer}=require('./helpers/server.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function fixture(){
 let failSave=false,saveNumber=0,failAt=0;
 const stateManager=new StateManager({load:async()=>nusaDemoState(),save:async()=>{saveNumber++;if(failSave||saveNumber===failAt)throw new Error('Simulated storage failure');}});
 await stateManager.init();const state=stateManager.get(),provider=new DryRunProvider({dryRunDelayMs:10}),eventService=new EventService(stateManager),usageService=new UsageService(stateManager);
 const deliverableService=new DeliverableService({stateManager,eventService}),approvalService=new ApprovalService({stateManager,eventService});
 const common={stateManager,provider,eventService,usageService,deliverableService,approvalService,config:{}};
 const agentService=new AgentService(common),meetingService=new MeetingService(common),standupService=new StandupService(common);
 state.meetings.push({id:'mtg_test',companyId:state.activeCompanyId,title:'Launch review',agenda:'Agree an evidence-backed launch direction.',goalIds:[],dependencyIds:[],participantAgentIds:['agt_research','agt_marketing','agt_finance'],moderatorAgentId:'agt_cos',status:'scheduled',contributions:[],outputContract:{type:'decision_record'},createdAt:new Date().toISOString()});
 return {...common,state,agentService,meetingService,standupService,setFailure:value=>failSave=value,failNextFinal:()=>failAt=saveNumber+3};
}

(async()=>{
 await test('Employee profiles reject malformed fields, duplicate names and duplicate coordinators without mutation',async()=>{
  const f=await fixture(),original=structuredClone(f.agentService.get('agt_research'));
  for(const patch of [null,[],{displayName:' '},{displayName:' Ari '},{role:''},{role:'Chief of Staff'},{division:1},{responsibilities:'wrong'},{skills:[{}]},{managerAgentId:42},{modelPolicy:{maxOutputTokens:'bad'}},{modelPolicy:{provider:'missing'}}])await assert.rejects(()=>f.agentService.patch('agt_research',patch),error=>error.status===400);
  await assert.rejects(()=>f.agentService.patch('agt_cos',{role:'Researcher'}),error=>error.status===400);
  assert.deepEqual(f.agentService.get('agt_research'),original);assert.equal(f.state.events.length,0);
 });
 await test('Names, avatar initials and gender stay consistent with the saved team',async()=>{
  const f=await fixture();await f.agentService.patch('agt_research',{displayName:'Dina QA'});
  for(const item of f.agentService.roster()){const saved=f.agentService.get(item.id);assert.equal(item.gender,saved.avatar.gender);assert.equal(item.initials,saved.avatar.initials);}
  assert.equal(f.agentService.roster().find(a=>a.id==='agt_research').initials,'DQ');
 });
 await test('Concurrent and repeated hiring requests produce one uniquely named draft',async()=>{
  const f=await fixture();let calls=0;const generate=f.provider.generate.bind(f.provider);f.provider.generate=input=>{calls++;return generate(input);};
  const request='Hire a research specialist for launch evidence',options={clientRequestId:'hire-one'};
  const [first,second]=await Promise.all([f.agentService.design(request,options),f.agentService.design(request,options)]);
  assert.equal(first.id,second.id);assert.equal(first.displayName,'Maya 2');assert.equal(first.status,'draft');assert.equal(calls,1);assert.equal((await f.agentService.design(request,options)).id,first.id);
  await assert.rejects(()=>f.agentService.design('Different role',options),error=>error.status===409);
  const malformed=f.provider.generate;f.provider.generate=async input=>{const r=await malformed(input);r.data.responsibilities='wrong';r.data.managerAgentId='missing';return r;};
  const normalized=await f.agentService.design('Hire a research specialist');assert.deepEqual(normalized.responsibilities,[]);assert.equal(normalized.managerAgentId,'agt_cos');
 });
 await test('Status changes retain the coordinator, protect unfinished work, and repair archived managers',async()=>{
  const f=await fixture();for(const status of ['paused','archived'])await assert.rejects(()=>f.agentService.setStatus('agt_cos',status),error=>error.status===409);
  await f.agentService.patch('agt_research',{managerAgentId:'agt_product'});
  await f.agentService.setStatus('agt_product','archived');assert.equal(f.agentService.get('agt_research').managerAgentId,'agt_cos');
  const events=f.state.events.length;await f.agentService.setStatus('agt_product','archived');assert.equal(f.state.events.length,events);
  await f.agentService.setStatus('agt_product','active');await f.agentService.setStatus('agt_product','paused');await f.agentService.setStatus('agt_product','active');
  f.state.tasks.push({id:'unfinished',companyId:f.state.activeCompanyId,assigneeAgentId:'agt_product',status:'queued'});
  await assert.rejects(()=>f.agentService.setStatus('agt_product','archived'),error=>error.status===409);
  f.state.meetings[0].status='in_progress';await assert.rejects(()=>f.agentService.setStatus('agt_research','paused'),error=>error.status===409);
 });
 await test('Draft, profile and status storage failures leave retryable state',async()=>{
  const f=await fixture(),before=structuredClone(f.agentService.get('agt_product'));f.setFailure(true);
  await assert.rejects(()=>f.agentService.patch('agt_product',{displayName:'Changed'}),/storage failure/);assert.deepEqual(f.agentService.get('agt_product'),before);
  await assert.rejects(()=>f.agentService.setStatus('agt_product','paused'),/storage failure/);assert.deepEqual(f.agentService.get('agt_product'),before);
  await assert.rejects(()=>f.agentService.design('Hire a research analyst',{clientRequestId:'save-failed'}),/storage failure/);assert.equal(f.state.agents.length,5);assert.equal(f.state.events.length,0);
  f.setFailure(false);assert.equal((await f.agentService.design('Hire a research analyst',{clientRequestId:'save-failed'})).status,'draft');
 });
 await test('Meeting readiness validates dependencies, distinct participants and active coordinator before starting',async()=>{
  const f=await fixture(),meeting=f.state.meetings[0];meeting.dependencyIds=['foreign'];f.state.tasks.push({id:'foreign',companyId:'another-company',status:'done'});
  await assert.rejects(()=>f.meetingService.start(meeting.id),error=>error.status===409);meeting.dependencyIds=[];
  f.agentService.get('agt_marketing').status='paused';await assert.rejects(()=>f.meetingService.start(meeting.id),error=>error.status===409);
  f.agentService.get('agt_marketing').status='active';meeting.participantAgentIds=['agt_research','agt_research'];await assert.rejects(()=>f.meetingService.start(meeting.id),error=>error.status===409);
  meeting.participantAgentIds=['agt_research','agt_marketing'];f.agentService.get('agt_cos').status='paused';await assert.rejects(()=>f.meetingService.start(meeting.id),error=>error.status===409);
  assert.equal(meeting.status,'scheduled');assert.equal(f.state.events.length,0);assert.equal(f.state.usage.length,0);
 });
 await test('Every selected specialist contributes with verified identity and input evidence',async()=>{
  const f=await fixture(),generate=f.provider.generate.bind(f.provider);
  f.provider.generate=async input=>{const r=await generate(input);if(input.metadata.action==='meeting_participant')Object.assign(r.data,{agentId:'forged',agentName:'Forged',evidenceRefs:['deliverable:invented']});return r;};
  const result=await f.meetingService.start('mtg_test');assert.equal(result.status,'review');assert.equal(result.contributions.length,3);
  for(const contribution of result.contributions){assert.notEqual(contribution.agentId,'forged');assert.equal(contribution.agentName,f.agentService.get(contribution.agentId).displayName);assert.deepEqual(contribution.evidenceRefs,[]);}
  assert.equal(f.state.deliverables.length,1);assert.equal(f.state.approvals.length,1);
 });
 await test('Provider or malformed contribution failures are visible and can be safely retried',async()=>{
  const f=await fixture(),generate=f.provider.generate.bind(f.provider);
  f.provider.generate=async()=>{throw new Error('Provider temporarily unavailable');};await assert.rejects(()=>f.meetingService.start('mtg_test'),/temporarily unavailable/);assert.equal(f.state.meetings[0].status,'failed');
  f.provider.generate=async input=>{const r=await generate(input);if(input.metadata.action==='meeting_participant')r.data.risks='bad';return r;};await assert.rejects(()=>f.meetingService.start('mtg_test'),error=>error.status===502);assert.equal(f.state.approvals.length,0);
  f.provider.generate=generate;const result=await f.meetingService.start('mtg_test');assert.equal(result.status,'review');assert.equal(result.error,undefined);assert.equal(f.state.approvals.length,1);
 });
 await test('Revision feedback reaches participants and moderator; stale approvals cannot resolve a new result',async()=>{
  const f=await fixture(),generate=f.provider.generate.bind(f.provider),seen=[];f.provider.generate=async input=>{seen.push(input);return generate(input);};
  const first=await f.meetingService.start('mtg_test'),oldApproval=first.approvalId,note='Use a Jakarta-only pilot capped at IDR 2,000,000.';
  await assert.rejects(()=>f.meetingService.approve('mtg_test',false,'',oldApproval),error=>error.status===400);
  await f.meetingService.approve('mtg_test',false,note,oldApproval);const events=f.state.events.length;
  await f.meetingService.approve('mtg_test',false,note,oldApproval);assert.equal(f.state.events.length,events);seen.length=0;
  const revised=await f.meetingService.start('mtg_test');assert.notEqual(revised.approvalId,oldApproval);assert.ok(seen.every(input=>input.context.reviewNote===note&&input.messages[0].content.includes(note)));assert.ok(revised.result.summary.includes(note));
  await assert.rejects(()=>f.meetingService.approve('mtg_test',true,'',oldApproval),error=>error.status===409);assert.equal(revised.status,'review');
  await f.meetingService.approve('mtg_test',true,'',revised.approvalId);const count=f.state.events.length;await f.meetingService.approve('mtg_test',true,'',revised.approvalId);assert.equal(f.state.events.length,count);
  assert.equal(f.deliverableService.get(revised.deliverableId).status,'approved');assert.equal(f.approvalService.get(revised.approvalId).status,'approved');
 });
 await test('Concurrent starts and conflicting reviews cannot run or resolve a meeting twice',async()=>{
  const f=await fixture(),first=f.meetingService.start('mtg_test');await assert.rejects(()=>f.meetingService.start('mtg_test'),error=>error.status===409);await first;
  const approvalId=f.state.meetings[0].approvalId,review=f.meetingService.approve('mtg_test',true,'',approvalId);
  await assert.rejects(()=>f.meetingService.approve('mtg_test',false,'Change the budget',approvalId),error=>error.status===409);await review;
  assert.equal(f.state.events.filter(event=>event.type==='meeting.approved').length,1);
 });
 await test('Final meeting writes and review writes roll back partial decision records on storage failure',async()=>{
  const f=await fixture();f.failNextFinal();await assert.rejects(()=>f.meetingService.start('mtg_test'),/storage failure/);assert.equal(f.state.deliverables.length,0);assert.equal(f.state.approvals.length,0);assert.equal(f.state.events.filter(e=>e.type==='meeting.completed').length,0);
  const result=await f.meetingService.start('mtg_test');f.setFailure(true);await assert.rejects(()=>f.meetingService.approve('mtg_test',true,'',result.approvalId),/storage failure/);assert.equal(result.status,'review');assert.equal(f.approvalService.get(result.approvalId).status,'pending');assert.equal(f.deliverableService.get(result.deliverableId).status,'needs_review');
  f.setFailure(false);await f.meetingService.approve('mtg_test',true,'',result.approvalId);
 });
 await test('Stand-up deduplicates source refs, retains owner priority and uses recorded usage',async()=>{
  const snapshot={completed:[],decisions:[],needsAttention:[{ref:'approval:one',summary:'First approval',priority:'high'},{ref:'approval:two',summary:'Second approval',priority:'high'}],blockers:[],next:[],usageSummary:'2 model calls, 30 total tokens recorded.'};
  const result=normalizeAiSummary({needsAttention:[{ref:'approval:one',summary:'Verified paraphrase',priority:'low'},{ref:'approval:one',summary:'Duplicate'},{ref:'approval:invented',summary:'Invented'}],usageSummary:'999999 tokens'},snapshot);
  assert.deepEqual(result.needsAttention.map(item=>item.ref),['approval:one','approval:two']);assert.equal(result.needsAttention[0].priority,'high');assert.equal(result.usageSummary,snapshot.usageSummary);
  const f=await fixture();f.state.tasks.push({id:'review',companyId:f.state.activeCompanyId,title:'Review output',status:'review'});f.state.approvals.push({id:'approval-review',companyId:f.state.activeCompanyId,entityType:'task',entityId:'review',status:'pending',title:'Approve output'});f.state.meetings[0].status='failed';f.state.meetings[0].error='Retry required';
  const activity=f.standupService.snapshot();assert.equal(activity.needsAttention.length,1);assert.equal(activity.blockers[0].ref,'meeting:mtg_test');
 });
 await test('Concurrent stand-ups coalesce and malformed summaries fall back to verified activity',async()=>{
  const f=await fixture(),generate=f.provider.generate.bind(f.provider);let calls=0;f.provider.generate=async input=>{calls++;return generate(input);};
  const [first,second]=await Promise.all([f.standupService.generate(),f.standupService.generate()]);assert.equal(first.id,second.id);assert.equal(calls,1);assert.equal(f.state.standups.length,1);assert.equal(first.generation.mode,'deterministic');
  f.provider.generate=async()=>({provider:'vertex',usage:{totalTokens:12},data:{completed:'invalid'}});
  const fallback=await f.standupService.generate();assert.equal(fallback.generation.degraded,true);assert.equal(fallback.generation.mode,'deterministic-fallback');assert.equal(f.standupService.latest().id,fallback.id);assert.equal(f.state.usage.at(-1).totalTokens,12);
  f.setFailure(true);await assert.rejects(()=>f.standupService.generate(),/storage failure/);assert.equal(f.state.standups.length,2);
 });
 await test('Organization changes during generation never write a brief or draft into another team',async()=>{
  for(const kind of ['standup','agent','meeting']){
   const f=await fixture(),generate=f.provider.generate.bind(f.provider);f.provider.generate=async input=>{const r=await generate(input);f.state.activeCompanyId='another-company';return r;};
   const action=kind==='standup'?()=>f.standupService.generate():kind==='agent'?()=>f.agentService.design('Hire a research analyst'):()=>f.meetingService.start('mtg_test');
   await assert.rejects(action,error=>error.status===409);assert.equal(f.state.standups.length,0);assert.equal(f.state.agents.length,5);assert.ok(f.state.events.every(e=>e.companyId==='cmp_nusa_coffee'));
  }
 });
 await test('Real HTTP persists hiring and stand-up, rejects stale approvals and recovers interrupted meetings after restart',async()=>{
  let runtime=await startServer({extraEnv:{DRY_RUN_DELAY_MS:'250'}});const original=runtime;let restarted;
  const call=async(route,method='GET',body)=>{const r=await fetch(runtime.base+route,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  try{
   const draft=(await call('/api/company-bootstrap/templates/tpl_startup_launch/proposal','POST',{name:'Workflow QA'})).body;await call(`/api/company-bootstrap/proposals/${draft.id}/activate`,'POST',{});
   const employee=(await call('/api/agents/design','POST',{request:'Hire a research analyst',clientRequestId:'persisted-hire'})).body;assert.equal(employee.status,'draft');assert.equal((await call('/api/agents/design','POST',{request:'Hire a research analyst',clientRequestId:'persisted-hire'})).body.id,employee.id);
   const project=(await call('/api/projects/plan','POST',{goal:'Prepare an evidence-backed coffee launch plan with a constrained budget.'})).body;const activated=(await call(`/api/projects/${project.id}/activate-plan`,'POST',{})).body,meeting=activated.meetings[0];
   for(let attempt=0;attempt<100;attempt++){const tasks=(await call('/api/tasks')).body;for(const task of tasks.filter(t=>t.status==='review'))await call(`/api/tasks/${task.id}/review`,'POST',{action:'approve',version:task.version});if(tasks.every(t=>t.status==='done'))break;await delay(40);}
   const interrupted=call(`/api/meetings/${meeting.id}/start`,'POST',{}).catch(()=>null);for(let attempt=0;attempt<30;attempt++){if((await call(`/api/meetings/${meeting.id}`)).body.status==='in_progress')break;await delay(20);}
   await runtime.stop();await interrupted;runtime=restarted=await startServer({dataDir:original.dataDir});
   const recovered=(await call(`/api/meetings/${meeting.id}`)).body;assert.equal(recovered.status,'failed');assert.match(recovered.error,/server restarted/i);
   assert.equal((await call('/api/agents/design','POST',{request:'Hire a research analyst',clientRequestId:'persisted-hire'})).body.id,employee.id);
   const first=(await call(`/api/meetings/${meeting.id}/start`,'POST',{})).body;await call(`/api/meetings/${meeting.id}/request-revision`,'POST',{note:'Reduce pilot scope.',expectedApprovalId:first.approvalId});const second=(await call(`/api/meetings/${meeting.id}/start`,'POST',{})).body;
   assert.equal((await call(`/api/approvals/${first.approvalId}/approve`,'POST',{})).status,409);assert.equal((await call(`/api/approvals/${second.approvalId}/approve`,'POST',{})).body.status,'completed');
   const brief=(await call('/api/standups/generate','POST',{})).body;assert.ok(brief.summary.decisions.some(item=>item.ref===`meeting:${meeting.id}`));await runtime.stop();runtime=await startServer({dataDir:original.dataDir});assert.equal((await call('/api/standups/latest')).body.id,brief.id);
  }finally{await runtime.stop();if(restarted)await restarted.stop();await original.cleanup();}
 });
})().catch(error=>{console.error(error);process.exitCode=1;});
