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
 if(needsAttention.length)headline=`${needsAttention.length} item${needsAttention.length===1?'':'s'} need owner attention.`;
 else if(blockers.length)headline=`${blockers.length} blocker${blockers.length===1?'':'s'} need attention.`;
 else if(completed.length)headline=`${completed.length} meaningful item${completed.length===1?'':'s'} completed in the current window.`;
 return{headline,completed,decisions,needsAttention,blockers,next,usageSummary:snapshot.usageSummary||'No paid model usage recorded in this workspace.'};
}

function normalizeItems(candidate,source,{priority=false,limit=5}={}){
 const sourceByRef=new Map((source||[]).filter(item=>item?.ref).map(item=>[item.ref,item]));
 const result=[];
 for(const item of Array.isArray(candidate)?candidate:[]){
  if(!item||typeof item!=='object')continue;
  const ref=typeof item.ref==='string'?item.ref:'';
  const original=sourceByRef.get(ref);
  if(!original)continue;
  const summary=typeof item.summary==='string'&&item.summary.trim()?item.summary.trim().slice(0,500):original.summary;
  const row={summary,ref:original.ref};
  if(priority)row.priority=['low','medium','high'].includes(item.priority)?item.priority:(original.priority||'medium');
  result.push(row);
  if(result.length>=limit)break;
 }
 // The model may omit items. Preserve verified source coverage rather than silently dropping work.
 if(!result.length&&source?.length){
  return source.slice(0,limit).map(item=>priority?{priority:item.priority||'medium',summary:item.summary,ref:item.ref}:{summary:item.summary,ref:item.ref});
 }
 return result;
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
  usageSummary:typeof data.usageSummary==='string'&&data.usageSummary.trim()?data.usageSummary.trim().slice(0,500):fallback.usageSummary,
 };
}

class StandupService{
 constructor({stateManager,provider,eventService,usageService,config}){Object.assign(this,{stateManager,provider,eventService,usageService,config});}
 snapshot(){
  const s=this.stateManager.get(),cid=s.activeCompanyId;
  const agents=new Map((s.agents||[]).filter(a=>a.companyId===cid).map(a=>[a.id,a]));
  const tasks=(s.tasks||[]).filter(t=>t.companyId===cid);
  const meetings=(s.meetings||[]).filter(m=>m.companyId===cid);
  const approvals=(s.approvals||[]).filter(a=>a.companyId===cid&&a.status==='pending');
  const completed=tasks.filter(t=>t.status==='done').slice(-8).map(t=>({summary:`${agents.get(t.assigneeAgentId)?.displayName||'Agent'} completed “${t.title}”.`,ref:`task:${t.id}`}));
  const decisions=meetings.filter(m=>['review','completed'].includes(m.status)&&m.result?.summary).slice(-5).map(m=>({summary:m.result.summary,ref:`meeting:${m.id}`}));
  const needsAttention=[...approvals.map(a=>({priority:'high',summary:a.title,ref:`approval:${a.id}`})),...tasks.filter(t=>t.status==='review').map(t=>({priority:'medium',summary:`Review “${t.title}”.`,ref:`task:${t.id}`}))].slice(0,10);
  const blockers=tasks.filter(t=>['blocked','failed'].includes(t.status)).map(t=>({summary:`${t.title}: ${t.error||t.questions?.join(' ')||'blocked'}`,ref:`task:${t.id}`})).slice(0,10);
  const next=tasks.filter(t=>['queued','waiting_dependency'].includes(t.status)).slice(0,8).map(t=>({summary:`${t.status==='queued'?'Ready':'Waiting on dependencies'}: ${t.title}`,ref:`task:${t.id}`}));
  const usage=(s.usage||[]).filter(u=>u.companyId===cid);
  const total=usage.reduce((a,u)=>a+(u.totalTokens||0),0);
  return{generatedAt:now(),completed,decisions,needsAttention,blockers,next,usageSummary:usage.length?`${usage.length} model calls, ${total.toLocaleString()} total tokens recorded.`:'No paid model usage recorded in this workspace.'};
 }
 async generate(){
  const s=this.stateManager.get();
  if(!s.activeCompanyId||(s.companies||[]).every(company=>company.id!==s.activeCompanyId)){
   throw Object.assign(new Error('Create or activate an organization before starting a stand-up.'),{status:409});
  }
  const snapshot=this.snapshot(),prompt=prompts.standup({snapshot});
  let summary,generation;
  try{
   const r=await this.provider.generate({...prompt,responseSchema:standupSchema,metadata:{action:'standup'},context:{snapshot}});
   summary=normalizeAiSummary(r.data,snapshot);
   this.usageService.record(r,{purpose:'standup'});
   generation={mode:'ai',provider:r.provider||this.provider.name||'unknown',model:r.model||null,degraded:false};
  }catch(error){
   // Stand-up is a read-only summary of deterministic state. If the LLM is unavailable,
   // keep the owner workflow usable instead of turning a transient provider failure into HTTP 500.
   summary=fallbackSummary(snapshot);
   generation={mode:'deterministic-fallback',provider:this.provider.name||'unknown',model:this.provider.plannerModel||this.provider.model||null,degraded:true,reason:'ai_summary_unavailable'};
   console.warn(`Stand-up AI summary unavailable; using deterministic fallback: ${error?.message||error}`);
  }
  const standup={id:id('std'),companyId:s.activeCompanyId,period:{end:snapshot.generatedAt},snapshot,summary,generation,createdAt:now()};
  s.standups ||= [];
  s.standups.push(standup);
  this.eventService.append('standup.generated',{actor:{type:'agent',id:'chief_of_staff'},entity:{type:'standup',id:standup.id},payload:{needsAttention:standup.summary?.needsAttention?.length||0,generationMode:generation.mode,degraded:generation.degraded}});
  await this.stateManager.persist();
  return standup;
 }
 latest(){const s=this.stateManager.get();return[...(s.standups||[])].filter(x=>x.companyId===s.activeCompanyId).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null;}
 get(idValue){const s=this.stateManager.get();return(s.standups||[]).find(x=>x.companyId===s.activeCompanyId&&x.id===idValue)||null;}
}
module.exports={StandupService,fallbackSummary,normalizeAiSummary};
