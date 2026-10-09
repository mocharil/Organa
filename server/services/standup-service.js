const {standupSchema}=require('../ai/schemas');
const prompts=require('../prompts');
const {id,now}=require('./helpers');

const LIMITS={completed:5,decisions:5,needsAttention:5,blockers:5,next:5};

function fallbackSummary(snapshot={}){
 const completed=(snapshot.completed||[]).slice(0,LIMITS.completed).map(item=>({summary:item.summary,ref:item.ref}));
 const decisions=(snapshot.decisions||[]).slice(0,LIMITS.decisions).map(item=>({summary:item.summary,ref:item.ref}));
 const needsAttention=(snapshot.needsAttention||[]).slice(0,LIMITS.needsAttention).map(item=>({priority:item.priority||'medium',summary:item.summary,ref:item.ref}));
 const blockers=(snapshot.blockers||[]).slice(0,LIMITS.blockers).map(item=>({summary:item.summary,ref:item.ref}));
 const next=(snapshot.next||[]).slice(0,LIMITS.next).map(item=>({summary:item.summary,ref:item.ref}));
 let headline='The team is ready for the next mission.';
 if(needsAttention.length)headline=`${needsAttention.length} item${needsAttention.length===1?'':'s'} ${needsAttention.length===1?'needs':'need'} owner attention.`;
 else if(blockers.length)headline=`${blockers.length} blocker${blockers.length===1?'':'s'} need attention.`;
 else if(completed.length)headline=`${completed.length} meaningful item${completed.length===1?'':'s'} completed in the current window.`;
 return{headline,completed,decisions,needsAttention,blockers,next,usageSummary:snapshot.usageSummary||'No paid model usage recorded in this workspace.'};
}

function normalizeItems(candidate,source,{priority=false,limit=5}={}){
 const verified=new Map((source||[]).filter(item=>item?.ref).map(item=>[item.ref,item]));
 const wording=new Map();
 for(const item of Array.isArray(candidate)?candidate:[]){
  if(!item||typeof item!=='object'||!verified.has(item.ref)||wording.has(item.ref))continue;
  if(typeof item.summary==='string'&&item.summary.trim())wording.set(item.ref,item.summary.trim().slice(0,500));
 }
 // Source order keeps pending approvals ahead of lower-priority work.
 return [...verified.values()].slice(0,limit).map(item=>({
  ...(priority?{priority:item.priority||'medium'}:{}),
  summary:wording.get(item.ref)||item.summary,ref:item.ref,
 }));
}

function normalizeAiSummary(data,snapshot){
 const fallback=fallbackSummary(snapshot);
 if(!data||typeof data!=='object')return fallback;
 return{
  headline:typeof data.headline==='string'&&data.headline.trim()?data.headline.trim().slice(0,280):fallback.headline,
  completed:normalizeItems(data.completed,snapshot.completed,{limit:LIMITS.completed}),
  decisions:normalizeItems(data.decisions,snapshot.decisions,{limit:LIMITS.decisions}),
  needsAttention:normalizeItems(data.needsAttention,snapshot.needsAttention,{priority:true,limit:LIMITS.needsAttention}),
  blockers:normalizeItems(data.blockers,snapshot.blockers,{limit:LIMITS.blockers}),
  next:normalizeItems(data.next,snapshot.next,{limit:LIMITS.next}),
  usageSummary:fallback.usageSummary,
 };
}

class StandupService{
 constructor({stateManager,provider,eventService,usageService,config}){Object.assign(this,{stateManager,provider,eventService,usageService,config});this.pending=new Map();}
 snapshot(){
  const s=this.stateManager.get(),cid=s.activeCompanyId;
  const agents=new Map((s.agents||[]).filter(a=>a.companyId===cid).map(a=>[a.id,a]));
  const recent=(a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''));
  const tasks=(s.tasks||[]).filter(t=>t.companyId===cid).sort(recent);
  const meetings=(s.meetings||[]).filter(m=>m.companyId===cid).sort(recent);
  const approvals=(s.approvals||[]).filter(a=>a.companyId===cid&&a.status==='pending').sort(recent);
  const note=t=>String(t?.history?.[t.history.length-1]?.decisionSummary||'').trim().slice(0,300),taskById=new Map(tasks.map(t=>[t.id,t])),who=t=>agents.get(t?.assigneeAgentId)?.displayName||'';
  const completed=tasks.filter(t=>t.status==='done').slice(0,8).map(t=>({detail:note(t),summary:`${agents.get(t.assigneeAgentId)?.displayName||'Agent'} completed “${t.title}”.`,ref:`task:${t.id}`}));
  const decisions=meetings.filter(m=>['review','completed'].includes(m.status)&&m.result?.summary).slice(0,5).map(m=>({summary:m.result.summary,ref:`meeting:${m.id}`}));
  const approvalEntities=new Set(approvals.map(a=>`${a.entityType}:${a.entityId}`));
  const needsAttention=[...approvals.map(a=>{const t=a.entityType==='task'?taskById.get(a.entityId):null;return{priority:'high',summary:a.title,detail:note(t),owner:who(t),ref:`approval:${a.id}`};}),...tasks.filter(t=>t.status==='review'&&!approvalEntities.has(`task:${t.id}`)).map(t=>({priority:'medium',summary:`Review “${t.title}”.`,detail:note(t),owner:who(t),ref:`task:${t.id}`}))].slice(0,10);
  const blockers=[...meetings.filter(m=>m.status==='failed').map(m=>({summary:`${m.title}: ${m.error||'Meeting failed; retry required.'}`,ref:`meeting:${m.id}`})),...tasks.filter(t=>['blocked','failed'].includes(t.status)).map(t=>({summary:`${t.title}: ${t.error||t.questions?.join(' ')||'blocked'}`,ref:`task:${t.id}`}))].slice(0,10);
  const next=[...meetings.filter(m=>m.status==='needs_input'||(m.status==='scheduled'&&(m.dependencyIds||[]).every(id=>tasks.some(t=>t.id===id&&t.status==='done')))).map(m=>({summary:`${m.status==='needs_input'?'Revise meeting':'Ready for meeting'}: ${m.title}${m.reviewNote?`: ${m.reviewNote}`:''}`,ref:`meeting:${m.id}`})),...tasks.filter(t=>['queued','waiting_dependency'].includes(t.status)).map(t=>({summary:`${t.status==='queued'?'Ready':'Waiting on dependencies'}: ${t.title}`,ref:`task:${t.id}`}))].slice(0,8);
  const usage=(s.usage||[]).filter(u=>u.companyId===cid);
  const total=usage.reduce((a,u)=>a+(u.totalTokens||0),0);
  const north=(s.northStars||[]).find(n=>n.companyId===cid&&n.status==='active')||null;
  const context={goals:(s.goals||[]).filter(g=>g.companyId===cid&&!['archived','done','completed'].includes(g.status)).slice(0,5).map(g=>g.title),hardConstraints:(north?.constraints||[]).filter(c=>c.severity==='hard').slice(0,6).map(c=>c.text)};
  return{generatedAt:now(),context,completed,decisions,needsAttention,blockers,next,usageSummary:usage.length?`${usage.length} model calls, ${total.toLocaleString()} total tokens recorded.`:'No paid model usage recorded in this workspace.'};
 }
 async generate(){
  const companyId=this.stateManager.get().activeCompanyId;
  if(this.pending.has(companyId))return this.pending.get(companyId);
  const promise=this.generateFor(companyId);this.pending.set(companyId,promise);
  try{return await promise;}finally{this.pending.delete(companyId);}
 }
 async generateFor(companyId){
  const s=this.stateManager.get();
  if(!s.activeCompanyId||(s.companies||[]).every(company=>company.id!==s.activeCompanyId)){
   throw Object.assign(new Error('Create or activate an organization before starting a stand-up.'),{status:409});
  }
  const snapshot=this.snapshot(),prompt=prompts.standup({snapshot});
  let summary,generation,response;
  try{
   const r=await this.provider.generate({...prompt,responseSchema:standupSchema,metadata:{action:'standup'},context:{snapshot}});response=r;
   if(!r.data||typeof r.data!=='object'||Array.isArray(r.data)||!['completed','decisions','needsAttention','blockers','next'].every(key=>Array.isArray(r.data[key])))throw new Error('Malformed stand-up summary.');
   summary=normalizeAiSummary(r.data,snapshot);
   generation={mode:r.provider==='dry-run'?'deterministic':'ai',provider:r.provider||this.provider.name||'unknown',model:r.model||null,degraded:false};
  }catch(error){
   // Stand-up is a read-only summary of deterministic state. If the LLM is unavailable,
   // keep the owner workflow usable instead of turning a transient provider failure into HTTP 500.
   summary=fallbackSummary(snapshot);
   generation={mode:'deterministic-fallback',provider:this.provider.name||'unknown',model:this.provider.plannerModel||this.provider.model||null,degraded:true,reason:'ai_summary_unavailable'};
   console.warn(`Stand-up AI summary unavailable; using deterministic fallback: ${error?.message||error}`);
  }
  if(this.stateManager.get()!==s||s.activeCompanyId!==companyId)throw Object.assign(new Error('The organization changed while the brief was prepared. Generate a stand-up for the current team.'),{status:409});
  if(response)this.usageService.record(response,{purpose:'standup'});
  const standup={id:id('std'),companyId,period:{end:snapshot.generatedAt},snapshot,summary,generation,createdAt:now()};
  s.standups ||= [];
  s.standups.push(standup);
  const chief=(s.agents||[]).find(a=>a.companyId===companyId&&a.status==='active'&&/chief of staff/i.test(a.role));
  const event=this.eventService.append('standup.generated',{actor:{type:chief?'agent':'system',id:chief?.id||'organa'},entity:{type:'standup',id:standup.id},payload:{needsAttention:standup.summary?.needsAttention?.length||0,generationMode:generation.mode,degraded:generation.degraded}});
  try{await this.stateManager.persist();}catch(error){s.standups=s.standups.filter(item=>item.id!==standup.id);s.events=(s.events||[]).filter(item=>item.id!==event?.id);throw error;}
  return standup;
 }
 latest(){const s=this.stateManager.get();return[...(s.standups||[])].reverse().filter(x=>x.companyId===s.activeCompanyId).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null;}
 get(idValue){const s=this.stateManager.get();return(s.standups||[]).find(x=>x.companyId===s.activeCompanyId&&x.id===idValue)||null;}
}
module.exports={StandupService,fallbackSummary,normalizeAiSummary};
