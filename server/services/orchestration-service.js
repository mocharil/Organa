const {planSchema}=require('../ai/schemas');
const prompts=require('../prompts');
const {reuseRequest}=require('./request-identity');
const {id,now,activeAgents,activeNorthStar,shortTitle}=require('./helpers');

function validateDag(tasks,maxTasks,agentIds){
 if(!Array.isArray(tasks)||!tasks.length)throw Object.assign(new Error('Chief of Staff plan contains no tasks.'),{status:502});
 if(tasks.length>maxTasks)throw Object.assign(new Error(`Chief of Staff plan exceeds ${maxTasks} tasks.`),{status:502});
 const ids=new Set();for(const t of tasks){if(!t.tempId||ids.has(t.tempId))throw Object.assign(new Error('Plan task IDs must be unique.'),{status:502});ids.add(t.tempId);}
 for(const t of tasks){t.dependsOn=Array.isArray(t.dependsOn)?t.dependsOn:[];for(const dep of t.dependsOn)if(!ids.has(dep))throw Object.assign(new Error(`Task ${t.tempId} depends on unknown task ${dep}.`),{status:502});t.preferredAgentIds=(t.preferredAgentIds||[]).filter(a=>agentIds.has(a));if(!t.preferredAgentIds.length)throw Object.assign(new Error(`Task ${t.tempId} has no valid assignee.`),{status:502});}
 const visiting=new Set(),visited=new Set();function visit(x){if(visiting.has(x))throw Object.assign(new Error('Plan contains a circular dependency.'),{status:502});if(visited.has(x))return;visiting.add(x);const task=tasks.find(t=>t.tempId===x);for(const dep of task.dependsOn)visit(dep);visiting.delete(x);visited.add(x);}ids.forEach(visit);return tasks;
}

function buildRoutingSummary(plan,agents,coordinator){
 const assignments=(plan.tasks||[]).map(task=>({tempId:task.tempId,title:task.title,ownerAgentId:task.preferredAgentIds?.[0]||null,collaboratorAgentIds:(task.collaborationSuggestedWith||[]).filter(Boolean),reason:task.reason||''}));
 const counts=new Map();for(const item of assignments)if(item.ownerAgentId)counts.set(item.ownerAgentId,(counts.get(item.ownerAgentId)||0)+1);
 const primaryAgentId=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||assignments[0]?.ownerAgentId||null;
 const participantAgentIds=[...new Set(assignments.flatMap(item=>[item.ownerAgentId,...item.collaboratorAgentIds]).filter(id=>agents.some(agent=>agent.id===id)))];
 return{mode:'chief_of_staff',coordinatorAgentId:coordinator?.id||null,primaryAgentId,participantAgentIds,assignments,rationale:'Organa matched each workstream to active employee skills and role ownership, while the Chief of Staff coordinates dependencies and synthesis.'};
}

class OrchestrationService{
 constructor({stateManager,provider,eventService,usageService,config}){Object.assign(this,{stateManager,provider,eventService,usageService,config});this.requests=new Map();this.answerRequests=new Map();}
 async plan(goalInput={}){const payload={goal:typeof goalInput==='string'?goalInput:String(goalInput.goal||goalInput.title||'').trim(),webResearch:Boolean(goalInput&&goalInput.webResearch)};return reuseRequest({stateManager:this.stateManager,collection:'projects',pending:this.requests,input:goalInput,payload,create:metadata=>this.createPlan(goalInput,metadata)});}
 async createPlan(goalInput={},metadata={}){
  const goal=typeof goalInput==='string'?goalInput:String(goalInput.goal||goalInput.title||'').trim();if(!goal)throw Object.assign(new Error('Describe the mission or company-level goal.'),{status:400});
  const state=this.stateManager.get(),companyId=state.activeCompanyId,agents=activeAgents(state),northStar=activeNorthStar(state);if(!agents.length)throw Object.assign(new Error('Activate at least one AI coworker before planning a mission.'),{status:409});
  const prompt=prompts.chiefOfStaff({goal,northStar,agents,maxTasks:this.config.maxPlanTasks});
  const response=await this.provider.generate({...prompt,responseSchema:planSchema,metadata:{action:'chief_of_staff'},context:{goal,northStar,agents,maxTasks:this.config.maxPlanTasks}});
  if(this.stateManager.get()!==state||state.activeCompanyId!==companyId)throw Object.assign(new Error('The organization changed while this plan was prepared.'),{status:409});this.usageService.record(response,{purpose:'chief_of_staff'});const plan=response.data||{};
  if(!(plan.clarifyingQuestions||[]).length||plan.tasks?.length)validateDag(plan.tasks,this.config.maxPlanTasks,new Set(agents.map(a=>a.id)));else plan.tasks=[];
  const createdAt=now();const coordinator=(agents.find(a=>/chief of staff/i.test(a.role))||agents[0]);const routing=buildRoutingSummary(plan,agents,coordinator);const goalEntity={id:id('goal'),companyId:state.activeCompanyId,title:shortTitle(goal),description:goal,status:'planning',successCriteria:[],createdAt,updatedAt:createdAt};state.goals.push(goalEntity);
  const project={...metadata,id:id('prj'),companyId:state.activeCompanyId,title:shortTitle(goal),objective:goal,webResearch:Boolean(goalInput&&typeof goalInput==='object'&&goalInput.webResearch),goalIds:[goalEntity.id],status:(plan.clarifyingQuestions||[]).length?'needs_input':'draft_plan',intakeMode:'chief_of_staff',routing,planDraft:plan,northStarVersion:northStar?.version||null,createdBy:{type:'user',id:'local-user'},createdAt,updatedAt:createdAt};state.projects.push(project);
  this.eventService.append('project.plan_generated',{actor:{type:'agent',id:(agents.find(a=>/chief of staff/i.test(a.role))||agents[0]).id},entity:{type:'project',id:project.id},goalIds:project.goalIds,projectId:project.id,payload:{taskCount:plan.tasks.length,questions:plan.clarifyingQuestions||[],intakeMode:'chief_of_staff',routing}});
  try{await this.stateManager.persist();}catch(error){state.projects=state.projects.filter(item=>item.id!==project.id);state.goals=state.goals.filter(item=>item.id!==goalEntity.id);state.events=state.events.filter(item=>item.projectId!==project.id);throw error;}return project;
 }
 async answer(projectId,input={}){
  const p=this.get(projectId);if(!p)throw Object.assign(new Error('Project not found.'),{status:404});
  const answer=String(input.answer||'').trim(),requestId=input.clientRequestId;
  if(!answer||answer.length>3000)throw Object.assign(new Error('Provide an answer of at most 3000 characters.'),{status:400});
  if(typeof requestId!=='string'||!requestId.trim()||requestId.length>160)throw Object.assign(new Error('A valid request identity is required.'),{status:400});
  const baseVersion=input.expectedPlanVersion===undefined?(p.planVersion||1):Number(input.expectedPlanVersion);
  const previous=(p.clarificationHistory||[]).find(entry=>entry.clientRequestId===requestId);
  if(previous){if(previous.answer!==answer||(input.expectedPlanVersion!==undefined&&previous.baseVersion!==baseVersion))throw Object.assign(new Error('This request identity belongs to a different answer.'),{status:409});await this.stateManager.persist();return p;}
  const running=this.answerRequests.get(projectId);
  if(running){if(running.requestId===requestId&&running.answer===answer&&running.baseVersion===baseVersion)return running.promise;throw Object.assign(new Error('An answer is already being saved for this mission.'),{status:409});}
  if(p.status!=='needs_input'||baseVersion!==(p.planVersion||1))throw Object.assign(new Error('This mission changed. Review the latest plan before answering.'),{status:409});
  const promise=this.regeneratePlan(p,{answer,requestId,baseVersion});this.answerRequests.set(projectId,{requestId,answer,baseVersion,promise});
  try{return await promise;}finally{this.answerRequests.delete(projectId);}
 }
 async regeneratePlan(p,{answer,requestId,baseVersion}){
  const state=this.stateManager.get(),companyId=state.activeCompanyId,agents=activeAgents(state),northStar=activeNorthStar(state);
  if(!agents.length)throw Object.assign(new Error('Activate an AI coworker before continuing this mission.'),{status:409});
  const history=p.clarificationHistory||[],questions=p.planDraft?.clarifyingQuestions||[];
  const goal=p.objective+'\n\nHUMAN CLARIFICATIONS:\n'+JSON.stringify([...history.map(entry=>({questions:entry.questions,answer:entry.answer})),{questions,answer}]);
  const response=await this.provider.generate({...prompts.chiefOfStaff({goal,northStar,agents,maxTasks:this.config.maxPlanTasks}),responseSchema:planSchema,metadata:{action:'chief_of_staff'},context:{goal,northStar,agents,maxTasks:this.config.maxPlanTasks}});
  if(this.stateManager.get()!==state||state.activeCompanyId!==companyId||this.get(p.id)!==p)throw Object.assign(new Error('The organization changed while this plan was prepared.'),{status:409});
  this.usageService.record(response,{purpose:'chief_of_staff_clarification',projectId:p.id});const plan=response.data||{},currentAgents=activeAgents(state);
  if(!(plan.clarifyingQuestions||[]).length||plan.tasks?.length)validateDag(plan.tasks,this.config.maxPlanTasks,new Set(currentAgents.map(a=>a.id)));else plan.tasks=[];
  const original=structuredClone(p),createdAt=now(),coordinator=currentAgents.find(a=>/chief of staff/i.test(a.role))||currentAgents[0];
  p.clarificationHistory=[...history,{clientRequestId:requestId,baseVersion,questions,answer,previousPlan:p.planDraft,createdAt}];p.planDraft=plan;p.planVersion=baseVersion+1;p.status=(plan.clarifyingQuestions||[]).length?'needs_input':'draft_plan';p.routing=buildRoutingSummary(plan,currentAgents,coordinator);p.northStarVersion=northStar?.version||null;p.updatedAt=createdAt;
  const event=this.eventService.append('project.clarification_answered',{actor:{type:'user',id:'local-user'},entity:{type:'project',id:p.id},projectId:p.id,goalIds:p.goalIds,payload:{planVersion:p.planVersion,taskCount:plan.tasks.length,questionCount:plan.clarifyingQuestions?.length||0}});
  try{await this.stateManager.persist();}catch(error){for(const key of Object.keys(p))delete p[key];Object.assign(p,original);state.events=state.events.filter(item=>item.id!==event.id);throw error;}return p;
 }
 get(projectId){const s=this.stateManager.get();return(s.projects||[]).find(p=>p.companyId===s.activeCompanyId&&p.id===projectId)||null;}
 list(){const s=this.stateManager.get();return(s.projects||[]).filter(p=>p.companyId===s.activeCompanyId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 graph(projectId){const p=this.get(projectId);if(!p)throw Object.assign(new Error('Project not found.'),{status:404});const s=this.stateManager.get();const tasks=(s.tasks||[]).filter(t=>t.projectId===p.id);const meetings=(s.meetings||[]).filter(m=>m.projectId===p.id);return{project:p,nodes:tasks.map(t=>({id:t.id,type:'task',title:t.title,status:t.status,assigneeAgentId:t.assigneeAgentId,dependencyIds:t.dependencyIds})),meetings,edges:tasks.flatMap(t=>(t.dependencyIds||[]).map(dep=>({from:dep,to:t.id,type:'depends_on'})))};}
 async activate(projectId){
  const state=this.stateManager.get(),p=this.get(projectId);if(!p)throw Object.assign(new Error('Project not found.'),{status:404});if(p.activatedAt){const tasks=state.tasks.filter(t=>t.projectId===p.id),meetings=state.meetings.filter(m=>m.projectId===p.id);await this.stateManager.persist();return{project:p,tasks,meetings};}if(p.status!=='draft_plan')throw Object.assign(new Error('Only a draft plan can be activated.'),{status:409});const plan=p.planDraft,createdAt=now();const currentAgents=activeAgents(state);if(plan.tasks.some(spec=>!currentAgents.some(a=>a.id===spec.preferredAgentIds?.[0])))throw Object.assign(new Error('A planned owner is no longer active. Update the team before starting.'),{status:409});validateDag(structuredClone(plan.tasks),this.config.maxPlanTasks,new Set(currentAgents.map(a=>a.id)));const original=structuredClone(p);const map=new Map();
  for(const spec of plan.tasks)map.set(spec.tempId,id('tsk'));
  const cos=(activeAgents(state).find(a=>/chief of staff/i.test(a.role))||activeAgents(state)[0]);
  const tasks=plan.tasks.map((spec,index)=>{const deps=(spec.dependsOn||[]).map(d=>map.get(d));return{id:map.get(spec.tempId),companyId:state.activeCompanyId,projectId:p.id,goalIds:p.goalIds,title:String(spec.title||`Task ${index+1}`).slice(0,160),brief:String(spec.description||'').slice(0,5000),description:String(spec.description||'').slice(0,5000),status:deps.length?'waiting_dependency':'queued',webResearch:Boolean(p.webResearch),assigneeAgentId:spec.preferredAgentIds[0],collaboratorAgentIds:spec.collaborationSuggestedWith||[],requiredSkills:spec.requiredSkills||[],requiredToolIds:spec.requiredToolIds||[],dependencyIds:deps,priority:80-index,approvalPolicy:spec.approvalPolicy||'none',riskLevel:spec.riskLevel||'low',northStarVersion:p.northStarVersion,outputContract:spec.outputContract||{},runId:null,version:1,createdBy:{type:'agent',id:cos.id},createdAt,updatedAt:createdAt};});
  state.tasks.push(...tasks);
  const meetings=(plan.meetings||[]).slice(0,3).map((m,index)=>({id:id('mtg'),companyId:state.activeCompanyId,projectId:p.id,title:m.title||`Project meeting ${index+1}`,room:'meeting_room',agenda:m.agenda||'Review project work and produce a cross-functional recommendation.',goalIds:p.goalIds,participantAgentIds:(m.participantAgentIds||m.preferredAgentIds||[]).filter(x=>activeAgents(state).some(a=>a.id===x)).slice(0,4),moderatorAgentId:cos.id,status:'scheduled',maxRounds:Math.min(2,Math.max(1,m.maxRounds||1)),tokenBudget:12000,inputDeliverableIds:[],dependencyIds:(m.dependsOn||[]).map(d=>map.get(d)).filter(Boolean),outputContract:m.outputContract||{type:'decision_record'},contributions:[],createdAt,updatedAt:createdAt})).filter(m=>m.participantAgentIds.length>=2);
  state.meetings.push(...meetings);p.status='active';p.activatedAt=createdAt;p.updatedAt=createdAt;const goal=state.goals.find(g=>p.goalIds.includes(g.id));if(goal){goal.status='active';goal.updatedAt=createdAt;}
  this.eventService.append('project.plan_activated',{actor:{type:'user',id:'local-user'},entity:{type:'project',id:p.id},goalIds:p.goalIds,projectId:p.id,payload:{taskCount:tasks.length,meetingCount:meetings.length}});
  tasks.forEach(t=>{this.eventService.append('task.created',{actor:p.createdBy,entity:{type:'task',id:t.id},goalIds:t.goalIds,projectId:p.id,payload:{title:t.title,assigneeAgentId:t.assigneeAgentId}});if(t.status==='queued')this.eventService.append('task.queued',{actor:{type:'system',id:'scheduler'},entity:{type:'task',id:t.id},goalIds:t.goalIds,projectId:p.id});});
  meetings.forEach(m=>this.eventService.append('meeting.created',{actor:p.createdBy,entity:{type:'meeting',id:m.id},goalIds:m.goalIds,projectId:p.id,room:'meeting_room',payload:{participants:m.participantAgentIds}}));
  try{await this.stateManager.persist();}catch(error){state.tasks=state.tasks.filter(t=>t.projectId!==p.id);state.meetings=state.meetings.filter(m=>m.projectId!==p.id);state.events=state.events.filter(e=>e.projectId!==p.id||['project.plan_generated'].includes(e.type));for(const key of Object.keys(p))delete p[key];Object.assign(p,original);const goal=state.goals.find(g=>p.goalIds.includes(g.id));if(goal)goal.status='planning';throw error;}return{project:p,tasks,meetings};
 }
 releaseDependencies(){const state=this.stateManager.get(),done=new Set((state.tasks||[]).filter(t=>t.status==='done').map(t=>t.id));let changed=false;for(const t of state.tasks||[]){if(t.companyId!==state.activeCompanyId||t.status!=='waiting_dependency')continue;if((t.dependencyIds||[]).every(d=>done.has(d))){t.status='queued';t.version=(t.version||0)+1;t.updatedAt=now();this.eventService.append('task.queued',{actor:{type:'system',id:'scheduler'},entity:{type:'task',id:t.id},goalIds:t.goalIds,projectId:t.projectId,payload:{releasedFromDependencies:true}});changed=true;}}return changed;}
 updateProjectCompletion(projectId){const state=this.stateManager.get(),p=(state.projects||[]).find(x=>x.id===projectId);if(!p)return false;const tasks=(state.tasks||[]).filter(t=>t.projectId===projectId);if(tasks.length&&tasks.every(t=>t.status==='done')){if(p.status!=='completed'){p.status='completed';p.completedAt=now();p.updatedAt=p.completedAt;this.eventService.append('project.completed',{actor:{type:'system',id:'scheduler'},entity:{type:'project',id:p.id},goalIds:p.goalIds,projectId:p.id});const goal=state.goals.find(g=>p.goalIds.includes(g.id));if(goal){goal.status='completed';goal.updatedAt=now();}return true;}}return false;}
}
module.exports={OrchestrationService,validateDag};
