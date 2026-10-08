const {agentDesignSchema}=require('../ai/schemas');
const prompts=require('../prompts');
const {id,now,activeAgents,activeNorthStar,avatarFor}=require('./helpers');
const {fail,isChief,isObject,text,validateProfile}=require('./agent-validation');

class AgentService{
 constructor({stateManager,provider,eventService,usageService,config}){Object.assign(this,{stateManager,provider,eventService,usageService,config});this.designRequests=new Map();this.changing=new Set();}
 list({includeDrafts=false}={}){const s=this.stateManager.get();return(s.agents||[]).filter(a=>a.companyId===s.activeCompanyId&&(includeDrafts||a.status==='active'));}
 get(agentId){const s=this.stateManager.get();return(s.agents||[]).find(a=>a.companyId===s.activeCompanyId&&a.id===agentId)||null;}
 chiefOfStaff(){return this.list({includeDrafts:true}).find(a=>isChief(a)&&a.status==='active')||null;}
 async design(request,{clientRequestId=''}={}){
  request=text(request,'Hiring request',4000,true);clientRequestId=text(clientRequestId,'Request identity',160);
  const companyId=this.stateManager.get().activeCompanyId,existing=clientRequestId&&this.list({includeDrafts:true}).find(a=>a.designRequestId===clientRequestId);
  if(existing){if(existing.designRequest!==request)throw fail('This request identity belongs to another hiring brief.',409);return existing;}
  const key=`${companyId}:${clientRequestId}`,pending=clientRequestId&&this.designRequests.get(key);
  if(pending){if(pending.request!==request)throw fail('This request identity belongs to another hiring brief.',409);return pending.promise;}
  const promise=this.createDraft(request,clientRequestId,companyId);if(clientRequestId)this.designRequests.set(key,{request,promise});
  try{return await promise;}finally{if(clientRequestId)this.designRequests.delete(key);}
 }
 async createDraft(request,clientRequestId,companyId){
  const state=this.stateManager.get(), agents=activeAgents(state), northStar=activeNorthStar(state), chief=this.chiefOfStaff();
  if(!(state.companies||[]).some(c=>c.id===companyId))throw fail('Activate an organization before designing an employee.',409);
  const prompt=prompts.agentDesigner({request,northStar,agents,chiefOfStaffId:chief?.id});
  const response=await this.provider.generate({...prompt,responseSchema:agentDesignSchema,metadata:{action:'agent_designer'},context:{request,northStar,agents,chiefOfStaffId:chief?.id}});
  if(this.stateManager.get()!==state||state.activeCompanyId!==companyId)throw fail('The organization changed. Return to Team and retry this hiring request.',409);
  this.usageService.record(response,{purpose:'agent_designer'});
  const d=response.data;if(!isObject(d))throw fail('The AI returned an unreadable employee profile. Please retry.',502);const createdAt=now();
  for(const key of ['responsibilities','skills','requestedToolIds','boundaries','escalationRules','evaluationCriteria','sampleTasks'])d[key]=Array.isArray(d[key])?d[key].filter(x=>typeof x==='string'&&x.trim()).slice(0,30).map(x=>x.trim().slice(0,1000)):[];
  const baseName=typeof d.displayNameSuggestion==='string'&&d.displayNameSuggestion.trim()?d.displayNameSuggestion.trim().slice(0,100):'New AI Coworker';let suffix=2;d.displayNameSuggestion=baseName;
  while(this.list({includeDrafts:true}).some(a=>a.status!=='archived'&&a.displayName.toLowerCase()===d.displayNameSuggestion.toLowerCase()))d.displayNameSuggestion=`${baseName} ${suffix++}`;
  for(const key of ['role','division','purpose','systemPromptDraft','personalityDraft','reasonForRole','overlapWarning'])d[key]=typeof d[key]==='string'?d[key].trim().slice(0,key==='systemPromptDraft'?16000:4000):'';
  if(isChief({role:d.role})&&chief)throw fail('This organization already has a Chief of Staff. Request a specialist role.',409);
  const manager=this.get(d.managerAgentId);d.managerAgentId=isChief({role:d.role})?null:manager?.status==='active'?manager.id:chief?.id||null;
  const agent={id:id('agt'),companyId:state.activeCompanyId,displayName:d.displayNameSuggestion||'New AI Coworker',role:d.role||'Specialist',division:d.division||'General',managerAgentId:d.managerAgentId||chief?.id||null,purpose:d.purpose||'',responsibilities:d.responsibilities||[],skills:(d.skills||[]).map(s=>typeof s==='string'?{name:s,level:'advanced'}:s),toolPolicyIds:d.requestedToolIds||[],modelPolicy:{provider:'inherit',defaultModel:null,reasoningTier:'balanced',maxOutputTokens:3000},systemPrompt:d.systemPromptDraft||`You are the ${d.role||'Specialist'} inside Organa.`,personality:d.personalityDraft||'Professional and concise.',boundaries:d.boundaries||[],escalationRules:d.escalationRules||[],evaluationCriteria:d.evaluationCriteria||[],sampleTasks:d.sampleTasks||[],reasonForRole:d.reasonForRole||'',overlapWarning:d.overlapWarning||null,status:'draft',concurrencyLimit:1,promptVersion:1,avatar:avatarFor(d.displayNameSuggestion,d.division,this.list({includeDrafts:true}).length),createdAt,updatedAt:createdAt};
  if(clientRequestId)Object.assign(agent,{designRequestId:clientRequestId,designRequest:request});
  state.agents.push(agent);const event=this.eventService.append('agent.designed',{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:agent.id},payload:{role:agent.role}});
  try{await this.stateManager.persist();}catch(error){state.agents=state.agents.filter(a=>a.id!==agent.id);state.events=state.events.filter(e=>e.id!==event?.id);throw error;}return agent;
 }
 async patch(agentId,patch={}){
  const a=this.get(agentId);if(!a)throw Object.assign(new Error('Agent not found.'),{status:404});
  patch=validateProfile(a,patch,this.list({includeDrafts:true}));
  if(this.changing.has(a.id))throw fail('This employee is being updated. Please try again.',409);
  const original=structuredClone(a),oldEvents=new Set((this.stateManager.get().events||[]).map(e=>e.id));
  const state=this.stateManager.get(),nextRole=patch.role!==undefined?String(patch.role):a.role,isChief=/chief of staff/i.test(nextRole||'');
  if(isChief)patch.managerAgentId=null;
  else if(patch.managerAgentId!==undefined){
   const chief=this.chiefOfStaff(),managerId=patch.managerAgentId||(chief?.id!==a.id?chief?.id:null);
   if(!managerId)throw fail('Activate a Chief of Staff before assigning this reporting line.',409);
   if(managerId===a.id)throw Object.assign(new Error('An AI employee cannot report to themselves.'),{status:400});
   if(managerId){
    const manager=(state.agents||[]).find(x=>x.companyId===state.activeCompanyId&&x.id===managerId&&['active','paused'].includes(x.status));
    if(!manager)throw Object.assign(new Error('Pick an active AI manager from this organization.'),{status:400});
    let cursor=manager;const seen=new Set([a.id]);
    while(cursor){
     if(seen.has(cursor.id))throw Object.assign(new Error('That reporting line would create a management cycle.'),{status:400});seen.add(cursor.id);
     cursor=cursor.managerAgentId?(state.agents||[]).find(x=>x.companyId===state.activeCompanyId&&x.id===cursor.managerAgentId):null;
    }
   }
   patch.managerAgentId=managerId;
  }else if(!a.managerAgentId){const chief=this.chiefOfStaff();if(chief&&chief.id!==a.id)patch.managerAgentId=chief.id;}
  const allowed=['displayName','role','division','purpose','responsibilities','skills','systemPrompt','personality','boundaries','evaluationCriteria','managerAgentId'];
  for(const key of allowed)if(patch[key]!==undefined)a[key]=patch[key];
  if(patch.modelPolicy&&typeof patch.modelPolicy==='object'){a.modelPolicy={...(a.modelPolicy||{}),provider:String(patch.modelPolicy.provider||a.modelPolicy?.provider||'inherit'),defaultModel:patch.modelPolicy.defaultModel===null?null:String(patch.modelPolicy.defaultModel??a.modelPolicy?.defaultModel??'').trim()||null,maxOutputTokens:Math.max(256,Math.min(16000,Number(patch.modelPolicy.maxOutputTokens||a.modelPolicy?.maxOutputTokens||3000))),reasoningTier:String(patch.modelPolicy.reasoningTier||a.modelPolicy?.reasoningTier||'balanced')}};
  a.updatedAt=now();a.version=(a.version||1)+1;
  a.avatar={...(a.avatar||{}),initials:a.displayName.split(/\s+/).map(x=>x[0]).slice(0,3).join('').toUpperCase()};
  if(patch.systemPrompt!==undefined){a.promptVersion=(a.promptVersion||1)+1;this.eventService.append('agent.prompt_updated',{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:a.id},payload:{promptVersion:a.promptVersion}});}
  if(patch.managerAgentId!==undefined)this.eventService.append('agent.reporting_line_updated',{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:a.id},payload:{managerAgentId:a.managerAgentId}});
  this.eventService.append('agent.updated',{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:a.id},payload:{role:a.role}});
  const added=new Set((state.events||[]).filter(e=>!oldEvents.has(e.id)).map(e=>e.id));this.changing.add(a.id);
  try{await this.stateManager.persist();return a;}catch(error){Object.keys(a).forEach(key=>delete a[key]);Object.assign(a,original);state.events=state.events.filter(e=>!added.has(e.id));throw error;}finally{this.changing.delete(a.id);}
 }
 async setStatus(agentId,status){
  const a=this.get(agentId);if(!a)throw fail('Agent not found.',404);
  if(!['active','paused','archived'].includes(status))throw fail('Invalid agent status.');
  if(a.status===status)return a;
  if(a.status==='draft'&&status==='paused')throw fail('Activate a draft before pausing it.',409);
  if(isChief(a)&&a.status==='active'&&status!=='active')throw fail('Keep the Chief of Staff active so the team retains its coordinator.',409);
  const state=this.stateManager.get(),work=(state.tasks||[]).filter(t=>t.companyId===a.companyId&&t.assigneeAgentId===a.id&&!['done','cancelled'].includes(t.status));
  if(status==='archived'&&work.length)throw fail('Reassign or finish this employee’s unfinished tasks before archiving.',409);
  if(status==='paused'&&work.some(t=>t.status==='active'))throw fail('Wait for the current task to finish before pausing this employee.',409);
  if(status!=='active'&&(state.meetings||[]).some(m=>m.companyId===a.companyId&&['in_progress','synthesizing'].includes(m.status)&&[m.moderatorAgentId,...(m.participantAgentIds||[])].includes(a.id)))throw fail('This employee is in a running meeting. Wait for it to finish.',409);
  if(status==='active'&&this.list({includeDrafts:true}).some(x=>x.id!==a.id&&x.status!=='archived'&&(x.displayName.toLowerCase()===a.displayName.toLowerCase()||(isChief(a)&&isChief(x)))))throw fail('This name or coordinator role is already used. Edit the profile before restoring it.',409);
  const reports=status==='archived'?this.list({includeDrafts:true}).filter(x=>x.id!==a.id&&x.status!=='archived'&&x.managerAgentId===a.id):[];
  const changed=[a,...reports];if(changed.some(x=>this.changing.has(x.id)))throw fail('An affected employee is being updated. Please try again.',409);
  const originals=changed.map(x=>structuredClone(x)),oldEvents=new Set((state.events||[]).map(e=>e.id));changed.forEach(x=>this.changing.add(x.id));
  const chief=this.chiefOfStaff(),priorStatus=a.status;
  a.status=status;a.updatedAt=now();
  if(status==='active'&&!isChief(a)&&(!this.get(a.managerAgentId)||!['active','paused'].includes(this.get(a.managerAgentId).status)))a.managerAgentId=chief?.id||null;
  reports.forEach(report=>{report.managerAgentId=this.get(a.managerAgentId)?.status==='active'?a.managerAgentId:chief?.id||null;report.updatedAt=now();this.eventService.append('agent.reporting_line_updated',{entity:{type:'agent',id:report.id},payload:{managerAgentId:report.managerAgentId}});});
  const evt=status==='active'?(priorStatus==='draft'?'agent.hired':'agent.activated'):status==='paused'?'agent.paused':'agent.archived';this.eventService.append(evt,{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:a.id},payload:{role:a.role}});
  const added=new Set((state.events||[]).filter(e=>!oldEvents.has(e.id)).map(e=>e.id));
  try{await this.stateManager.persist();return a;}catch(error){changed.forEach((x,i)=>{Object.keys(x).forEach(key=>delete x[key]);Object.assign(x,originals[i]);});state.events=state.events.filter(e=>!added.has(e.id));throw error;}finally{changed.forEach(x=>this.changing.delete(x.id));}
 }
 roster(){return this.list().slice(0,13).map((a,i)=>({id:a.id,n:a.displayName,displayName:a.displayName,initials:a.avatar?.initials||a.displayName.split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase(),gender:a.avatar?.gender||(i%2?'female':'male'),role:a.role,division:a.division,group:a.avatar?.group||'marketing',provider:a.modelPolicy?.provider||'inherit',model:a.modelPolicy?.defaultModel||null,status:a.status}));}
}
module.exports={AgentService};
