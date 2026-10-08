const crypto=require('node:crypto');
const {specialistResponseSchema}=require('../ai/schemas');
const prompts=require('../prompts');
const {now,activeAgents,activeNorthStar}=require('./helpers');

class TaskWorker{
 constructor({stateManager,provider,eventService,usageService,deliverableService,approvalService,orchestrationService,config}){Object.assign(this,{stateManager,provider,eventService,usageService,deliverableService,approvalService,orchestrationService,config});this.busy=new Set();}
 kick=()=>{const state=this.stateManager.get();for(const agent of activeAgents(state))setImmediate(()=>this.work(agent.id));};
 async work(agentId){
  if(this.busy.has(agentId))return;const state=this.stateManager.get();this.orchestrationService.releaseDependencies();const task=(state.tasks||[]).filter(t=>t.companyId===state.activeCompanyId&&t.assigneeAgentId===agentId&&t.status==='queued'&&!t.error).sort((a,b)=>(b.priority||0)-(a.priority||0)||a.createdAt.localeCompare(b.createdAt))[0];
  if(!task||(state.tasks||[]).some(t=>t.assigneeAgentId===agentId&&t.status==='active'))return;const agent=activeAgents(state).find(a=>a.id===agentId);if(!agent)return;this.busy.add(agentId);const runId=crypto.randomUUID();
  try{
   task.status='active';task.runId=runId;task.version=(task.version||0)+1;task.updatedAt=now();delete task.error;const northStar=activeNorthStar(state);task.northStarVersionUsed=northStar?.version||null;task.agentPromptVersionUsed=agent.promptVersion||1;this.eventService.append('task.started',{actor:{type:'agent',id:agent.id},entity:{type:'task',id:task.id},goalIds:task.goalIds,projectId:task.projectId,payload:{runId,northStarVersion:task.northStarVersionUsed,agentPromptVersion:task.agentPromptVersionUsed}});await this.stateManager.persist();
   const snapshot=JSON.parse(JSON.stringify(task));const inputDeliverables=(snapshot.dependencyIds||[]).map(dep=>state.tasks.find(t=>t.id===dep)?.deliverableId).filter(Boolean).map(del=>this.deliverableService.get(del)).filter(Boolean).map(d=>({...d,currentContent:d.versions?.find(v=>v.id===d.currentVersionId)?.content||''}));
   const prompt=prompts.specialist({agent,northStar,task:snapshot,inputDeliverables});
   const response=await this.provider.generate({provider:agent.modelPolicy?.provider,model:agent.modelPolicy?.defaultModel,...prompt,responseSchema:specialistResponseSchema,metadata:{action:'specialist',taskId:task.id,agentId},context:{agent,northStar,task:snapshot,inputDeliverables},maxOutputTokens:agent.modelPolicy?.maxOutputTokens||3500});
   if(this.stateManager.get()!==state||state.activeCompanyId!==task.companyId)return;this.usageService.record(response,{agentId,projectId:task.projectId,taskId:task.id,purpose:'specialist'});
   const current=(state.tasks||[]).find(t=>t.id===task.id);if(!current||current.status!=='active'||current.runId!==runId||current.assigneeAgentId!==agentId)return;
   const data=response.data||{};const by=response.provider==='dry-run'?'dry-run':`${response.provider}:${response.model}`;
   if(data.status==='needs_input'){
    current.status='blocked';current.questions=(data.questions||[]).slice(0,3).map(String);current.askedBy=by;current.runId=null;current.version++;current.updatedAt=now();this.eventService.append('task.blocked',{actor:{type:'agent',id:agentId},entity:{type:'task',id:current.id},goalIds:current.goalIds,projectId:current.projectId,payload:{questions:current.questions}});await this.stateManager.persist();return;
   }
   const output=data.output||{};const deliverable=this.deliverableService.create({title:output.title||current.title,type:current.outputContract?.type||'document',content:String(output.content||'').slice(0,30000),structuredData:output.structuredData??null,createdBy:{type:'agent',id:agentId},taskIds:[current.id],goalIds:current.goalIds,projectId:current.projectId,evidenceRefs:data.evidenceRefs||[],assumptions:data.assumptions||[],uncertainties:data.uncertainties||[],goalAlignment:data.goalAlignment||[],constraintChecks:data.constraintChecks||[],collaboratorAgentIds:current.collaboratorAgentIds||[],decisionSummary:data.decisionSummary||'',status:current.approvalPolicy&&current.approvalPolicy!=='none'?'needs_review':'ready',northStarVersion:current.northStarVersionUsed,agentPromptVersion:current.agentPromptVersionUsed});
   const draft={result:String(output.content||'').slice(0,10000),by,createdAt:now(),feedback:snapshot.feedback||'',deliverableId:deliverable.id,decisionSummary:data.decisionSummary||''};current.result=draft.result;current.by=by;current.deliverableId=deliverable.id;current.history=[...(current.history||[]),draft];current.runId=null;current.updatedAt=now();current.version++;
   if(current.approvalPolicy&&current.approvalPolicy!=='none'){
    current.status='review';const approval=this.approvalService.request({entityType:'task',entityId:current.id,title:`Review: ${current.title}`,summary:data.decisionSummary||'AI-generated task output requires human review.',projectId:current.projectId,goalIds:current.goalIds,requestedBy:{type:'agent',id:agentId}});current.approvalId=approval.id;this.eventService.append('task.needs_review',{actor:{type:'agent',id:agentId},entity:{type:'task',id:current.id},goalIds:current.goalIds,projectId:current.projectId,payload:{deliverableId:deliverable.id,approvalId:approval.id}});
   }else{
    current.status='done';current.reviewedAt=null;this.eventService.append('task.completed',{actor:{type:'agent',id:agentId},entity:{type:'task',id:current.id},goalIds:current.goalIds,projectId:current.projectId,payload:{deliverableId:deliverable.id,automatic:true}});this.orchestrationService.releaseDependencies();if(current.projectId)this.orchestrationService.updateProjectCompletion(current.projectId);
   }
   await this.stateManager.persist();
  }catch(error){const current=(this.stateManager.get().tasks||[]).find(t=>t.id===task.id);if(current&&current.status==='active'&&current.runId===runId){current.status='failed';current.runId=null;current.version=(current.version||0)+1;current.error=error.name==='AbortError'?'The configured LLM took too long to answer.':String(error.message||error).slice(0,1000);current.updatedAt=now();this.eventService.append('task.failed',{actor:{type:'agent',id:agentId},entity:{type:'task',id:current.id},goalIds:current.goalIds,projectId:current.projectId,payload:{error:current.error}});await this.stateManager.persist();}console.error(`Agent ${agentId} failed on "${task.title}": ${error.message}`);
  }finally{this.busy.delete(agentId);setImmediate(this.kick);}
 }
}
module.exports={TaskWorker};
