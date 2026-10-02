const {companyProposalSchema} = require('../ai/schemas');
const prompts = require('../prompts');
const {id, now, activeAgents, avatarFor} = require('./helpers');
const {templates} = require('../data/team-templates');

class BootstrapService {
  constructor({stateManager, provider, eventService, usageService, config}) { Object.assign(this,{stateManager,provider,eventService,usageService,config}); }

  listTemplates() {
    return templates.map(t => ({id:t.id,name:t.name,category:t.category,version:t.version,description:t.description,teamSize:t.recommendedTeam.length}));
  }

  async fromTemplate(templateId, input={}) {
    const template=templates.find(t=>t.id===templateId);
    if(!template) throw Object.assign(new Error('Team template not found.'),{status:404});
    const data=JSON.parse(JSON.stringify(template));
    delete data.id; delete data.name; delete data.category; delete data.version; delete data.description;
    data.companyProfile={...data.companyProfile,name:String(input.name||'New Company').trim().slice(0,120),description:String(input.description||input.goal||template.description).trim().slice(0,500)};
    if(input.goal){
      const goal=String(input.goal).trim().slice(0,1000);
      data.initialGoals=[{title:goal.slice(0,160),description:goal,deadline:null,successCriteria:['A reviewable cross-functional outcome is produced'],suggestedKpis:[]}];
    }
    data.initialTasks=[];
    data.approvalPolicyDraft={externalAction:'human_approval',spending:'human_approval',policyChange:'human_approval'};
    data.assumptions=[`Started from the ${template.name} template. Review every role and constraint before activation.`];
    data.questions=[];
    const proposal=this.validateProposal(data,input);
    const entity={id:id('cbp'),status:'draft',source:{type:'template',templateId,templateVersion:template.version},proposal,createdAt:now(),updatedAt:now()};
    const state=this.stateManager.get(); state.bootstrapProposals ||= []; state.bootstrapProposals.push(entity);
    this.eventService.append('company.template_proposed',{entity:{type:'bootstrapProposal',id:entity.id},payload:{templateId,templateVersion:template.version,companyName:proposal.companyProfile.name}});
    await this.stateManager.persist();
    return entity;
  }

  async propose(input) {
    const state=this.stateManager.get();
    const prompt=prompts.companyArchitect({input,tools:[{id:'company_context_read',description:'Read approved company context and deliverables'}]});
    const response=await this.provider.generate({...prompt,responseSchema:companyProposalSchema,metadata:{action:'company_architect'},context:{companyInput:input}});
    this.usageService.record(response,{purpose:'company_architect'});
    const proposal=this.validateProposal(response.data,input);
    const entity={id:id('cbp'),status:'draft',proposal,createdAt:now(),updatedAt:now()};
    state.bootstrapProposals ||= []; state.bootstrapProposals.push(entity);
    this.eventService.append('company.bootstrap_proposed',{entity:{type:'bootstrapProposal',id:entity.id},payload:{companyName:proposal.companyProfile.name}});
    await this.stateManager.persist();
    return entity;
  }

  validateProposal(data,input={}) {
    if(!data||typeof data!=='object') throw Object.assign(new Error('Company Architect returned no structured proposal.'),{status:502});
    const team=Array.isArray(data.recommendedTeam)?data.recommendedTeam.slice(0,7):[];
    if(!team.length) throw Object.assign(new Error('Company proposal needs at least one AI coworker.'),{status:502});
    const ids=new Set(team.map(r=>r.tempId));
    for(const role of team){if(role.reportsToTempId&&!ids.has(role.reportsToTempId))role.reportsToTempId=null;}
    const hasChief=team.some(r=>/chief of staff/i.test(r.role));
    if(!hasChief){team.unshift({tempId:'role_cos',displayNameSuggestion:'Ari',role:'AI Chief of Staff',division:'Leadership',reportsToTempId:null,purpose:'Coordinate the team and turn owner goals into bounded work plans.',responsibilities:['planning','coordination'],skills:['planning','coordination'],requestedToolIds:['company_context_read'],boundaries:['Cannot act as CEO or approve high-impact actions'],recommendedAutonomy:'draft_and_recommend',whyNeeded:'A single coordination layer prevents a mesh of agents from becoming chaotic.'});}
    data.recommendedTeam=team.slice(0,7);
    data.companyProfile ||= {};
    if(input.name&&!data.companyProfile.name)data.companyProfile.name=input.name;
    data.northStarDraft ||= {mission:'',vision:'',principles:[],hardConstraints:[],softPreferences:[]};
    data.initialGoals=Array.isArray(data.initialGoals)?data.initialGoals.slice(0,3):[];
    data.initialTasks=Array.isArray(data.initialTasks)?data.initialTasks.slice(0,5):[];
    data.assumptions=Array.isArray(data.assumptions)?data.assumptions:[];
    data.questions=Array.isArray(data.questions)?data.questions:[];
    return data;
  }

  get(idValue){return (this.stateManager.get().bootstrapProposals||[]).find(p=>p.id===idValue)||null;}

  async activate(proposalId, overrides={}) {
    const state=this.stateManager.get(), entity=this.get(proposalId);
    if(!entity) throw Object.assign(new Error('Bootstrap proposal not found.'),{status:404});
    if(entity.status==='activated') throw Object.assign(new Error('This proposal is already activated.'),{status:409});
    const p=JSON.parse(JSON.stringify(entity.proposal));
    if(overrides.companyName)p.companyProfile.name=String(overrides.companyName).trim().slice(0,120);
    if(overrides.mission)p.northStarDraft.mission=String(overrides.mission).trim().slice(0,1000);
    if(overrides.vision)p.northStarDraft.vision=String(overrides.vision).trim().slice(0,1000);
    if(Array.isArray(overrides.hardConstraints))p.northStarDraft.hardConstraints=overrides.hardConstraints.map(String).map(s=>s.trim()).filter(Boolean).slice(0,12);
    if(Array.isArray(overrides.team)) {
      const byId=new Map(overrides.team.map(t=>[t.tempId,t]));
      p.recommendedTeam=p.recommendedTeam.filter(role=>byId.get(role.tempId)?.enabled!==false).map(role=>({...role,...(byId.get(role.tempId)||{})}));
    }
    if(!p.recommendedTeam.length) throw Object.assign(new Error('Activate at least one AI coworker.'),{status:400});
    const companyId=id('cmp'), createdAt=now();
    const company={id:companyId,name:p.companyProfile.name||'New Company',description:p.companyProfile.description||'',industry:p.companyProfile.industry||'',stage:p.companyProfile.stage||'',audience:p.companyProfile.audience||'',timezone:'Asia/Jakarta',status:'active',createdBy:'local-user',createdAt,updatedAt:createdAt};
    const northStar={id:id('ns'),companyId,version:1,status:'active',mission:p.northStarDraft.mission||'',vision:p.northStarDraft.vision||'',principles:p.northStarDraft.principles||[],constraints:[...(p.northStarDraft.hardConstraints||[]).map((text,i)=>({id:`hard_${i+1}`,type:'policy',text,severity:'hard'})),...(p.northStarDraft.softPreferences||[]).map((text,i)=>({id:`soft_${i+1}`,type:'preference',text,severity:'soft'}))],activeGoalIds:[],kpis:[],changedBy:'local-user',changeNote:'Activated from Company Architect proposal',createdAt};
    const tempMap=new Map();
    p.recommendedTeam.forEach(role=>tempMap.set(role.tempId,id('agt')));
    const agents=p.recommendedTeam.map((role,index)=>({
      id:tempMap.get(role.tempId),companyId,displayName:role.displayNameSuggestion||`Agent ${index+1}`,role:role.role||'Specialist',division:role.division||'General',managerAgentId:role.reportsToTempId?tempMap.get(role.reportsToTempId)||null:null,
      purpose:role.purpose||'',responsibilities:role.responsibilities||[],skills:(role.skills||[]).map(s=>typeof s==='string'?{name:s,level:'advanced'}:s),toolPolicyIds:role.requestedToolIds||['company_context_read'],
      modelPolicy:{provider:'inherit',defaultModel:null,reasoningTier:'balanced',maxOutputTokens:3000},
      systemPrompt:`You are the ${role.role} inside ${company.name}. ${role.purpose||''}\nRespect the Company North Star, separate facts from assumptions, and escalate missing critical information.`,personality:'Professional, concise, evidence-aware and collaborative.',boundaries:role.boundaries||[],evaluationCriteria:['factuality','goal alignment','constraint compliance','usefulness'],status:'active',concurrencyLimit:1,promptVersion:1,avatar:avatarFor(role.displayNameSuggestion,role.division,index),createdAt,updatedAt:createdAt,
    }));
    const goals=(p.initialGoals||[]).map(g=>({id:id('goal'),companyId,title:g.title||'Initial goal',description:g.description||'',deadline:g.deadline||null,successCriteria:g.successCriteria||[],status:'active',createdAt,updatedAt:createdAt}));
    northStar.activeGoalIds=goals.map(g=>g.id);
    northStar.kpis=(p.initialGoals||[]).flatMap(g=>(g.suggestedKpis||[])).slice(0,10).map((k,i)=>({id:id('kpi'),name:k.name||`KPI ${i+1}`,target:k.target??null,unit:k.unit||'',deadline:k.deadline||null}));
    state.companies.push(company); state.northStars.push(northStar); state.agents.push(...agents); state.goals.push(...goals); state.activeCompanyId=companyId;
    entity.status='activated'; entity.activatedCompanyId=companyId; entity.updatedAt=now();
    this.eventService.append('company.created',{actor:{type:'user',id:'local-user'},entity:{type:'company',id:companyId},payload:{name:company.name}});
    this.eventService.append('company.activated',{actor:{type:'user',id:'local-user'},entity:{type:'company',id:companyId}});
    agents.forEach(agent=>this.eventService.append('agent.hired',{actor:{type:'user',id:'local-user'},entity:{type:'agent',id:agent.id},payload:{displayName:agent.displayName,role:agent.role}}));
    this.eventService.append('northstar.activated',{actor:{type:'user',id:'local-user'},entity:{type:'northStar',id:northStar.id},goalIds:northStar.activeGoalIds,payload:{version:1}});
    await this.stateManager.persist();
    return {company,northStar,agents,goals};
  }
}
module.exports={BootstrapService};
