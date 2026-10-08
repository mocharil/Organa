const {participantSchema,moderatorSchema}=require('../ai/schemas');
const prompts=require('../prompts');
const {now,activeNorthStar}=require('./helpers');

const fail=(message,status=502)=>Object.assign(new Error(message),{status});
function contributionData(data){
 if(!data||Array.isArray(data)||typeof data.position!=='string'||!data.position.trim())throw fail('The AI returned an unreadable meeting contribution. Retry the meeting.');
 const result={position:data.position.trim().slice(0,8000)};
 for(const key of ['evidenceRefs','risks','recommendations','questionsForOthers','assumptions']){
  if(!Array.isArray(data[key])||data[key].some(item=>typeof item!=='string'))throw fail('The AI returned a malformed meeting contribution. Retry the meeting.');
  result[key]=data[key].slice(0,30).map(item=>item.slice(0,2000));
 }
 return result;
}
function moderatorData(data){
 if(!data||Array.isArray(data)||typeof data.summary!=='string'||!data.summary.trim())throw fail('The AI returned an unreadable meeting decision. Retry the meeting.');
 const result={summary:data.summary.trim().slice(0,8000)};
 for(const key of ['agreements','disagreements','recommendations','unresolvedQuestions']){
  if(!Array.isArray(data[key])||data[key].some(item=>typeof item!=='string'))throw fail('The AI returned a malformed meeting decision. Retry the meeting.');
  result[key]=data[key].slice(0,30).map(item=>item.slice(0,2000));
 }
 if(!Array.isArray(data.decisions)||!Array.isArray(data.actionItems)||!data.deliverable||Array.isArray(data.deliverable)||typeof data.deliverable!=='object')throw fail('The AI returned a malformed decision record. Retry the meeting.');
 result.decisions=data.decisions.slice(0,30);result.actionItems=data.actionItems.slice(0,30);
 result.deliverable={title:typeof data.deliverable.title==='string'?data.deliverable.title.slice(0,160):'',type:typeof data.deliverable.type==='string'?data.deliverable.type.slice(0,80):'decision_record'};
 return result;
}

class MeetingService{
 constructor({stateManager,provider,eventService,usageService,deliverableService,approvalService,config}){Object.assign(this,{stateManager,provider,eventService,usageService,deliverableService,approvalService,config});this.busy=new Set();this.reviews=new Map();}
 list(){const s=this.stateManager.get();return(s.meetings||[]).filter(m=>m.companyId===s.activeCompanyId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 get(id){const s=this.stateManager.get();return(s.meetings||[]).find(m=>m.companyId===s.activeCompanyId&&m.id===id)||null;}
 canStart(m){const s=this.stateManager.get(),done=new Set((s.tasks||[]).filter(t=>t.companyId===m.companyId&&t.status==='done').map(t=>t.id));return(m.dependencyIds||[]).every(d=>done.has(d));}
 async start(meetingId){const m=this.get(meetingId);if(!m)throw Object.assign(new Error('Meeting not found.'),{status:404});if(this.busy.has(m.id))throw Object.assign(new Error('Meeting is already running.'),{status:409});if(!['scheduled','needs_input','failed'].includes(m.status))throw Object.assign(new Error('Meeting cannot start from its current state.'),{status:409});if(!this.canStart(m))throw Object.assign(new Error('Meeting dependencies are not finished yet.'),{status:409});
  const s=this.stateManager.get(),participantIds=[...new Set(m.participantAgentIds||[])],available=(s.agents||[]).filter(a=>a.companyId===m.companyId&&a.status==='active');
  if(participantIds.length<2||participantIds.length>4)throw fail('Meeting needs two to four distinct active participants.',409);
  if(participantIds.some(id=>!available.some(a=>a.id===id)))throw fail('Activate every selected participant before starting this meeting.',409);
  if(!available.some(a=>a.id===m.moderatorAgentId))throw fail('Activate the meeting coordinator before starting this meeting.',409);
  m.participantAgentIds=participantIds;delete m.error;this.busy.add(m.id);
  const previous={deliverableId:m.deliverableId,approvalId:m.approvalId,result:m.result},created={deliverableId:null,approvalId:null,eventIds:new Set()};
  const checkContext=()=>{if(this.stateManager.get()!==s||s.activeCompanyId!==m.companyId)throw fail('The organization changed during this meeting. Return to its team and retry.',409);};
  try{
  m.status='in_progress';m.startedAt=now();m.updatedAt=m.startedAt;this.eventService.append('meeting.started',{actor:{type:'system',id:'orchestrator'},entity:{type:'meeting',id:m.id},goalIds:m.goalIds,projectId:m.projectId,room:'meeting_room',payload:{participants:m.participantAgentIds}});await this.stateManager.persist();
  checkContext();const northStar=structuredClone(activeNorthStar(s));const agents=available.filter(a=>participantIds.includes(a.id)).map(a=>structuredClone(a));
  const dependencyDeliverables=(m.dependencyIds||[]).map(tid=>s.tasks.find(t=>t.id===tid)?.deliverableId).filter(Boolean).map(id=>this.deliverableService.get(id)).filter(Boolean).map(d=>({id:d.id,title:d.title,content:d.versions?.find(v=>v.id===d.currentVersionId)?.content||''}));
  const contributions=[];
  for(const agent of agents.slice(0,4)){
   const prompt=prompts.meetingParticipant({agent,agenda:m.agenda,northStar,inputs:dependencyDeliverables,reviewNote:m.reviewNote,previousResult:previous.result});const r=await this.provider.generate({provider:agent.modelPolicy?.provider,model:agent.modelPolicy?.defaultModel,...prompt,responseSchema:participantSchema,metadata:{action:'meeting_participant',meetingId:m.id,agentId:agent.id},context:{agent,agenda:m.agenda,northStar,inputs:dependencyDeliverables,reviewNote:m.reviewNote,previousResult:previous.result}});checkContext();this.usageService.record(r,{agentId:agent.id,projectId:m.projectId,meetingId:m.id,purpose:'meeting_participant'});const c={...contributionData(r.data),id:`con_${agent.id}_${Date.now()}`,agentId:agent.id,agentName:agent.displayName,role:agent.role,createdAt:now()};c.evidenceRefs=c.evidenceRefs.filter(ref=>dependencyDeliverables.some(d=>ref===`deliverable:${d.id}`));contributions.push(c);this.eventService.append('meeting.contribution_added',{actor:{type:'agent',id:agent.id},entity:{type:'meeting',id:m.id},goalIds:m.goalIds,projectId:m.projectId,room:'meeting_room',payload:{contributionId:c.id}});
  }
  m.status='synthesizing';m.contributions=contributions;m.updatedAt=now();await this.stateManager.persist();
  checkContext();const moderator=available.find(a=>a.id===m.moderatorAgentId);const modPrompt=prompts.meetingModerator({agenda:m.agenda,northStar,contributions,outputContract:m.outputContract,reviewNote:m.reviewNote,previousResult:previous.result});const r=await this.provider.generate({provider:moderator.modelPolicy?.provider,model:moderator.modelPolicy?.defaultModel,...modPrompt,responseSchema:moderatorSchema,metadata:{action:'meeting_moderator',meetingId:m.id,agentId:moderator.id},context:{agenda:m.agenda,northStar,contributions,inputDeliverables:dependencyDeliverables,outputContract:m.outputContract,reviewNote:m.reviewNote,previousResult:previous.result}});checkContext();this.usageService.record(r,{agentId:moderator.id,projectId:m.projectId,meetingId:m.id,purpose:'meeting_moderator'});const result=moderatorData(r.data);
  const beforeFinalEvents=new Set((s.events||[]).map(e=>e.id));
  const content=[result.summary||'',...(result.agreements?.length?['','Agreements:',...result.agreements.map(x=>`- ${x}`)]:[]),...(result.disagreements?.length?['','Disagreements:',...result.disagreements.map(x=>`- ${x}`)]:[]),...(result.recommendations?.length?['','Recommendations:',...result.recommendations.map(x=>`- ${x}`)]:[])].join('\n').trim();
  const deliverable=this.deliverableService.create({title:result.deliverable?.title||m.title,type:result.deliverable?.type||m.outputContract?.type||'decision_record',content,structuredData:result,createdBy:{type:'agent',id:moderator.id},goalIds:m.goalIds,projectId:m.projectId,evidenceRefs:dependencyDeliverables.map(d=>`deliverable:${d.id}`),assumptions:contributions.flatMap(c=>c.assumptions||[]),uncertainties:result.unresolvedQuestions||[],goalAlignment:m.goalIds.map(x=>`goal:${x}`),constraintChecks:(northStar?.constraints||[]).map(c=>`Checked: ${c.text}`),collaboratorAgentIds:agents.map(a=>a.id),decisionSummary:result.summary||'',status:'needs_review',northStarVersion:northStar?.version||null,agentPromptVersion:moderator.promptVersion||1});
  created.deliverableId=deliverable.id;m.deliverableId=deliverable.id;m.status='review';m.result=result;m.completedAt=now();m.updatedAt=m.completedAt;const approval=this.approvalService.request({entityType:'meeting',entityId:m.id,title:`Approve meeting decision: ${m.title}`,summary:result.summary||'Cross-functional decision requires human approval.',projectId:m.projectId,goalIds:m.goalIds,requestedBy:{type:'agent',id:moderator.id}});created.approvalId=approval.id;m.approvalId=approval.id;this.eventService.append('meeting.completed',{actor:{type:'agent',id:moderator.id},entity:{type:'meeting',id:m.id},goalIds:m.goalIds,projectId:m.projectId,room:'meeting_room',payload:{deliverableId:deliverable.id,approvalId:approval.id,participants:m.participantAgentIds}});created.eventIds=new Set((s.events||[]).filter(e=>!beforeFinalEvents.has(e.id)).map(e=>e.id));await this.stateManager.persist();return m;
 }catch(error){
  if(this.stateManager.get()!==s)throw error;
  if(created.deliverableId){s.deliverables=s.deliverables.filter(d=>d.id!==created.deliverableId);s.approvals=s.approvals.filter(a=>a.id!==created.approvalId);s.events=s.events.filter(e=>!created.eventIds.has(e.id));Object.assign(m,previous);}
  m.status='failed';m.error=String(error.message||error).slice(0,1000);m.updatedAt=now();this.eventService.append('meeting.failed',{companyId:m.companyId,actor:{type:'system',id:'orchestrator'},entity:{type:'meeting',id:m.id},goalIds:m.goalIds,projectId:m.projectId,room:'meeting_room',payload:{participants:m.participantAgentIds,error:m.error}});try{await this.stateManager.persist();}catch{}throw error;
 }finally{this.busy.delete(m.id);}}
 async approve(meetingId,approved=true,note='',expectedApprovalId=null){
  const pending=this.reviews.get(meetingId),request=JSON.stringify({approved,note,expectedApprovalId});
  if(pending){if(pending.request!==request)throw fail('This decision is already being reviewed.',409);return pending.promise;}
  const promise=this.reviewDecision(meetingId,approved,note,expectedApprovalId);this.reviews.set(meetingId,{request,promise});
  try{return await promise;}finally{this.reviews.delete(meetingId);}
 }
 async reviewDecision(meetingId,approved,note,expectedApprovalId){
  const m=this.get(meetingId);if(!m)throw fail('Meeting not found.',404);
  if(typeof note!=='string'||note.length>3000)throw fail('Revision feedback must be text up to 3000 characters.',400);note=note.trim();
  if(!approved&&!note)throw fail('Describe the changes needed before requesting a revision.',400);
  if(expectedApprovalId&&m.approvalId!==expectedApprovalId)throw fail('This decision changed. Review the latest meeting result.',409);
  const target=approved?'completed':'needs_input';
  if(m.status===target&&(approved||m.reviewNote===note))return m;
  if(m.status!=='review')throw fail('Meeting is not waiting for review.',409);
  const a=m.approvalId&&this.approvalService.get(m.approvalId),d=m.deliverableId&&this.deliverableService.get(m.deliverableId);
  if(!a||a.status!=='pending'||!d)throw fail('The decision record changed. Refresh and review the latest result.',409);
  const s=this.stateManager.get(),records=[m,a,d],originals=records.map(record=>structuredClone(record)),oldEvents=new Set((s.events||[]).map(e=>e.id));
  this.approvalService.resolve(a.id,approved?'approved':'revision_requested',note);Object.assign(m,{status:target,reviewNote:note,updatedAt:now()});Object.assign(d,{status:approved?'approved':'needs_revision',updatedAt:now()});
  this.eventService.append(approved?'meeting.approved':'meeting.revision_requested',{actor:{type:'user',id:'local-user'},entity:{type:'meeting',id:m.id},goalIds:m.goalIds,projectId:m.projectId,payload:{approvalId:a.id,deliverableId:d.id,note}});
  const added=new Set((s.events||[]).filter(e=>!oldEvents.has(e.id)).map(e=>e.id));
  try{await this.stateManager.persist();return m;}catch(error){records.forEach((record,index)=>{Object.keys(record).forEach(key=>delete record[key]);Object.assign(record,originals[index]);});s.events=s.events.filter(e=>!added.has(e.id));throw error;}
 }
}
module.exports={MeetingService};
