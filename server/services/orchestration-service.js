const {planSchema}=require('../ai/schemas');
const prompts=require('../prompts');
const {id,now,activeAgents,activeNorthStar}=require('./helpers');

function validateDag(tasks,maxTasks,agentIds){
 if(!Array.isArray(tasks)||!tasks.length)throw Object.assign(new Error('Chief of Staff plan contains no tasks.'),{status:502});
 if(tasks.length>maxTasks)throw Object.assign(new Error(`Chief of Staff plan exceeds ${maxTasks} tasks.`),{status:502});
 const ids=new Set();for(const t of tasks){if(!t.tempId||ids.has(t.tempId))throw Object.assign(new Error('Plan task IDs must be unique.'),{status:502});ids.add(t.tempId);}
 for(const t of tasks){t.dependsOn=Array.isArray(t.dependsOn)?t.dependsOn:[];for(const dep of t.dependsOn)if(!ids.has(dep))throw Object.assign(new Error(`Task ${t.tempId} depends on unknown task ${dep}.`),{status:502});t.preferredAgentIds=(t.preferredAgentIds||[]).filter(a=>agentIds.has(a));if(!t.preferredAgentIds.length)throw Object.assign(new Error(`Task ${t.tempId} has no valid assignee.`),{status:502});}
 const visiting=new Set(),visited=new Set();function visit(x){if(visiting.has(x))throw Object.assign(new Error('Plan contains a circular dependency.'),{status:502});if(visited.has(x))return;visiting.add(x);const task=tasks.find(t=>t.tempId===x);for(const dep of task.dependsOn)visit(dep);visiting.delete(x);visited.add(x);}ids.forEach(visit);return tasks;
}

class OrchestrationService{
 constructor({stateManager,provider,eventService,usageService,config}){Object.assign(this,{stateManager,provider,eventService,usageService,config});}
 async plan(goalInput={}){
  const goal=typeof goalInput==='string'?goalInput:String(goalInput.goal||goalInput.title||'').trim();if(!goal)throw Object.assign(new Error('Describe the mission or company-level goal.'),{status:400});
  const state=this.stateManager.get(),agents=activeAgents(state),northStar=activeNorthStar(state);if(!agents.length)throw Object.assign(new Error('Activate at least one AI coworker before planning a mission.'),{status:409});
  const prompt=prompts.chiefOfStaff({goal,northStar,agents,maxTasks:this.config.maxPlanTasks});
  const response=await this.provider.generate({...prompt,responseSchema:planSchema,metadata:{action:'chief_of_staff'},context:{goal,northStar,agents,maxTasks:this.config.maxPlanTasks}});
  this.usageService.record(response,{purpose:'chief_of_staff'});const plan=response.data||{};
  validateDag(plan.tasks,this.config.maxPlanTasks,new Set(agents.map(a=>a.id)));
  const createdAt=now();const goalEntity={id:id('goal'),companyId:state.activeCompanyId,title:goal.slice(0,160),description:goal,status:'planning',successCriteria:[],createdAt,updatedAt:createdAt};state.goals.push(goalEntity);
  const project={id:id('prj'),companyId:state.activeCompanyId,title:goal.slice(0,160),objective:goal,goalIds:[goalEntity.id],status:(plan.clarifyingQuestions||[]).length?'needs_input':'draft_plan',planDraft:plan,northStarVersion:northStar?.version||null,createdBy:{type:'user',id:'local-user'},createdAt,updatedAt:createdAt};state.projects.push(project);
  this.eventService.append('project.plan_generated',{actor:{type:'agent',id:(agents.find(a=>/chief of staff/i.test(a.role))||agents[0]).id},entity:{type:'project',id:project.id},goalIds:project.goalIds,projectId:project.id,payload:{taskCount:plan.tasks.length,questions:plan.clarifyingQuestions||[]}});
  await this.stateManager.persist();return project;
 }
 get(projectId){const s=this.stateManager.get();return(s.projects||[]).find(p=>p.companyId===s.activeCompanyId&&p.id===projectId)||null;}
 list(){const s=this.stateManager.get();return(s.projects||[]).filter(p=>p.companyId===s.activeCompanyId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 graph(projectId){const p=this.get(projectId);if(!p)throw Object.assign(new Error('Project not found.'),{status:404});const s=this.stateManager.get();const tasks=(s.tasks||[]).filter(t=>t.projectId===p.id);const meetings=(s.meetings||[]).filter(m=>m.projectId===p.id);return{project:p,nodes:tasks.map(t=>({id:t.id,type:'task',title:t.title,status:t.status,assigneeAgentId:t.assigneeAgentId,dependencyIds:t.dependencyIds})),meetings,edges:tasks.flatMap(t=>(t.dependencyIds||[]).map(dep=>({from:dep,to:t.id,type:'depends_on'})))};}
 async activate(projectId){
  const state=this.stateManager.get(),p=this.get(projectId);if(!p)throw Object.assign(new Error('Project not found.'),{status:404});if(p.status!=='draft_plan')throw Object.assign(new Error('Only a draft plan can be activated.'),{status:409});const plan=p.planDraft,createdAt=now();const map=new Map();
  for(const spec of plan.tasks)map.set(spec.tempId,id('tsk'));
  const cos=(activeAgents(state).find(a=>/chief of staff/i.test(a.role))||activeAgents(state)[0]);
  const tasks=plan.tasks.map((spec,index)=>{const deps=(spec.dependsOn||[]).map(d=>map.get(d));return{id:map.get(spec.tempId),companyId:state.activeCompanyId,projectId:p.id,goalIds:p.goalIds,title:String(spec.title||`Task ${index+1}`).slice(0,160),brief:String(spec.description||'').slice(0,5000),description:String(spec.description||'').slice(0,5000),status:deps.length?'waiting_dependency':'queued',assigneeAgentId:spec.preferredAgentIds[0],collaboratorAgentIds:spec.collaborationSuggestedWith||[],requiredSkills:spec.requiredSkills||[],requiredToolIds:spec.requiredToolIds||[],dependencyIds:deps,priority:80-index,approvalPolicy:spec.approvalPolicy||'none',riskLevel:spec.riskLevel||'low',northStarVersion:p.northStarVersion,outputContract:spec.outputContract||{},runId:null,version:1,createdBy:{type:'agent',id:cos.id},createdAt,updatedAt:createdAt};});
  state.tasks.push(...tasks);
  const meetings=(plan.meetings||[]).slice(0,3).map((m,index)=>({id:id('mtg'),companyId:state.activeCompanyId,projectId:p.id,title:m.title||`Project meeting ${index+1}`,room:'meeting_room',agenda:m.agenda||'Review project work and produce a cross-functional recommendation.',goalIds:p.goalIds,participantAgentIds:(m.participantAgentIds||m.preferredAgentIds||[]).filter(x=>activeAgents(state).some(a=>a.id===x)).slice(0,4),moderatorAgentId:cos.id,status:'scheduled',maxRounds:Math.min(2,Math.max(1,m.maxRounds||1)),tokenBudget:12000,inputDeliverableIds:[],dependencyIds:(m.dependsOn||[]).map(d=>map.get(d)).filter(Boolean),outputContract:m.outputContract||{type:'decision_record'},contributions:[],createdAt,updatedAt:createdAt})).filter(m=>m.participantAgentIds.length>=2);
  state.meetings.push(...meetings);p.status='active';p.activatedAt=createdAt;p.updatedAt=createdAt;const goal=state.goals.find(g=>p.goalIds.includes(g.id));if(goal){goal.status='active';goal.updatedAt=createdAt;}
  this.eventService.append('project.plan_activated',{actor:{type:'user',id:'local-user'},entity:{type:'project',id:p.id},goalIds:p.goalIds,projectId:p.id,payload:{taskCount:tasks.length,meetingCount:meetings.length}});
  tasks.forEach(t=>{this.eventService.append('task.created',{actor:p.createdBy,entity:{type:'task',id:t.id},goalIds:t.goalIds,projectId:p.id,payload:{title:t.title,assigneeAgentId:t.assigneeAgentId}});if(t.status==='queued')this.eventService.append('task.queued',{actor:{type:'system',id:'scheduler'},entity:{type:'task',id:t.id},goalIds:t.goalIds,projectId:p.id});});
  meetings.forEach(m=>this.eventService.append('meeting.created',{actor:p.createdBy,entity:{type:'meeting',id:m.id},goalIds:m.goalIds,projectId:p.id,room:'meeting_room',payload:{participants:m.participantAgentIds}}));
  await this.stateManager.persist();return{project:p,tasks,meetings};
 }
 releaseDependencies(){const state=this.stateManager.get(),done=new Set((state.tasks||[]).filter(t=>t.status==='done').map(t=>t.id));let changed=false;for(const t of state.tasks||[]){if(t.companyId!==state.activeCompanyId||t.status!=='waiting_dependency')continue;if((t.dependencyIds||[]).every(d=>done.has(d))){t.status='queued';t.version=(t.version||0)+1;t.updatedAt=now();this.eventService.append('task.queued',{actor:{type:'system',id:'scheduler'},entity:{type:'task',id:t.id},goalIds:t.goalIds,projectId:t.projectId,payload:{releasedFromDependencies:true}});changed=true;}}return changed;}
 updateProjectCompletion(projectId){const state=this.stateManager.get(),p=(state.projects||[]).find(x=>x.id===projectId);if(!p)return false;const tasks=(state.tasks||[]).filter(t=>t.projectId===projectId);if(tasks.length&&tasks.every(t=>t.status==='done')){if(p.status!=='completed'){p.status='completed';p.completedAt=now();p.updatedAt=p.completedAt;this.eventService.append('project.completed',{actor:{type:'system',id:'scheduler'},entity:{type:'project',id:p.id},goalIds:p.goalIds,projectId:p.id});const goal=state.goals.find(g=>p.goalIds.includes(g.id));if(goal){goal.status='completed';goal.updatedAt=now();}return true;}}return false;}
}
module.exports={OrchestrationService,validateDag};
