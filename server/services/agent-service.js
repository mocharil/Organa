const {agentDesignSchema}=require('../ai/schemas');
const prompts=require('../prompts');
const {id,now,activeAgents,activeNorthStar,avatarFor}=require('./helpers');

class AgentService{
 constructor({stateManager,provider,eventService,usageService,config}){Object.assign(this,{stateManager,provider,eventService,usageService,config});}
 list({includeDrafts=false}={}){const s=this.stateManager.get();return(s.agents||[]).filter(a=>a.companyId===s.activeCompanyId&&(includeDrafts||a.status==='active'));}
 get(agentId){const s=this.stateManager.get();return(s.agents||[]).find(a=>a.companyId===s.activeCompanyId&&a.id===agentId)||null;}
 chiefOfStaff(){return this.list({includeDrafts:true}).find(a=>/chief of staff/i.test(a.role))||null;}
 async design(request){
  if(!String(request||'').trim())throw Object.assign(new Error('Describe the coworker you want to hire.'),{status:400});
  const state=this.stateManager.get(), agents=activeAgents(state), northStar=activeNorthStar(state), chief=this.chiefOfStaff();
  const prompt=prompts.agentDesigner({request,northStar,agents,chiefOfStaffId:chief?.id});
  const response=await this.provider.generate({...prompt,responseSchema:agentDesignSchema,metadata:{action:'agent_designer'},context:{request,northStar,agents,chiefOfStaffId:chief?.id}});
  this.usageService.record(response,{purpose:'agent_designer'});
  const d=response.data||{};const createdAt=now();
  const agent={id:id('agt'),companyId:state.activeCompanyId,displayName:d.displayNameSuggestion||'New AI Coworker',role:d.role||'Specialist',division:d.division||'General',managerAgentId:d.managerAgentId||chief?.id||null,purpose:d.purpose||'',responsibilities:d.responsibilities||[],skills:(d.skills||[]).map(s=>typeof s==='string'?{name:s,level:'advanced'}:s),toolPolicyIds:d.requestedToolIds||[],modelPolicy:{provider:'inherit',defaultModel:null,reasoningTier:'balanced',maxOutputTokens:3000},systemPrompt:d.systemPromptDraft||`You are the ${d.role||'Specialist'} inside Organa.`,personality:d.personalityDraft||'Professional and concise.',boundaries:d.boundaries||[],escalationRules:d.escalationRules||[],evaluationCriteria:d.evaluationCriteria||[],sampleTasks:d.sampleTasks||[],reasonForRole:d.reasonForRole||'',overlapWarning:d.overlapWarning||null,status:'draft',concurrencyLimit:1,promptVersion:1,avatar:avatarFor(d.displayNameSuggestion,d.division,this.list({includeDrafts:true}).length),createdAt,updatedAt:createdAt};
  state.agents.push(agent);this.eventService.append('agent.designed',{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:agent.id},payload:{role:agent.role}});await this.stateManager.persist();return agent;
 }
 async patch(agentId,patch={}){
  const a=this.get(agentId);if(!a)throw Object.assign(new Error('Agent not found.'),{status:404});
  const state=this.stateManager.get(),nextRole=patch.role!==undefined?String(patch.role):a.role,isChief=/chief of staff/i.test(nextRole||'');
  if(isChief)patch.managerAgentId=null;
  else if(patch.managerAgentId!==undefined){
   const chief=this.chiefOfStaff(),managerId=patch.managerAgentId||(chief?.id!==a.id?chief.id:null);
   if(managerId===a.id)throw Object.assign(new Error('An AI employee cannot report to themselves.'),{status:400});
   if(managerId){
    const manager=(state.agents||[]).find(x=>x.companyId===state.activeCompanyId&&x.id===managerId&&x.status!=='archived');
    if(!manager)throw Object.assign(new Error('Pick an active AI manager from this organization.'),{status:400});
    let cursor=manager,depth=0;
    while(cursor&&depth++<50){
     if(cursor.id===a.id)throw Object.assign(new Error('That reporting line would create a management cycle.'),{status:400});
     cursor=cursor.managerAgentId?(state.agents||[]).find(x=>x.companyId===state.activeCompanyId&&x.id===cursor.managerAgentId):null;
    }
   }
   patch.managerAgentId=managerId;
  }else if(!a.managerAgentId){const chief=this.chiefOfStaff();if(chief&&chief.id!==a.id)patch.managerAgentId=chief.id;}
  const allowed=['displayName','role','division','purpose','responsibilities','skills','systemPrompt','personality','boundaries','evaluationCriteria','managerAgentId'];
  for(const key of allowed)if(patch[key]!==undefined)a[key]=patch[key];
  if(patch.modelPolicy&&typeof patch.modelPolicy==='object'){a.modelPolicy={...(a.modelPolicy||{}),provider:String(patch.modelPolicy.provider||a.modelPolicy?.provider||'inherit'),defaultModel:patch.modelPolicy.defaultModel===null?null:String(patch.modelPolicy.defaultModel??a.modelPolicy?.defaultModel??'').trim()||null,maxOutputTokens:Math.max(256,Math.min(16000,Number(patch.modelPolicy.maxOutputTokens||a.modelPolicy?.maxOutputTokens||3000))),reasoningTier:String(patch.modelPolicy.reasoningTier||a.modelPolicy?.reasoningTier||'balanced')}};
  a.updatedAt=now();a.version=(a.version||1)+1;
  if(patch.systemPrompt!==undefined){a.promptVersion=(a.promptVersion||1)+1;this.eventService.append('agent.prompt_updated',{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:a.id},payload:{promptVersion:a.promptVersion}});}
  if(patch.managerAgentId!==undefined)this.eventService.append('agent.reporting_line_updated',{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:a.id},payload:{managerAgentId:a.managerAgentId}});
  await this.stateManager.persist();return a;
 }
 async setStatus(agentId,status){const a=this.get(agentId);if(!a)throw Object.assign(new Error('Agent not found.'),{status:404});if(!['active','paused','archived'].includes(status))throw Object.assign(new Error('Invalid agent status.'),{status:400});if(a.status==='draft'&&status==='paused')throw Object.assign(new Error('Activate a draft before pausing it.'),{status:409});a.status=status;a.updatedAt=now();const evt=status==='active'?'agent.hired':status==='paused'?'agent.paused':'agent.archived';this.eventService.append(evt,{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:a.id},payload:{role:a.role}});await this.stateManager.persist();return a;}
 roster(){return this.list().slice(0,13).map((a,i)=>({id:a.id,n:a.displayName,displayName:a.displayName,initials:a.avatar?.initials||a.displayName.split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase(),gender:a.avatar?.gender||i%2?'female':'male',role:a.role,division:a.division,group:a.avatar?.group||'marketing',provider:a.modelPolicy?.provider||'inherit',model:a.modelPolicy?.defaultModel||null,status:a.status}));}
}
module.exports={AgentService};
