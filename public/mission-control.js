(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('missionDialog'), content = $('mcContent'), statusEl = $('mcStatus');
  if (!dialog || !content) return;

  const params = new URLSearchParams(location.search);
  const onboardingRequested = params.get('onboarding') === '1';
  const onboardingGoal = params.get('goal') || '';
  const state = {tab:'company', onboardingMode:onboardingRequested, onboardingStep:onboardingGoal?'configure':'start', onboardingPath:onboardingGoal?'scratch':null, onboardingTemplateId:null, onboardingBusy:false, onboardingError:'', onboardingDraft:{name:'',context:'',goal:onboardingGoal,constraints:''}, teamSelectedAgentId:null, teamCollapsedDivisions:new Set(), health:null, company:null, templates:[], northStarVersions:[], agents:[], projects:[], tasks:[], meetings:[], approvals:[], deliverables:[], events:[], standup:null, proposal:null, usageSummary:null,llmSettings:null, missionIntakeMode:'chief', missionDirectAgentId:null, missionDirectSearch:''};
  const node = (tag, text, cls) => { const el=document.createElement(tag); if(text!==undefined&&text!==null)el.textContent=String(text); if(cls)el.className=cls; return el; };
  const button = (text, cls='mc-secondary') => { const b=node('button',text,cls); b.type='button'; return b; };
  const badge = value => {
    const raw=String(value||'idle');
    const labels={active:'Working',working:'Working',idle:'Idle',in_progress:'Working',queued:'Ready',planned:'Planned',waiting_dependency:'Waiting',waiting:'Waiting',review:'Review',needs_review:'Review',pending:'Review',blocked:'Blocked',failed:'Blocked',needs_input:'Waiting',done:'Completed',completed:'Completed',approved:'Approved',draft:'Draft',paused:'Paused',archived:'Archived',scheduled:'Scheduled'};
    const tone=['done','completed','approved'].includes(raw)?'done':['active','working','in_progress','queued'].includes(raw)?'active':['review','needs_review','pending'].includes(raw)?'review':['waiting_dependency','waiting','needs_input','scheduled'].includes(raw)?'warn':['blocked','failed'].includes(raw)?'blocked':'';
    return node('span',labels[raw]||raw.replaceAll('_',' '),`mc-badge ${tone}`.trim());
  };
  const setStatus = message => { statusEl.textContent=message||''; };
  const initials = name => String(name||'AI').split(/\s+/).filter(Boolean).slice(0,3).map(x=>x[0]).join('').toUpperCase();
  const formatTime = iso => { try { return new Date(iso).toLocaleString([], {dateStyle:'short',timeStyle:'short'}); } catch { return iso||''; } };
  const tabRoutes={company:'overview',team:'team',mission:'missions',meetings:'meetings',knowledge:'knowledge',review:'approvals',standup:'standup',goals:'goals',performance:'performance',settings:'settings'};
  const tabChrome={
    company:['Organization Overview','See what is happening across your AI organization and what needs your attention.'],
    team:['AI Team','Manage the people, roles, and model policies that make up your organization.'],
    mission:['Missions','Turn company outcomes into coordinated workstreams, dependencies, owners, and deliverables.'],
    meetings:['Meeting Room','Coordinate cross-functional AI coworkers around one shared objective.'],
    knowledge:['Knowledge','Browse durable organizational outputs, evidence, and traceability created by your AI team.'],
    review:['Approval Center','Review consequential recommendations and keep human authority over important decisions.'],
    standup:['Morning Stand-up','Get an owner briefing generated from real work, blockers, decisions, and progress.'],
    goals:['Goals & North Star','Keep mission, vision, KPIs, principles, and hard constraints visible to the whole organization.'],
    performance:['Performance','Understand mission progress, task health, AI coworker activity, and model usage.'],
    settings:['Settings','Configure the AI runtime and workspace defaults that power Organa.']
  };
  function syncGlobalNavigation(tab){
    const route=tabRoutes[tab];
    if(route)document.querySelectorAll('[data-organa-route]').forEach(button=>button.classList.toggle('active',button.dataset.organaRoute===route));
    const chrome=tabChrome[tab]||tabChrome.company,heading=$('missionHeading'),desc=document.querySelector('.mc-header p');
    if(heading&&!state.onboardingMode)heading.textContent=chrome[0];
    if(desc&&!state.onboardingMode)desc.textContent=chrome[1];
  }
  async function api(method,path,body,options={}){
    const controller=new AbortController();
    const timeoutMs=options.timeoutMs||((method==='GET'||method==='HEAD')?12000:60000);
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const err=new Error(typeof data.error==='string'?data.error:data.error?.message||`Server error ${response.status}`);err.code=data.code||'';err.details=data.details||null;if(err.code==='AI_PROVIDER_NOT_READY'||err.code==='AI_PROVIDER_UNAVAILABLE')document.dispatchEvent(new CustomEvent('organa:ai-provider-error',{detail:{code:err.code,message:err.message}}));throw err;}
      return data;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('This request is taking longer than expected. Please try again.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  async function loadAll(){
    const [health,company,templates,northStarVersions,agents,projects,tasks,meetings,approvals,deliverables,events,standup,usageSummary,llmSettings]=await Promise.all([
      api('GET','/api/health'),api('GET','/api/company'),api('GET','/api/company-bootstrap/templates'),api('GET','/api/north-star/versions'),api('GET','/api/agents?includeDrafts=1'),api('GET','/api/projects'),api('GET','/api/tasks'),api('GET','/api/meetings'),api('GET','/api/approvals?status=pending'),api('GET','/api/deliverables'),api('GET','/api/events?limit=80'),api('GET','/api/standups/latest'),api('GET','/api/usage/summary'),api('GET','/api/llm/settings')
    ]);
    Object.assign(state,{health,company,templates,northStarVersions,agents:agents.agents||[],projects,tasks,meetings,approvals,deliverables,events,standup,usageSummary,llmSettings});
  }
  const sectionHead=(title,desc,actions)=>{const wrap=node('div',null,'mc-section-head'),left=node('div');left.append(node('h2',title),node('p',desc));wrap.append(left);if(actions)wrap.append(actions);return wrap;};
  const card=(title,cls='')=>{const c=node('section',null,`mc-card ${cls}`.trim());if(title)c.append(node('h3',title));return c;};
  const field=(labelText,kind='input',value='')=>{const label=node('label',labelText);const input=node(kind);if(kind==='textarea')input.rows=4;input.value=value||'';label.append(input);return{label,input};};
  function errorBox(error){const box=node('div',error.message||String(error),'mc-error');content.prepend(box);}

  function aiRuntime(){return state.llmSettings?.runtime||state.health?.ai||{};}
  function usingLiveAi(){return Boolean(aiRuntime().usingLiveAi)&&state.health?.provider!=='dry-run';}
  function aiModeCopy(action='AI-powered work'){
    const runtime=aiRuntime();
    if(usingLiveAi())return null;
    const hasLive=Boolean(runtime.liveProviderConfigured);
    return{
      title:hasLive?'Deterministic mode is selected':'Live AI is not connected',
      body:hasLive
        ? `${action} will use Organa’s deterministic demo engine until you switch the workspace provider in Settings.`
        : `${action} will still work in deterministic demo mode, but the output is not a live Gemini response. Configure Gemini on Vertex AI with a service account / ADC, or use a Gemini API key, when you want live AI.`,
      setupRequired:!hasLive,
    };
  }
  function openAiSettings(){state.onboardingMode=false;clearOnboardingRoute();setOnboardingChrome(false);ensureDialog(true);state.tab='settings';render();setStatus('Choose a live AI provider. Credentials remain on the server.');}
  function aiModeNotice(action){
    const copy=aiModeCopy(action);if(!copy)return null;
    const notice=node('aside',null,'mc-ai-setup-notice');const icon=node('span',copy.setupRequired?'!':'D','mc-ai-setup-icon'),body=node('div',null,'mc-ai-setup-copy');body.append(node('strong',copy.title),node('span',copy.body));const configure=button(copy.setupRequired?'Configure Gemini':'Open AI Settings','mc-secondary');configure.onclick=openAiSettings;notice.append(icon,body,configure);return notice;
  }
  function mountAiModeNotice(action){const notice=aiModeNotice(action);if(!notice)return;const first=content.firstElementChild;if(first)first.after(notice);else content.prepend(notice);}
  function signalAiAction(action){const copy=aiModeCopy(action);if(!copy)return false;setStatus(`${copy.title}. ${copy.body}`);return true;}

  function clearOnboardingRoute(){
    if(location.search)history.replaceState({},'',location.pathname);
  }

  function setOnboardingChrome(enabled){
    document.body.classList.toggle('organa-onboarding-mode',enabled);
    dialog.classList.toggle('mc-onboarding-dialog',enabled);
    const heading=$('missionHeading');
    const description=document.querySelector('.mc-header p');
    if(heading)heading.textContent=enabled?'Build your organization':'Organization Control';
    if(description)description.textContent=enabled?'Choose whether to build from scratch or start from a proven team template. Nothing activates until you approve it.':'Set the North Star, coordinate missions, build your AI team, and keep human authority over consequential decisions.';
    if(enabled){
      document.body.classList.remove('organa-loading');
      const splash=$('organaBootSplash');
      if(splash)splash.hidden=true;
    }
  }

  function ensureDialog(modal=true){
    let isModal=false;
    if(dialog.open){try{isModal=dialog.matches(':modal');}catch{isModal=false;}}
    if(dialog.open&&Boolean(isModal)!==Boolean(modal))dialog.close();
    if(dialog.open)return;
    if(modal)dialog.showModal();else dialog.show();
  }

  async function loadOnboarding(){
    const results=await Promise.allSettled([
      api('GET','/api/health'),
      api('GET','/api/company-bootstrap/templates'),
      api('GET','/api/llm/settings')
    ]);
    if(results[0].status==='fulfilled')state.health=results[0].value;
    if(results[1].status==='fulfilled')state.templates=results[1].value||[];
    if(results[2].status==='fulfilled')state.llmSettings=results[2].value;
    const failure=results.find(result=>result.status==='rejected');
    if(failure&&!state.health)throw failure.reason;
  }

  function onboardingStepper(active='start'){
    const normalized=active==='design'?'configure':active;
    const steps=[['start','1','Start'],['configure','2','Configure'],['review','3','Review'],['activate','4','Activate']];
    const order=steps.map(x=>x[0]),activeIndex=Math.max(0,order.indexOf(normalized));
    const wrap=node('div',null,'mc-onboarding-steps');
    steps.forEach(([key,num,label],index)=>{
      const item=node('div',null,`mc-onboarding-step ${index<activeIndex?'done':index===activeIndex?'active':''}`.trim());
      item.append(node('span',index<activeIndex?'✓':num),node('strong',label));wrap.append(item);
      if(index<steps.length-1)wrap.append(node('i'));
    });
    return wrap;
  }

  function onboardingBusyCard(message='Designing your organization…'){
    const busy=node('section',null,'mc-onboarding-busy');
    const orbit=node('div',null,'mc-mini-orbit');orbit.append(node('span'),node('span'),node('span'));
    const copy=node('div');copy.append(node('strong',message),node('p','Organa is turning your outcome into a focused North Star and the smallest useful team. You can keep this window open; it will recover cleanly if the request times out.'));
    busy.append(orbit,copy);return busy;
  }

  function renderOnboarding(){
    content.replaceChildren();
    const shell=node('div',null,'mc-onboarding-shell');
    const top=node('section',null,'mc-onboarding-intro');
    const topRow=node('div',null,'mc-onboarding-toprow'),copy=node('div');
    const title=state.proposal?'Review your AI organization':!state.onboardingPath?'Choose how you want to start':state.onboardingPath==='template'?'Start from a proven team template':'Build from scratch';
    const intro=state.proposal?'Review the North Star, constraints, and proposed AI employees. Nothing starts until you approve it.':!state.onboardingPath?'Create a new organization from your goal, or begin with a proven team structure and customize it before anything becomes active.':state.onboardingPath==='template'?'Pick a team shape, then customize the company name and goal. The template remains fully editable before activation.':'Describe the outcome you want and Organa will design the North Star and smallest useful team around it.';
    copy.append(node('span','GET STARTED WITH ORGANA','mc-hero-kicker'),node('h2',title),node('p',intro));
    const exit=button('Open current workspace','mc-secondary mc-onboarding-exit');
    exit.onclick=()=>{state.onboardingMode=false;state.proposal=null;state.onboardingPath=null;state.onboardingTemplateId=null;state.onboardingStep='start';clearOnboardingRoute();setOnboardingChrome(false);ensureDialog(true);state.tab='company';refresh('company');};
    topRow.append(copy,exit);top.append(topRow,onboardingStepper(state.proposal?'review':state.onboardingBusy?'configure':state.onboardingStep));shell.append(top);if(!usingLiveAi()&&state.onboardingPath!=='template'){const aiNotice=aiModeNotice('Building an organization from scratch');if(aiNotice)shell.append(aiNotice);}

    if(state.onboardingError){const error=node('div',state.onboardingError,'mc-error mc-onboarding-error');shell.append(error);}
    if(state.onboardingBusy){shell.append(onboardingBusyCard(state.onboardingPath==='template'?'Preparing your template…':'Designing your organization…'));content.append(shell);return;}

    if(!state.proposal&&!state.onboardingPath){
      const chooser=card('How would you like to begin?','full mc-onboarding-path-card');
      chooser.append(node('p','Both paths create an editable draft. Nothing activates until you review and approve the organization.','mc-muted'));
      const choices=node('div',null,'mc-onboarding-path-grid');
      const scratch=button('', 'mc-onboarding-path-option mc-path-scratch');
      scratch.append(node('span','01','mc-path-number'),node('strong','Build from scratch'),node('p','Start with the outcome. Organa designs the North Star, team structure, and specialist roles around what you want to achieve.'),node('small','Best when your organization or project is unique.'),node('span','Create from a goal →','mc-path-cta'));
      scratch.onclick=()=>{state.onboardingPath='scratch';state.onboardingStep='configure';state.onboardingError='';renderOnboarding();requestAnimationFrame(()=>content.querySelector('[data-onboarding-goal]')?.focus({preventScroll:true}));};
      const template=button('', 'mc-onboarding-path-option mc-path-template');
      template.append(node('span','02','mc-path-number'),node('strong','Use a template'),node('p','Start with a proven AI team shape, then customize its goal, roles, names, constraints, and North Star before activation.'),node('small',state.templates.length?`${state.templates.length} starter teams available`:'Starter teams are loading…'),node('span','Browse templates →','mc-path-cta'));
      template.onclick=()=>{state.onboardingPath='template';state.onboardingStep='configure';state.onboardingError='';renderOnboarding();};
      choices.append(scratch,template);chooser.append(choices);shell.append(chooser);content.append(shell);return;
    }

    if(!state.proposal&&state.onboardingPath==='scratch'){
      const pathBar=node('div',null,'mc-onboarding-path-bar');pathBar.append(node('span','Starting point: Build from scratch','mc-badge active'));const change=button('Change starting point','mc-ghost');change.onclick=()=>{state.onboardingPath=null;state.onboardingTemplateId=null;state.onboardingStep='start';state.onboardingError='';renderOnboarding();};pathBar.append(change);shell.append(pathBar);
      const builder=card('Start with one outcome','full mc-onboarding-builder-card');builder.dataset.onboardingBuilder='1';
      builder.append(node('p','A good starting point is specific enough to guide the team, but broad enough for Organa to decide which specialists are actually needed.','mc-muted'));
      const form=node('form',null,'mc-form mc-onboarding-form');
      const name=field('Company or project name (optional)','input',state.onboardingDraft.name),context=field('What are you building?','textarea',state.onboardingDraft.context),goal=field('What outcome should this AI team achieve?','textarea',state.onboardingDraft.goal),constraints=field('Hard constraints (optional)','textarea',state.onboardingDraft.constraints);
      name.input.placeholder='Example: Nusa Coffee';
      context.input.placeholder='Example: A sustainable Indonesian coffee brand for urban professionals, currently preparing its first major launch.';
      goal.input.placeholder='Example: Prepare an execution-ready launch plan for next month, including positioning, channels, budget allocation, and the web launch package.';goal.input.dataset.onboardingGoal='1';
      constraints.input.placeholder='One per line. Example:\nMarketing budget cannot exceed IDR 25 million\nExternal publishing requires my approval';
      const examples=node('div',null,'mc-onboarding-examples');examples.append(node('span','Try an example:'));
      const exampleData=[['Launch a product','Prepare an execution-ready launch plan for a new product in Indonesia next month.'],['Research a market','Assess the Indonesian SME market, identify the strongest opportunities, risks, and an evidence-backed recommendation.'],['Build a growth plan','Create a 90-day growth plan with channel priorities, measurable targets, budget guardrails, and owner-ready next actions.']];
      exampleData.forEach(([label,value])=>{const b=button(label,'mc-example-chip');b.onclick=()=>{goal.input.value=value;state.onboardingDraft.goal=value;goal.input.focus();syncButton();};examples.append(b);});
      const submitRow=node('div',null,'mc-onboarding-submit'),gen=button('Design my AI organization','mc-primary');gen.type='submit';const note=node('span','Nothing activates until you review and approve it.','mc-muted');submitRow.append(note,gen);
      form.append(name.label,context.label,goal.label,constraints.label,examples,submitRow);builder.append(form);shell.append(builder);
      const persistDraft=()=>{state.onboardingDraft={name:name.input.value.trim(),context:context.input.value.trim(),goal:goal.input.value.trim(),constraints:constraints.input.value.trim()};};
      const syncButton=()=>{persistDraft();gen.disabled=!state.onboardingDraft.goal;};
      [name.input,context.input,goal.input,constraints.input].forEach(input=>input.addEventListener('input',syncButton));syncButton();
      form.onsubmit=async event=>{event.preventDefault();persistDraft();if(!state.onboardingDraft.goal){goal.input.focus();return;}await buildOrganizationDraft();};
    }else if(!state.proposal&&state.onboardingPath==='template'){
      const pathBar=node('div',null,'mc-onboarding-path-bar');pathBar.append(node('span','Starting point: Team template','mc-badge active'));const change=button('Change starting point','mc-ghost');change.onclick=()=>{state.onboardingPath=null;state.onboardingTemplateId=null;state.onboardingStep='start';state.onboardingError='';renderOnboarding();};pathBar.append(change);shell.append(pathBar);
      const templateCard=card('Choose a proven team shape','full mc-template-picker mc-template-setup');templateCard.append(node('p','Select a starting team. You can edit names, roles, constraints, mission, and vision before activation.','mc-muted'));
      const templateGrid=node('div',null,'mc-template-grid');
      if(state.templates.length){state.templates.forEach(t=>{const selected=state.onboardingTemplateId===t.id;const tc=node('article',null,`mc-template-option ${selected?'selected':''}`.trim());tc.append(node('span',String(t.category||'team').toUpperCase(),'mc-template-category'),node('strong',t.name),node('span',t.description||''),node('small',`${t.teamSize} proposed coworkers`));const pick=button(selected?'Selected':'Choose template',selected?'mc-primary':'mc-secondary');pick.disabled=selected;pick.onclick=()=>{state.onboardingTemplateId=t.id;state.onboardingError='';renderOnboarding();};tc.append(pick);templateGrid.append(tc);});}
      else templateGrid.append(node('p','Templates are still loading. Please retry in a moment.','mc-muted'));
      templateCard.append(templateGrid);shell.append(templateCard);

      const details=card('Customize this starting point','full mc-onboarding-builder-card mc-template-details');
      const form=node('form',null,'mc-form mc-onboarding-form');
      const name=field('Company or project name (optional)','input',state.onboardingDraft.name),goal=field('What should this team achieve? (optional)','textarea',state.onboardingDraft.goal),constraints=field('Extra hard constraints (optional)','textarea',state.onboardingDraft.constraints);
      name.input.placeholder='Example: Nusa Coffee';goal.input.placeholder='Leave blank to use the template’s default starter goal, or describe the outcome you want this team to achieve.';goal.input.dataset.onboardingGoal='1';constraints.input.placeholder='One per line. Example:\nMarketing spend cannot exceed IDR 25 million';
      const submitRow=node('div',null,'mc-onboarding-submit'),create=button('Create editable draft','mc-primary');create.type='submit';const selectedTemplate=state.templates.find(t=>t.id===state.onboardingTemplateId);const note=node('span',selectedTemplate?`Selected: ${selectedTemplate.name}`:'Choose a template above to continue.','mc-muted');submitRow.append(note,create);form.append(name.label,goal.label,constraints.label,submitRow);details.append(form);shell.append(details);
      const persistDraft=()=>{state.onboardingDraft={...state.onboardingDraft,name:name.input.value.trim(),goal:goal.input.value.trim(),constraints:constraints.input.value.trim()};};
      const syncButton=()=>{persistDraft();create.disabled=!state.onboardingTemplateId;note.textContent=state.templates.find(t=>t.id===state.onboardingTemplateId)?.name?`Selected: ${state.templates.find(t=>t.id===state.onboardingTemplateId).name}`:'Choose a template above to continue.';};
      [name.input,goal.input,constraints.input].forEach(input=>input.addEventListener('input',syncButton));syncButton();
      form.onsubmit=async event=>{event.preventDefault();persistDraft();const chosen=state.templates.find(t=>t.id===state.onboardingTemplateId);if(!chosen){state.onboardingError='Choose a team template first.';renderOnboarding();return;}await buildFromTemplate(chosen,create);};
    }else{
      renderOnboardingReview(shell,state.proposal);
    }
    content.append(shell);
  }

  async function buildOrganizationDraft(){
    state.onboardingBusy=true;state.onboardingError='';state.onboardingStep='configure';renderOnboarding();signalAiAction('Building this organization');if(usingLiveAi())setStatus('Organa is designing your organization…');
    const d=state.onboardingDraft;
    const description=[d.context,d.constraints?`Hard constraints:\n${d.constraints}`:''].filter(Boolean).join('\n\n')||d.goal;
    try{
      state.proposal=await api('POST','/api/company-bootstrap/proposals',{name:d.name,description,goal:d.goal},{timeoutMs:70000});
      state.onboardingStep='review';setStatus('Draft ready. Review the North Star and AI team before activation.');
    }catch(error){state.onboardingError=error.message||String(error);setStatus(state.onboardingError);}
    finally{state.onboardingBusy=false;renderOnboarding();}
  }

  async function buildFromTemplate(template,buttonEl){
    const goal=state.onboardingDraft.goal.trim();
    state.onboardingBusy=true;state.onboardingError='';state.onboardingStep='configure';if(buttonEl)buttonEl.disabled=true;renderOnboarding();setStatus(`Preparing ${template.name}…`);
    try{
      state.proposal=await api('POST',`/api/company-bootstrap/templates/${template.id}/proposal`,{name:state.onboardingDraft.name||'New Organization',goal,constraints:state.onboardingDraft.constraints},{timeoutMs:70000});
      state.onboardingStep='review';setStatus('Team draft ready. Review it before activation.');
    }catch(error){state.onboardingError=error.message||String(error);setStatus(state.onboardingError);}
    finally{state.onboardingBusy=false;renderOnboarding();}
  }

  function renderOnboardingReview(shell,entity){
    const p=entity.proposal||entity;
    const source=node('div',null,'mc-onboarding-source');
    const templateName=state.templates.find(t=>t.id===state.onboardingTemplateId)?.name;
    source.append(node('strong',state.onboardingPath==='template'?'Template starting point':'Built from scratch'),node('span',state.onboardingPath==='template'?(templateName||'Selected team template'):'Organa designed this organization from your outcome.'));
    shell.append(source);
    const summary=node('div',null,'mc-onboarding-review-grid');
    const north=card('Company North Star','full mc-onboarding-review-card');
    const nm=field('Company name','input',p.companyProfile?.name||state.onboardingDraft.name),mission=field('Mission','textarea',p.northStarDraft?.mission),vision=field('Vision','textarea',p.northStarDraft?.vision),constraints=field('Hard constraints, one per line','textarea',(p.northStarDraft?.hardConstraints||[]).join('\n'));
    const northForm=node('div',null,'mc-form mc-onboarding-review-fields');northForm.append(nm.label,mission.label,vision.label,constraints.label);north.append(northForm);summary.append(north);

    const teamCard=card(`Proposed AI team · ${(p.recommendedTeam||[]).length} roles`,'full mc-onboarding-team-card');teamCard.append(node('p','Keep only the roles you want. Names and role titles remain editable before activation.','mc-muted'));
    const team=node('div',null,'mc-onboarding-team');
    (p.recommendedTeam||[]).forEach(role=>{const row=node('div',null,'mc-onboarding-team-row'),check=node('input');check.type='checkbox';check.checked=true;check.dataset.tempId=role.tempId;check.setAttribute('aria-label',`Include ${role.role}`);const identity=node('div',null,'mc-onboarding-team-identity'),avatar=node('span',initials(role.displayNameSuggestion||role.role),'mc-avatar'),meta=node('div');meta.append(node('strong',role.displayNameSuggestion||'AI coworker'),node('span',`${role.division||'General'} · ${role.purpose||role.whyNeeded||''}`));identity.append(avatar,meta);const nameInput=node('input');nameInput.type='text';nameInput.value=role.displayNameSuggestion||'';nameInput.dataset.nameFor=role.tempId;nameInput.setAttribute('aria-label',`${role.role} display name`);const roleInput=node('input');roleInput.type='text';roleInput.value=role.role||'';roleInput.dataset.roleFor=role.tempId;roleInput.setAttribute('aria-label',`${role.displayNameSuggestion||'AI coworker'} role`);row.append(check,identity,nameInput,roleInput);team.append(row);});
    teamCard.append(team);summary.append(teamCard);shell.append(summary);

    if(p.assumptions?.length){const assumptions=card('Assumptions to review','full mc-onboarding-assumptions');const ul=node('ul');p.assumptions.forEach(item=>ul.append(node('li',item)));assumptions.append(ul);shell.append(assumptions);}
    const actions=node('div',null,'mc-onboarding-final-actions'),back=button('Back to setup','mc-secondary'),activate=button('Approve & Start Organization','mc-primary');actions.append(back,activate);shell.append(actions);
    back.onclick=()=>{state.proposal=null;state.onboardingStep='configure';state.onboardingError='';renderOnboarding();requestAnimationFrame(()=>content.querySelector('[data-onboarding-goal]')?.focus());};
    activate.onclick=async()=>{
      activate.disabled=true;back.disabled=true;state.onboardingStep='activate';setStatus('Activating your reviewed organization…');
      const teamEdits=(p.recommendedTeam||[]).map(role=>({tempId:role.tempId,enabled:team.querySelector(`[data-temp-id="${role.tempId}"]`)?.checked!==false,displayNameSuggestion:team.querySelector(`[data-name-for="${role.tempId}"]`)?.value||role.displayNameSuggestion,role:team.querySelector(`[data-role-for="${role.tempId}"]`)?.value||role.role}));
      try{
        await api('POST',`/api/company-bootstrap/proposals/${entity.id}/activate`,{companyName:nm.input.value.trim(),mission:mission.input.value.trim(),vision:vision.input.value.trim(),hardConstraints:constraints.input.value.split('\n').map(x=>x.trim()).filter(Boolean),team:teamEdits},{timeoutMs:70000});
        clearOnboardingRoute();state.onboardingMode=false;setOnboardingChrome(false);setStatus('Organization activated. Opening your live office…');
        setTimeout(()=>location.assign('/app'),420);
      }catch(error){state.onboardingError=error.message||String(error);setStatus(state.onboardingError);activate.disabled=false;back.disabled=false;renderOnboarding();}
    };
  }

  function renderCompany(){
    content.replaceChildren();
    const company=state.company?.company||{},ns=state.company?.northStar||{};
    const activeMissions=state.projects.filter(project=>!['completed','cancelled'].includes(project.status)).length;
    const completedTasks=state.tasks.filter(task=>task.status==='done').length;
    const hero=node('section',null,'mc-hero');
    hero.append(node('span','ORGANIZATION PULSE','mc-hero-kicker'),node('h2',`Good morning, Founder.${company.name?` ${company.name} is in motion.`:''}`),node('p',ns.mission||"Set a North Star so every AI coworker can connect daily work to the organization's actual goal."));
    const stats=node('div',null,'mc-hero-stats');
    [[activeMissions,'active missions'],[completedTasks,'tasks completed'],[state.approvals.length,'decisions need you'],[state.agents.filter(agent=>agent.status==='active').length,'active AI coworkers']].forEach(([value,label])=>{const stat=node('div',null,'mc-hero-stat');stat.append(node('strong',value),node('span',label));stats.append(stat);});
    hero.append(stats);
    const heroActions=node('div',null,'mc-actions'),missionAction=button('Create Mission','mc-primary'),chiefAction=button('Ask Chief of Staff','mc-secondary');
    missionAction.onclick=chiefAction.onclick=()=>{state.tab='mission';render();};heroActions.append(chiefAction,missionAction);hero.append(heroActions);content.append(hero);
    const actions=node('div',null,'mc-actions'),reset=button('Load Nusa Coffee demo','mc-secondary');actions.append(reset);
    content.append(sectionHead('Company North Star','Keep mission, vision, principles, KPIs and hard constraints visible so autonomous work stays aligned with human intent.',actions));
    const grid=node('div',null,'mc-grid');
    const overview=card(company.name||'No active company');overview.append(node('span',`${state.llmSettings?.providers?.find(p=>p.id===state.health?.provider)?.label||state.health?.provider||'AI'}${state.health?.model?` · ${state.health.model}`:''}`,'mc-badge active'),node('p',company.description||'Tell Organa what you want to build below.'),node('p',`${company.industry||'General'} · ${company.stage||'stage not set'}`,'mc-muted'));grid.append(overview);
    const north=card(`North Star${ns.version?` · v${ns.version}`:''}`);north.append(node('h4','Mission'),node('p',ns.mission||'Not set'),node('h4','Vision'),node('p',ns.vision||'Not set'));if(ns.constraints?.length){north.append(node('h4','Constraints'));const list=node('div',null,'mc-constraints');list.textContent=ns.constraints.map(c=>`${c.severity==='hard'?'HARD':'SOFT'} · ${c.text}`).join('\n');north.append(list);}const editNorth=button('Edit as new version','mc-secondary');north.append(editNorth);grid.append(north);
    const attention=card(`Needs your approval · ${state.approvals.length}`);if(state.approvals.length){state.approvals.slice(0,3).forEach(item=>attention.append(node('p',`• ${item.title}`)));const review=button('Open Approval Center','mc-secondary');review.onclick=()=>{state.tab='review';render();};attention.append(review);}else attention.append(node('p','No consequential decision is waiting on you.','mc-muted'));grid.append(attention);
    const recent=card(`Recent deliverables · ${state.deliverables.length}`);if(state.deliverables.length){state.deliverables.slice(0,3).forEach(item=>recent.append(node('p',`• ${item.title}`)));const open=button('Review deliverables','mc-secondary');open.onclick=()=>{state.tab='review';render();};recent.append(open);}else recent.append(node('p','Deliverables will appear here as missions complete.','mc-muted'));grid.append(recent);content.append(grid);

    const builder=card(state.onboardingMode?'Tell Organa what you want to build':'Build from a goal','full');builder.dataset.onboardingBuilder='1';builder.append(node('p',state.onboardingMode?'Describe your business, project, or outcome. Organa will propose a North Star and the smallest useful AI team. You review everything before activation.':'Describe the company, project, or outcome. Organa proposes the smallest useful team plus a North Star. Nothing starts until you approve it.','mc-muted'));
    const form=node('form',null,'mc-form'),name=field('Company name (optional)'),brief=field('What are you building and what should this team achieve?','textarea');brief.input.placeholder='Example: We are launching a sustainable Indonesian coffee brand for urban professionals. Budget for launch marketing cannot exceed IDR 25 million.';if(state.onboardingMode&&onboardingGoal)brief.input.value=onboardingGoal;const gen=button(state.onboardingMode?'Build my AI organization':'Build My Team','mc-primary');gen.type='submit';form.append(name.label,brief.label,gen);builder.append(form);content.append(builder);
    if(state.onboardingMode){const intro=node('section',null,'mc-onboarding-intro');intro.append(node('span',state.proposal?'DRAFT READY FOR REVIEW':'WELCOME TO ORGANA','mc-hero-kicker'),node('h2',state.proposal?'Review your proposed organization':'Build your AI organization'),node('p',state.proposal?'Review the proposed North Star, team roles, and constraints below. Organa will not activate the organization until you approve it.':'Start with the outcome. Organa will design the organization, propose specialists, and create a draft Company North Star for your approval.'));const exit=button('Explore the current workspace instead','mc-secondary');exit.onclick=()=>{state.onboardingMode=false;history.replaceState({},'',location.pathname);renderCompany();};intro.append(exit);content.prepend(intro,builder);builder.classList.add('mc-onboarding-focus');}

    const templateCard=card('Or start from a team template','full');templateCard.append(node('p','Templates start as editable drafts. You review the team and North Star before anything becomes active.','mc-muted'));
    const templateForm=node('form',null,'mc-form'),templateLabel=node('label','Template'),templateSelect=node('select');for(const t of state.templates){const option=node('option',`${t.name} · ${t.teamSize} coworkers`);option.value=t.id;templateSelect.append(option);}templateLabel.append(templateSelect);const tName=field('Company / project name'),tGoal=field('Goal for this team','textarea');tGoal.input.placeholder='Example: Prepare an owner-ready launch plan for our new product.';const install=button('Preview this team','mc-secondary');install.type='submit';templateForm.append(templateLabel,tName.label,tGoal.label,install);templateCard.append(templateForm);content.append(templateCard);

    if(state.proposal)renderProposal(state.proposal);
    if(state.northStarVersions.length>1){const history=card('North Star history','full');for(const version of state.northStarVersions.slice(0,8)){const row=node('div',null,'mc-event');row.append(node('span',`v${version.version} · ${version.status}`),node('span',version.changeNote||version.mission||''));history.append(row);}content.append(history);}

    form.onsubmit=async e=>{e.preventDefault();if(!brief.input.value.trim()){brief.input.focus();return;}signalAiAction('Designing this organization');if(usingLiveAi())setStatus('Organa is designing your organization…');gen.disabled=true;try{state.proposal=await api('POST','/api/company-bootstrap/proposals',{name:name.input.value.trim(),description:brief.input.value.trim(),goal:brief.input.value.trim()});setStatus('Your draft team is ready. Review it before you activate the organization.');renderCompany();}catch(err){errorBox(err);setStatus(err.message);}finally{gen.disabled=false;}};
    templateForm.onsubmit=async e=>{e.preventDefault();if(!templateSelect.value)return;setStatus('Preparing an editable team…');install.disabled=true;try{state.proposal=await api('POST',`/api/company-bootstrap/templates/${templateSelect.value}/proposal`,{name:tName.input.value.trim()||'New Company',goal:tGoal.input.value.trim()});setStatus('Your team draft is ready. Review the people, North Star, and constraints before activation.');renderCompany();}catch(err){errorBox(err);setStatus(err.message);}finally{install.disabled=false;}};
    editNorth.onclick=()=>renderNorthStarEditor(ns);
    reset.onclick=async()=>{if(!confirm('Replace the active workspace with the seeded Nusa Coffee hackathon scenario?'))return;setStatus('Resetting demo workspace…');try{await api('POST','/api/demo/reset',{});setStatus('Nusa Coffee loaded. Reloading the 3D office roster…');setTimeout(()=>location.reload(),300);}catch(err){errorBox(err);}};
  }

  function renderNorthStarEditor(ns){
    content.replaceChildren();content.append(sectionHead('Edit North Star','Changes are saved as a new draft version. The currently active version stays authoritative until you explicitly activate the draft.'));
    const c=card(`Create version ${(state.northStarVersions[0]?.version||0)+1}`,'full'),form=node('form',null,'mc-form'),mission=field('Mission','textarea',ns?.mission),vision=field('Vision','textarea',ns?.vision),principles=field('Principles, one per line','textarea',(ns?.principles||[]).join('\n')),constraints=field('Constraints, one per line. Prefix soft preferences with SOFT:','textarea',(ns?.constraints||[]).map(x=>`${x.severity==='soft'?'SOFT: ':''}${x.text}`).join('\n')),note=field('Change note','input','Updated by human owner');const save=button('Save draft version','mc-primary');save.type='submit';form.append(mission.label,vision.label,principles.label,constraints.label,note.label,save);c.append(form);content.append(c);
    form.onsubmit=async e=>{e.preventDefault();const parsed=constraints.input.value.split('\n').map(x=>x.trim()).filter(Boolean).map((text,i)=>({id:`manual_${Date.now()}_${i}`,type:'policy',severity:/^SOFT:/i.test(text)?'soft':'hard',text:text.replace(/^SOFT:\s*/i,'')}));setStatus('Saving a new North Star draft…');try{const draft=await api('POST','/api/north-star/versions',{mission:mission.input.value,vision:vision.input.value,principles:principles.input.value.split('\n').map(x=>x.trim()).filter(Boolean),constraints:parsed,changeNote:note.input.value});content.replaceChildren();content.append(sectionHead(`North Star v${draft.version} saved as draft`,'Reviewing the version does not change active company direction until you activate it.'));const d=card('Draft','full');d.append(node('p',draft.mission),node('p',draft.constraints.map(x=>`${x.severity.toUpperCase()} · ${x.text}`).join('\n'),'mc-constraints'));const activate=button(`Activate v${draft.version}`,'mc-primary'),cancel=button('Keep current active version','mc-secondary'),acts=node('div',null,'mc-actions');acts.append(activate,cancel);d.append(acts);content.append(d);activate.onclick=async()=>{setStatus('Activating the reviewed North Star version…');await api('POST',`/api/north-star/versions/${draft.version}/activate`,{});await refresh('company');setStatus(`North Star v${draft.version} is active. New runs will record this version.`);};cancel.onclick=()=>refresh('company');}catch(err){errorBox(err);setStatus(err.message);}};
  }

  function renderProposal(entity){
    const p=entity.proposal||entity,wrap=card('Proposed organization','full');wrap.dataset.proposalId=entity.id||'';const two=node('div',null,'mc-two');const nm=field('Company name','input',p.companyProfile?.name),mission=field('Mission','textarea',p.northStarDraft?.mission),vision=field('Vision','textarea',p.northStarDraft?.vision),constraints=field('Hard constraints, one per line','textarea',(p.northStarDraft?.hardConstraints||[]).join('\n'));two.append(nm.label,mission.label,vision.label,constraints.label);wrap.append(two,node('h4','Proposed team'));
    const team=node('div',null,'mc-team-edit');(p.recommendedTeam||[]).forEach(role=>{const row=node('div',null,'mc-team-row'),check=node('input');check.type='checkbox';check.checked=true;check.dataset.tempId=role.tempId;const name=node('input');name.type='text';name.value=role.displayNameSuggestion||'';name.dataset.nameFor=role.tempId;const roleInput=node('input');roleInput.type='text';roleInput.value=role.role||'';roleInput.dataset.roleFor=role.tempId;row.append(check,name,roleInput);team.append(row);});wrap.append(team);
    if(p.assumptions?.length){wrap.append(node('h4','Assumptions'),node('p',p.assumptions.join(' · '),'mc-muted'));}
    const activate=button('Approve & Start Organization','mc-primary');wrap.append(activate);const onboardingAnchor=state.onboardingMode?content.querySelector('[data-onboarding-builder]'):null;if(onboardingAnchor)onboardingAnchor.after(wrap);else content.append(wrap);
    activate.onclick=async()=>{activate.disabled=true;setStatus('Activating company, North Star and AI team…');const teamEdits=(p.recommendedTeam||[]).map(role=>({tempId:role.tempId,enabled:team.querySelector(`[data-temp-id="${role.tempId}"]`)?.checked!==false,displayNameSuggestion:team.querySelector(`[data-name-for="${role.tempId}"]`)?.value||role.displayNameSuggestion,role:team.querySelector(`[data-role-for="${role.tempId}"]`)?.value||role.role}));try{await api('POST',`/api/company-bootstrap/proposals/${entity.id}/activate`,{companyName:nm.input.value,mission:mission.input.value,vision:vision.input.value,hardConstraints:constraints.input.value.split('\n').map(x=>x.trim()).filter(Boolean),team:teamEdits});setStatus('Company activated. Reloading the office with the new roster…');setTimeout(()=>location.reload(),450);}catch(err){errorBox(err);activate.disabled=false;setStatus(err.message);}};
  }

  function teamAgentWorkState(agent){
    const tasks=state.tasks.filter(t=>t.assigneeAgentId===agent.id);
    const current=tasks.find(t=>t.status==='active')||tasks.find(t=>t.status==='review')||tasks.find(t=>['blocked','needs_input','failed'].includes(t.status))||tasks.find(t=>['queued','waiting_dependency'].includes(t.status));
    if(agent.status==='draft')return'draft';
    if(agent.status==='paused'||agent.status==='archived')return agent.status;
    if(!current)return'idle';
    if(current.status==='active')return'working';
    if(current.status==='review')return'review';
    if(['blocked','failed'].includes(current.status))return'blocked';
    if(['needs_input','waiting_dependency'].includes(current.status))return'waiting';
    return'idle';
  }

  function teamAgentMetrics(agent){
    const tasks=state.tasks.filter(t=>t.assigneeAgentId===agent.id),usage=state.usageSummary?.byAgent?.[agent.id]||{};
    return{tasks,active:tasks.filter(t=>t.status==='active'),review:tasks.filter(t=>t.status==='review'),blocked:tasks.filter(t=>['blocked','failed','needs_input'].includes(t.status)),done:tasks.filter(t=>t.status==='done'),usage};
  }

  function teamAgentById(id){return state.agents.find(a=>a.id===id)||null;}
  function teamManagerName(agent){const manager=teamAgentById(agent.managerAgentId);return manager?.displayName||(/chief of staff/i.test(agent.role||'')?'Human Founder':'Human Founder');}

  function teamCollaborators(agent){
    const ids=new Set();
    for(const task of state.tasks){
      if(task.assigneeAgentId===agent.id)(task.collaboratorAgentIds||[]).forEach(id=>ids.add(id));
      else if((task.collaboratorAgentIds||[]).includes(agent.id)&&task.assigneeAgentId)ids.add(task.assigneeAgentId);
    }
    for(const meeting of state.meetings){if((meeting.participantAgentIds||[]).includes(agent.id))(meeting.participantAgentIds||[]).forEach(id=>{if(id!==agent.id)ids.add(id);});}
    return[...ids].map(teamAgentById).filter(Boolean);
  }

  function teamAgentEvents(agent){
    return state.events.filter(e=>e.actor?.id===agent.id||(e.entity?.type==='agent'&&e.entity?.id===agent.id)||e.payload?.assigneeAgentId===agent.id||(Array.isArray(e.payload?.participants)&&e.payload.participants.includes(agent.id))).slice(0,8);
  }

  function teamEventLabel(event){
    const labels={'task.started':'Started work','task.completed':'Completed work','task.needs_review':'Sent work for review','task.blocked':'Asked for input','task.failed':'Work blocked','meeting.started':'Joined meeting','meeting.contribution_added':'Contributed to meeting','meeting.completed':'Completed meeting synthesis','agent.hired':'Joined the organization','agent.paused':'Paused','agent.archived':'Archived','agent.prompt_updated':'Configuration updated'};
    const related=event.entity?.type==='task'?state.tasks.find(t=>t.id===event.entity.id):event.entity?.type==='meeting'?state.meetings.find(m=>m.id===event.entity.id):null;
    return`${labels[event.type]||event.type.replaceAll('.',' · ')}${related?.title?` · ${related.title}`:''}`;
  }

  function renderTeamProfile(panel,agent){
    panel.replaceChildren();
    if(!agent){
      const empty=node('div',null,'mc-team-profile-empty');empty.append(node('span','AI','mc-profile-empty-orbit'),node('strong','Select an AI coworker'),node('p','Open a person in the organization chart to see their work, reporting line, collaborators, performance, and configuration.'));panel.append(empty);return;
    }
    state.teamSelectedAgentId=agent.id;
    const metrics=teamAgentMetrics(agent),workState=teamAgentWorkState(agent),manager=teamAgentById(agent.managerAgentId),directReports=state.agents.filter(a=>a.managerAgentId===agent.id&&a.status!=='archived'),collaborators=teamCollaborators(agent),events=teamAgentEvents(agent);
    const top=node('div',null,'mc-profile-head'),avatar=node('span',initials(agent.displayName),'mc-avatar mc-profile-avatar'),identity=node('div',null,'mc-profile-identity');avatar.dataset.status=workState;identity.append(node('span',agent.division||'General','mc-profile-division'),node('h3',agent.displayName),node('p',agent.role));top.append(avatar,identity,badge(workState));panel.append(top);
    if(agent.purpose)panel.append(node('p',agent.purpose,'mc-profile-purpose'));
    const reporting=node('div',null,'mc-profile-reporting');reporting.append(node('span',/chief of staff/i.test(agent.role||'')?'Reports to':'Manager'),node('strong',manager?.displayName||'Human Founder'));if(directReports.length)reporting.append(node('span','Direct reports'),node('strong',directReports.map(a=>a.displayName).join(', ')));panel.append(reporting);

    const stats=node('div',null,'mc-profile-stats');[['Current',metrics.active.length+metrics.review.length+metrics.blocked.length],['Done',metrics.done.length],['Model calls',metrics.usage.requests||0],['Tokens',(metrics.usage.totalTokens||0).toLocaleString()]].forEach(([label,value])=>{const item=node('div');item.append(node('strong',value),node('span',label));stats.append(item);});panel.append(stats);

    const work=node('section',null,'mc-profile-section');work.append(node('h4','Current work'));const current=[...metrics.active,...metrics.review,...metrics.blocked].slice(0,5);if(!current.length)work.append(node('p','No active work right now.','mc-muted'));else current.forEach(task=>{const row=node('div',null,'mc-profile-work-row');const text=node('div');text.append(node('strong',task.title),node('span',task.brief||task.description||''));row.append(text,badge(task.status));work.append(row);});panel.append(work);

    const roleSection=node('section',null,'mc-profile-section mc-profile-two-section');const resp=node('div');resp.append(node('h4','Responsibilities'));const respList=node('ul');(agent.responsibilities||[]).forEach(x=>respList.append(node('li',x)));if(!respList.children.length)respList.append(node('li','No responsibilities documented yet.','mc-muted'));resp.append(respList);const skills=node('div');skills.append(node('h4','Skills'));const skillWrap=node('div',null,'mc-chips');(agent.skills||[]).forEach(skill=>skillWrap.append(node('span',skill.name||skill,'mc-chip')));if(!skillWrap.children.length)skillWrap.append(node('span','No skills documented','mc-muted'));skills.append(skillWrap);roleSection.append(resp,skills);panel.append(roleSection);

    const collab=node('section',null,'mc-profile-section');collab.append(node('h4','Reporting & collaborators'));const collabList=node('div',null,'mc-profile-people');const people=[...(manager?[manager]:[]),...directReports,...collaborators].filter((a,i,arr)=>a&&arr.findIndex(x=>x.id===a.id)===i);if(!people.length)collabList.append(node('span','No recorded AI collaborators yet.','mc-muted'));else people.forEach(person=>{const chip=button(`${initials(person.displayName)}  ${person.displayName}`,'mc-person-chip');chip.title=person.role;chip.onclick=()=>{state.teamSelectedAgentId=person.id;renderTeam();};collabList.append(chip);});collab.append(collabList);panel.append(collab);

    const performance=node('section',null,'mc-profile-section');performance.append(node('h4','Performance'));const perfGrid=node('div',null,'mc-profile-performance');[['Completed tasks',metrics.done.length],['Awaiting review',metrics.review.length],['Needs attention',metrics.blocked.length],['Avg model latency',metrics.usage.avgLatencyMs?`${metrics.usage.avgLatencyMs} ms`:'—']].forEach(([label,value])=>{const item=node('div');item.append(node('span',label),node('strong',value));perfGrid.append(item);});performance.append(perfGrid);panel.append(performance);

    const modelCost=node('section',null,'mc-profile-section');modelCost.append(node('h4','Model & cost'));const modelRows=node('div',null,'mc-profile-kv');const configuredProvider=agent.modelPolicy?.provider||'inherit',providerLabel=(state.llmSettings?.providers||[]).find(p=>p.id===configuredProvider)?.label||(configuredProvider==='inherit'?'Workspace default':configuredProvider);[['Provider',providerLabel],['Model',agent.modelPolicy?.defaultModel||'Provider default'],['Requests',metrics.usage.requests||0],['Tokens',(metrics.usage.totalTokens||0).toLocaleString()],['Cost','Not configured']].forEach(([label,value])=>{modelRows.append(node('span',label),node('strong',value));});modelCost.append(modelRows);panel.append(modelCost);

    const activity=node('section',null,'mc-profile-section');activity.append(node('h4','Recent activity'));if(!events.length)activity.append(node('p','No recorded activity yet.','mc-muted'));else events.forEach(event=>{const row=node('div',null,'mc-profile-activity-row');row.append(node('span',teamEventLabel(event)),node('time',formatTime(event.createdAt)));activity.append(row);});panel.append(activity);

    const config=node('details',null,'mc-profile-config');config.append(node('summary','Configuration'));const form=node('form',null,'mc-form'),name=field('Display name','input',agent.displayName),role=field('Role','input',agent.role),division=field('Division','input',agent.division),purpose=field('Purpose','textarea',agent.purpose),responsibilities=field('Responsibilities, one per line','textarea',(agent.responsibilities||[]).join('\n')),skillsInput=field('Skills, one per line','textarea',(agent.skills||[]).map(x=>x.name||x).join('\n')),managerLabel=node('label','Reports to'),managerSelect=node('select');
    const founderOpt=node('option','Human Founder');founderOpt.value='';managerSelect.append(founderOpt);for(const candidate of state.agents.filter(a=>a.id!==agent.id&&a.status!=='archived')){const opt=node('option',`${candidate.displayName} · ${candidate.role}`);opt.value=candidate.id;managerSelect.append(opt);}managerSelect.value=agent.managerAgentId||'';if(/chief of staff/i.test(agent.role||'')){managerSelect.value='';managerSelect.disabled=true;}managerLabel.append(managerSelect);const syncManagerControl=()=>{const chiefRole=/chief of staff/i.test(role.input.value||'');managerSelect.disabled=chiefRole;if(chiefRole)managerSelect.value='';};role.input.addEventListener('input',syncManagerControl);syncManagerControl();
    const prompt=field('System prompt','textarea',agent.systemPrompt),personality=field('Personality','textarea',agent.personality),providerLabelEl=node('label','AI provider'),providerSelect=node('select');const inherit=node('option','Inherit workspace provider');inherit.value='inherit';providerSelect.append(inherit);for(const p of (state.llmSettings?.providers||[]).filter(x=>x.configured&&x.id!=='dry-run')){const opt=node('option',p.label);opt.value=p.id;providerSelect.append(opt);}providerSelect.value=agent.modelPolicy?.provider||'inherit';providerLabelEl.append(providerSelect);const model=field('Model override (blank = provider default)','input',agent.modelPolicy?.defaultModel||'');model.input.placeholder='e.g. gemini-2.5-flash';const save=button('Save employee settings','mc-primary');save.type='submit';form.append(name.label,role.label,division.label,managerLabel,purpose.label,responsibilities.label,skillsInput.label,prompt.label,personality.label,providerLabelEl,model.label,save);config.append(form);panel.append(config);
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;setStatus(`Saving ${agent.displayName}…`);try{await api('PATCH',`/api/agents/${agent.id}`,{displayName:name.input.value.trim(),role:role.input.value.trim(),division:division.input.value.trim(),managerAgentId:/chief of staff/i.test(role.input.value)?null:(managerSelect.value||null),purpose:purpose.input.value.trim(),responsibilities:responsibilities.input.value.split('\n').map(x=>x.trim()).filter(Boolean),skills:skillsInput.input.value.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>({name:x,level:'advanced'})),systemPrompt:prompt.input.value,personality:personality.input.value,modelPolicy:{...(agent.modelPolicy||{}),provider:providerSelect.value,defaultModel:model.input.value.trim()||null}});state.teamSelectedAgentId=agent.id;await refresh('team');setStatus('Employee profile and reporting line saved.');}catch(err){setStatus(err.message);errorBox(err);}finally{save.disabled=false;}};

    const actions=node('div',null,'mc-profile-actions');if(agent.status==='draft'){const hire=button('Hire AI Employee','mc-primary');hire.onclick=()=>agentStatus(agent.id,'activate');actions.append(hire);}else if(agent.status==='active'){const pause=button('Pause','mc-secondary');pause.onclick=()=>agentStatus(agent.id,'pause');actions.append(pause);}else if(agent.status==='paused'||agent.status==='archived'){const activate=button(agent.status==='archived'?'Restore & Activate':'Activate','mc-primary');activate.onclick=()=>agentStatus(agent.id,'activate');actions.append(activate);}if(agent.status!=='archived'){const archive=button('Archive','mc-danger');archive.onclick=()=>{if(confirm(`Archive ${agent.displayName}? Their historical work remains available.`))agentStatus(agent.id,'archive');};actions.append(archive);}panel.append(actions);
  }

  function renderTeam(){
    content.replaceChildren();
    const hireTop=button('Hire AI Employee','mc-primary');hireTop.onclick=()=>content.querySelector('#mcHireEmployee')?.scrollIntoView({behavior:'smooth',block:'start'});
    content.append(sectionHead('Your AI Team','See the reporting structure first, then open any AI coworker to understand what they own, who they work with, and how they are configured.',hireTop));
    const currentAgents=state.agents.filter(a=>a.status!=='archived'),archivedAgents=state.agents.filter(a=>a.status==='archived');
    if(!currentAgents.length){const empty=node('div',null,'mc-empty');const inner=node('div');inner.append(node('strong','Your AI team is waiting to be built.'),node('span','Tell Organa who you need or let the organization designer recommend a team based on your goals.'));empty.append(inner);content.append(empty);}
    else{
      const chiefs=currentAgents.filter(a=>/chief of staff/i.test(a.role||'')),chief=chiefs[0]||currentAgents.find(a=>!a.managerAgentId)||currentAgents[0],departments=[...new Set(currentAgents.filter(a=>a.id!==chief.id).map(a=>a.division||'General'))].sort();const working=currentAgents.filter(a=>teamAgentWorkState(a)==='working').length,attention=currentAgents.filter(a=>['review','blocked','waiting'].includes(teamAgentWorkState(a))).length;
      const summary=node('div',null,'mc-team-summary');[['AI employees',currentAgents.length],['Departments',departments.length],['Working now',working],['Needs attention',attention]].forEach(([label,value])=>{const item=node('div');item.append(node('strong',value),node('span',label));summary.append(item);});content.append(summary);
      const workspace=node('div',null,'mc-team-workspace'),chart=node('section',null,'mc-team-org-chart'),profile=node('aside',null,'mc-team-profile');
      const toolbar=node('div',null,'mc-team-tree-toolbar'),title=node('div');title.append(node('strong','Organization structure'),node('span','Human Founder → Chief of Staff → divisions → specialist AI employees'));const controls=node('div',null,'mc-actions'),expand=button('Expand all','mc-secondary'),collapse=button('Collapse divisions','mc-secondary');controls.append(expand,collapse);toolbar.append(title,controls);chart.append(toolbar);
      const founder=node('div',null,'mc-founder-node');founder.append(node('span','HF','mc-founder-avatar'),node('div',null,'mc-founder-copy'));founder.lastChild.append(node('strong','You / Human Founder'),node('span','Owner · final authority'));chart.append(founder,node('div',null,'mc-org-connector-down'));
      const chiefNode=button(null,'mc-org-agent-node mc-chief-node');chiefNode.dataset.agentId=chief.id;const chiefAvatar=node('span',initials(chief.displayName),'mc-avatar');chiefAvatar.dataset.status=teamAgentWorkState(chief);const chiefCopy=node('div',null,'mc-org-agent-copy');chiefCopy.append(node('span','Chief of Staff','mc-org-eyebrow'),node('strong',chief.displayName),node('small',chief.role));chiefNode.append(chiefAvatar,chiefCopy,badge(teamAgentWorkState(chief)));chiefNode.onclick=()=>{state.teamSelectedAgentId=chief.id;renderTeamProfile(profile,chief);chart.querySelectorAll('.mc-org-agent-node').forEach(n=>n.classList.toggle('selected',n.dataset.agentId===chief.id));};chart.append(chiefNode);
      if(departments.length){chart.append(node('div',null,'mc-org-trunk'));const divisions=node('div',null,'mc-division-grid');
        const renderAgentBranch=(agent,divisionAgents,seen=new Set())=>{if(seen.has(agent.id))return null;seen.add(agent.id);const branch=node('div',null,'mc-report-branch'),agentNode=button(null,'mc-org-agent-node');agentNode.dataset.agentId=agent.id;const av=node('span',initials(agent.displayName),'mc-avatar');av.dataset.status=teamAgentWorkState(agent);const copy=node('div',null,'mc-org-agent-copy');copy.append(node('strong',agent.displayName),node('small',agent.role),node('em',`Reports to ${teamManagerName(agent)}`));agentNode.append(av,copy,badge(teamAgentWorkState(agent)));agentNode.onclick=()=>{state.teamSelectedAgentId=agent.id;renderTeamProfile(profile,agent);chart.querySelectorAll('.mc-org-agent-node').forEach(n=>n.classList.toggle('selected',n.dataset.agentId===agent.id));};if(state.teamSelectedAgentId===agent.id)agentNode.classList.add('selected');branch.append(agentNode);const children=divisionAgents.filter(a=>a.managerAgentId===agent.id);if(children.length){const childWrap=node('div',null,'mc-report-children');children.forEach(child=>{const childBranch=renderAgentBranch(child,divisionAgents,new Set(seen));if(childBranch)childWrap.append(childBranch);});branch.append(childWrap);}return branch;};
        for(const division of departments){const members=currentAgents.filter(a=>a.id!==chief.id&&(a.division||'General')===division),divisionCard=node('section',null,'mc-division-card'),head=button(null,'mc-division-head'),headCopy=node('span');headCopy.append(node('strong',division),node('small',`${members.length} ${members.length===1?'AI employee':'AI employees'}`));const chevron=node('span','⌄','mc-division-chevron');head.append(headCopy,chevron);divisionCard.append(head);const body=node('div',null,'mc-division-body'),roots=members.filter(a=>!members.some(candidate=>candidate.id===a.managerAgentId));roots.forEach(root=>{const branch=renderAgentBranch(root,members);if(branch)body.append(branch);});if(!roots.length&&members.length){members.forEach(member=>{const branch=renderAgentBranch(member,members);if(branch)body.append(branch);});}divisionCard.append(body);const collapsed=state.teamCollapsedDivisions.has(division);divisionCard.classList.toggle('collapsed',collapsed);body.hidden=collapsed;head.setAttribute('aria-expanded',String(!collapsed));head.onclick=()=>{const next=!body.hidden;body.hidden=next;divisionCard.classList.toggle('collapsed',next);head.setAttribute('aria-expanded',String(!next));if(next)state.teamCollapsedDivisions.add(division);else state.teamCollapsedDivisions.delete(division);};divisions.append(divisionCard);}chart.append(divisions);
        expand.onclick=()=>{state.teamCollapsedDivisions.clear();chart.querySelectorAll('.mc-division-card').forEach(card=>{card.classList.remove('collapsed');const body=card.querySelector('.mc-division-body'),head=card.querySelector('.mc-division-head');if(body)body.hidden=false;if(head)head.setAttribute('aria-expanded','true');});};collapse.onclick=()=>{departments.forEach(d=>state.teamCollapsedDivisions.add(d));chart.querySelectorAll('.mc-division-card').forEach(card=>{card.classList.add('collapsed');const body=card.querySelector('.mc-division-body'),head=card.querySelector('.mc-division-head');if(body)body.hidden=true;if(head)head.setAttribute('aria-expanded','false');});};
      }
      workspace.append(chart,profile);content.append(workspace);if(!state.teamSelectedAgentId||!currentAgents.some(a=>a.id===state.teamSelectedAgentId))state.teamSelectedAgentId=chief.id;renderTeamProfile(profile,teamAgentById(state.teamSelectedAgentId)||chief);chart.querySelectorAll('.mc-org-agent-node').forEach(n=>n.classList.toggle('selected',n.dataset.agentId===state.teamSelectedAgentId));
    }
    const hireCard=card('Hire an AI Employee','full');hireCard.id='mcHireEmployee';const hireCopy=node('p','Describe the capability you need. Organa will design a draft role in context of your North Star, Chief of Staff, and existing team. Nothing is activated until you approve it.','mc-muted'),form=node('form',null,'mc-form'),request=field('Hiring request','textarea');request.input.placeholder='Example: Hire a market researcher who challenges launch assumptions with evidence and reports to the Chief of Staff.';const design=button('Design Employee','mc-primary');design.type='submit';form.append(request.label,design);hireCard.append(hireCopy,form);content.append(hireCard);form.onsubmit=async e=>{e.preventDefault();if(!request.input.value.trim())return;signalAiAction('Designing this AI employee');if(usingLiveAi())setStatus('Organa is designing the role…');design.disabled=true;try{const draft=await api('POST','/api/agents/design',{request:request.input.value});state.teamSelectedAgentId=draft.id;setStatus(`${draft.displayName} designed as ${draft.role}. Review the draft profile and reporting line before hiring.`);await refresh('team');}catch(err){setStatus(err.message);errorBox(err);}finally{design.disabled=false;}};
    if(archivedAgents.length){const archived=card(`Archived AI Employees · ${archivedAgents.length}`,'full mc-team-archived');archived.append(node('p','Archived coworkers stay outside the active reporting structure, while their historical work and traceability remain available.','mc-muted'));const rows=node('div',null,'mc-team-archive-list');archivedAgents.forEach(agent=>{const row=node('div',null,'mc-team-archive-row'),identity=node('div',null,'mc-agent'),av=node('span',initials(agent.displayName),'mc-avatar'),copy=node('div');copy.append(node('strong',agent.displayName),node('span',`${agent.role} · ${agent.division||'General'}`));identity.append(av,copy);const restore=button('Restore','mc-secondary');restore.onclick=()=>{state.teamSelectedAgentId=agent.id;agentStatus(agent.id,'activate');};row.append(identity,restore);rows.append(row);});archived.append(rows);content.append(archived);}
  }

  async function agentStatus(id,action){setStatus(`${action} agent…`);try{await api('POST',`/api/agents/${id}/${action}`,{});await refresh('team');setStatus('Employee status updated. Reload the office to refresh the 3D roster.');}catch(err){setStatus(err.message);}}

  function isChiefOfStaff(agent){return /chief of staff/i.test(String(agent?.role||''));}
  function activeMissionAgents(){return state.agents.filter(agent=>agent.status==='active');}
  function specialistMissionAgents(){const specialists=activeMissionAgents().filter(agent=>!isChiefOfStaff(agent));return specialists.length?specialists:activeMissionAgents();}
  function agentLabel(agent){return `${agent?.displayName||'AI Employee'} · ${agent?.role||'Specialist'}`;}
  function missionInstructionTitle(value){
    const first=String(value||'').trim().split(/\n|[.!?](?:\s|$)/)[0].trim();
    return (first||'Direct assignment').slice(0,100);
  }
  function projectRoutingAgents(project){
    const ids=project.routing?.participantAgentIds?.length
      ? project.routing.participantAgentIds
      : [...new Set((project.planDraft?.tasks||[]).flatMap(task=>[...(task.preferredAgentIds||[]),...(task.collaborationSuggestedWith||[])]))];
    return ids.map(id=>state.agents.find(agent=>agent.id===id)).filter(Boolean);
  }
  function renderMission(){
    content.replaceChildren();
    content.append(sectionHead('Missions','Send work through your AI Chief of Staff when Organa should plan and distribute it, or assign an instruction directly to a specific AI employee when you already know who should own it.'));

    const intake=card('Start work','full mc-mission-intake');
    const modeGrid=node('div',null,'mc-intake-modes');
    const chief=button('',`mc-intake-mode ${state.missionIntakeMode==='chief'?'selected':''}`.trim());chief.dataset.intakeMode='chief';
    const chiefIcon=node('span','◎','mc-intake-mode-icon');const chiefCopy=node('span',null,'mc-intake-mode-copy');chiefCopy.append(node('strong','Ask Chief of Staff'),node('small','Give Organa a problem or outcome. Your Chief of Staff plans the work and assembles the right AI team.'));chief.append(chiefIcon,chiefCopy,node('span','Recommended for cross-functional work','mc-intake-mode-tag'));
    const direct=button('',`mc-intake-mode ${state.missionIntakeMode==='direct'?'selected':''}`.trim());direct.dataset.intakeMode='direct';
    const directIcon=node('span','→','mc-intake-mode-icon');const directCopy=node('span',null,'mc-intake-mode-copy');directCopy.append(node('strong','Assign to AI Employee'),node('small','Send a focused instruction straight to a specific coworker. Organa still tracks the work, review, cost, and activity.'));direct.append(directIcon,directCopy,node('span','Best when you know the owner','mc-intake-mode-tag'));
    [chief,direct].forEach(option=>{option.onclick=()=>{state.missionIntakeMode=option.dataset.intakeMode;renderMission();mountAiModeNotice(state.missionIntakeMode==='chief'?'Mission planning and distribution':'Direct AI employee execution');};});
    modeGrid.append(chief,direct);intake.append(modeGrid);

    if(state.missionIntakeMode==='chief'){
      const flow=node('div',null,'mc-intake-flow');
      const form=node('form',null,'mc-form mc-intake-form'),goal=field('What do you need the organization to solve?','textarea');
      goal.input.rows=5;goal.input.placeholder='Example: Revenue dropped this month. Find the likely causes, quantify the impact, and recommend the next actions.';
      goal.input.value=state.company?.company?.name==='Nusa Coffee'?'Prepare the Nusa Coffee launch next month. Recommend positioning, channels, budget allocation under IDR 25 million, and an execution-ready web launch package.':'';
      const hint=node('div',null,'mc-intake-hint');hint.append(node('strong','Chief of Staff will'),node('span','understand the request → choose owners and collaborators → create a bounded task DAG → bring important outputs back for human review'));
      const planBtn=button('Plan with Chief of Staff','mc-primary');planBtn.type='submit';form.append(goal.label,hint,planBtn);flow.append(form);intake.append(flow);
      form.onsubmit=async e=>{e.preventDefault();if(!goal.input.value.trim())return;signalAiAction('Planning and routing this mission');if(usingLiveAi())setStatus('Your Chief of Staff is choosing the team and planning the mission…');planBtn.disabled=true;try{const project=await api('POST','/api/projects/plan',{goal:goal.input.value,intakeMode:'chief_of_staff'});setStatus('Mission plan ready. Review the routing, owners, dependencies, and rationale before starting.');await refresh('mission');state.projects=[project,...state.projects.filter(p=>p.id!==project.id)];renderMission();mountAiModeNotice('Mission planning and distribution');}catch(err){errorBox(err);setStatus(err.message);}finally{planBtn.disabled=false;}};
    }else{
      const agents=specialistMissionAgents();
      const form=node('form',null,'mc-form mc-intake-form'),instruction=field('Instruction','textarea'),taskTitle=field('Task title (optional)','input');
      instruction.input.rows=5;instruction.input.placeholder='Example: Review last month\'s campaign results and propose three experiments for next week.';
      taskTitle.input.placeholder='Organa will create a title from your instruction if left blank.';
      const chooser=node('div',null,'mc-direct-chooser'),chooserHead=node('div',null,'mc-direct-chooser-head');chooserHead.append(node('div',null,'mc-direct-copy'));
      chooserHead.firstChild.append(node('strong','Assign to'),node('span','Choose one active AI employee. This bypasses Chief of Staff routing, not Organa governance.'));
      const search=node('input');search.type='search';search.placeholder='Search name, role, division, or skill';search.value=state.missionDirectSearch||'';search.className='mc-agent-search';chooserHead.append(search);chooser.append(chooserHead);
      const agentList=node('div',null,'mc-direct-agent-list');chooser.append(agentList);
      const renderAgentChoices=()=>{
        state.missionDirectSearch=search.value.trim();agentList.replaceChildren();
        const query=state.missionDirectSearch.toLowerCase();
        const visible=agents.filter(agent=>!query||`${agent.displayName} ${agent.role} ${agent.division||''} ${(agent.skills||[]).map(skill=>typeof skill==='string'?skill:skill.name||'').join(' ')}`.toLowerCase().includes(query));
        if(!visible.length){agentList.append(node('p',agents.length?'No AI employee matches this search.':'No active AI employee is available yet. Activate a team member first.','mc-muted'));return;}
        const divisions=new Map();visible.forEach(agent=>{const key=agent.division||'General';if(!divisions.has(key))divisions.set(key,[]);divisions.get(key).push(agent);});
        for(const [division,members] of [...divisions.entries()].sort(([a],[b])=>a.localeCompare(b))){const group=node('section',null,'mc-direct-division');group.append(node('h4',division));const grid=node('div',null,'mc-direct-agent-grid');members.sort((a,b)=>a.displayName.localeCompare(b.displayName)).forEach(agent=>{const selected=state.missionDirectAgentId===agent.id,choice=button('',`mc-direct-agent ${selected?'selected':''}`.trim());choice.dataset.agentId=agent.id;const avatar=node('span',initials(agent.displayName),'mc-avatar'),copy=node('span',null,'mc-direct-agent-copy');copy.append(node('strong',agent.displayName),node('span',agent.role),node('small',agent.managerAgentId?`Reports to ${state.agents.find(a=>a.id===agent.managerAgentId)?.displayName||'manager'}`:'Direct report'));choice.append(avatar,copy,badge(agent.status));choice.onclick=()=>{state.missionDirectAgentId=agent.id;renderAgentChoices();};grid.append(choice);});group.append(grid);agentList.append(group);}
      };
      if(!state.missionDirectAgentId&&agents[0])state.missionDirectAgentId=agents[0].id;
      search.oninput=renderAgentChoices;renderAgentChoices();
      const governance=node('div',null,'mc-intake-hint');governance.append(node('strong','Still governed by Organa'),node('span','The instruction is logged, traceable, shown in Mission Control and Stand-up, counted in model usage, and the output returns for human review.'));
      const sendBtn=button('Send instruction','mc-primary');sendBtn.type='submit';if(!agents.length)sendBtn.disabled=true;
      form.append(taskTitle.label,instruction.label,chooser,governance,sendBtn);intake.append(form);
      form.onsubmit=async e=>{e.preventDefault();const brief=instruction.input.value.trim(),assignee=agents.find(agent=>agent.id===state.missionDirectAgentId);if(!brief||!assignee)return;signalAiAction('Executing this direct assignment');sendBtn.disabled=true;try{const task=await api('POST','/api/tasks',{title:taskTitle.input.value.trim()||missionInstructionTitle(brief),brief,assigneeAgentId:assignee.id,approvalPolicy:'review_output',intakeMode:'direct_agent'});setStatus(`Instruction sent directly to ${assignee.displayName}. Organa is tracking task ${task.id} and will bring the output back for review.`);instruction.input.value='';taskTitle.input.value='';await refresh('mission');}catch(err){errorBox(err);setStatus(err.message);}finally{sendBtn.disabled=false;}};
    }
    content.append(intake);

    const directTasks=state.tasks.filter(task=>task.intakeMode==='direct_agent'&&!task.projectId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    if(directTasks.length){const directCard=card(`Direct assignments · ${directTasks.length}`,'full mc-direct-history'),intro=node('p','Focused instructions sent straight to an AI employee. These bypass Chief of Staff routing but remain inside the same Organa governance and audit trail.','mc-muted');directCard.append(intro);const rows=node('div',null,'mc-direct-history-list');directTasks.slice(0,8).forEach(task=>{const agent=state.agents.find(a=>a.id===task.assigneeAgentId),row=node('article',null,'mc-direct-history-row'),identity=node('div',null,'mc-direct-history-main');identity.append(node('strong',task.title),node('span',`${agentLabel(agent)} · ${formatTime(task.createdAt)}`));const side=node('div',null,'mc-actions');side.append(badge(task.status));const open=button('Open task','mc-secondary');open.onclick=()=>{dialog.close();window.officeTasks?.open();};side.append(open);row.append(identity,side);rows.append(row);});directCard.append(rows);content.append(directCard);}

    if(!state.projects.length){if(!directTasks.length){const empty=node('div',null,'mc-empty'),inner=node('div');inner.append(node('strong','Your organization is ready for its first piece of work.'),node('span','Ask the Chief of Staff for cross-functional work, or assign a focused instruction directly to an AI employee.'));empty.append(inner);content.append(empty);}return;}
    for(const project of state.projects){const c=card(project.title,'full'),top=node('div',null,'mc-actions');top.append(badge(project.status),node('span','Chief of Staff routed','mc-route-label'));if(project.status==='draft_plan'){const activate=button('Start Mission','mc-primary');activate.onclick=async()=>{activate.disabled=true;signalAiAction('Starting this mission');if(usingLiveAi())setStatus('Starting the mission and assigning ready work…');try{await api('POST',`/api/projects/${project.id}/activate-plan`,{});await refresh('mission');setStatus('Mission started. AI coworkers are working in dependency order.');}catch(err){setStatus(err.message);errorBox(err);}finally{activate.disabled=false;}};top.append(activate);}const openTasks=button('Open task review','mc-secondary');openTasks.onclick=()=>{dialog.close();window.officeTasks?.open();};top.append(openTasks);c.append(top,node('p',project.objective||project.planDraft?.objectiveSummary||''));
      const routingAgents=projectRoutingAgents(project);if(routingAgents.length){const routing=node('div',null,'mc-routing-preview'),routingHead=node('div',null,'mc-routing-preview-head');routingHead.append(node('strong','Team assembled by Chief of Staff'),node('span',project.routing?.rationale||'Owners and collaborators are selected from the task requirements, skills, and current organization.'));routing.append(routingHead);const people=node('div',null,'mc-routing-people');const coordinator=state.agents.find(agent=>agent.id===project.routing?.coordinatorAgentId)||activeMissionAgents().find(isChiefOfStaff);if(coordinator){const chip=node('span',null,'mc-routing-person coordinator');chip.append(node('b',coordinator.displayName),node('small','Chief of Staff · coordinates'));people.append(chip);}routingAgents.filter(agent=>agent.id!==coordinator?.id).forEach(agent=>{const chip=node('span',null,'mc-routing-person');chip.append(node('b',agent.displayName),node('small',agent.role));people.append(chip);});routing.append(people);c.append(routing);}
      const projectTasks=state.tasks.filter(t=>t.projectId===project.id);if(project.status==='draft_plan'){const dag=node('div',null,'mc-dag');(project.planDraft?.tasks||[]).forEach((t,i)=>{const owner=state.agents.find(a=>a.id===t.preferredAgentIds?.[0]),collaborators=(t.collaborationSuggestedWith||[]).map(id=>state.agents.find(a=>a.id===id)).filter(Boolean),r=node('div',null,'mc-task-node');r.append(node('span',i+1,'mc-node-number'));const mid=node('div');mid.append(node('h4',t.title),node('p',t.description||''),node('p',`${owner?`Owner: ${agentLabel(owner)}`:'Owner will be resolved'}${collaborators.length?` · Collaborators: ${collaborators.map(a=>a.displayName).join(', ')}`:''}`,'mc-owner-line'),node('p',t.dependsOn?.length?`Depends on: ${t.dependsOn.join(', ')}`:'Starts immediately','mc-deps'));if(t.reason)mid.append(node('p',`Why this route: ${t.reason}`,'mc-routing-reason'));r.append(mid,badge(t.approvalPolicy==='none'?'planned':'review'));dag.append(r);});c.append(dag);}else if(projectTasks.length){const done=projectTasks.filter(t=>t.status==='done').length,progress=node('div',null,'mc-progress');progress.append(node('span'));progress.firstChild.style.width=`${Math.round(done/projectTasks.length*100)}%`;c.append(node('p',`${done}/${projectTasks.length} tasks completed`,'mc-muted'),progress);const dag=node('div',null,'mc-dag');projectTasks.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).forEach((t,i)=>{const agent=state.agents.find(a=>a.id===t.assigneeAgentId),r=node('div',null,'mc-task-node');r.append(node('span',i+1,'mc-node-number'));const mid=node('div');mid.append(node('h4',t.title),node('p',`${agent?.displayName||'Agent'} · ${agent?.role||''}`),node('p',t.dependencyIds?.length?`Dependencies: ${t.dependencyIds.map(d=>projectTasks.find(x=>x.id===d)?.title||d).join(' → ')}`:'No dependencies','mc-deps'));r.append(mid,badge(t.status));dag.append(r);});c.append(dag);}content.append(c);}
  }

  function renderMeetings(){
    content.replaceChildren();content.append(sectionHead('Meeting Room','When a mission needs multiple perspectives, AI coworkers meet around one shared objective. Organa preserves evidence, disagreements, and the final recommendation for your review.'));
    if(!state.meetings.length){const empty=node('div',null,'mc-empty'),inner=node('div');inner.append(node('strong','No collaboration session is needed yet.'),node('span','When a mission benefits from multiple perspectives, Organa will bring the right coworkers together around one shared objective.'));empty.append(inner);content.append(empty);return;}
    for(const meeting of state.meetings){const c=card(meeting.title,'full'),agents=meeting.participantAgentIds.map(id=>state.agents.find(a=>a.id===id)).filter(Boolean),people=node('div',null,'mc-meeting-people');agents.forEach(a=>{const person=node('span',initials(a.displayName));person.dataset.status='collaborating';people.append(person);});c.append(badge(meeting.status),node('p',meeting.agenda),people,node('p',agents.map(a=>`${a.displayName} · ${a.role}`).join('  |  '),'mc-muted'));if(meeting.dependencyIds?.length)c.append(node('p',`Starts after ${meeting.dependencyIds.length} required task${meeting.dependencyIds.length===1?'':'s'} are complete.`,'mc-mono'));
      const acts=node('div',null,'mc-actions');if(['scheduled','failed','needs_input'].includes(meeting.status)){const start=button('Start cross-functional meeting','mc-primary');start.onclick=()=>startMeeting(meeting,agents,start);acts.append(start);}if(meeting.status==='review'){const approve=button('Approve decision','mc-primary');approve.onclick=()=>reviewMeeting(meeting,true);const revise=button('Request revision','mc-secondary');revise.onclick=()=>reviewMeeting(meeting,false);acts.append(approve,revise);}c.append(acts);if(meeting.result?.summary){c.append(node('h4','Synthesis'),node('p',meeting.result.summary));if(meeting.result.disagreements?.length)c.append(node('h4','Material disagreements'),node('p',meeting.result.disagreements.join(' · '),'mc-muted'));}content.append(c);}
  }
  async function startMeeting(meeting,agents,start){start.disabled=true;signalAiAction('Running this cross-functional meeting');if(usingLiveAi())setStatus('Your team is joining the meeting and preparing independent perspectives…');document.dispatchEvent(new CustomEvent('organa:meeting-start',{detail:{names:agents.map(a=>a.displayName)}}));try{await api('POST',`/api/meetings/${meeting.id}/start`,{});setStatus('Meeting complete. The recommendation is ready for your review.');await refresh('meetings');}catch(err){document.dispatchEvent(new CustomEvent('organa:meeting-end',{detail:{names:agents.map(a=>a.displayName)}}));setStatus(err.message);errorBox(err);}finally{start.disabled=false;}}
  async function reviewMeeting(meeting,approve){const note=approve?'':prompt('What should the team revise?','Reconcile the recommendation with the hard constraints and make the trade-off explicit.')||'';if(!approve&&!note)return;setStatus(approve?'Approving meeting decision…':'Requesting revision…');try{await api('POST',`/api/meetings/${meeting.id}/${approve?'approve':'request-revision'}`,{note});await refresh('meetings');setStatus(approve?'Decision approved.':'Meeting returned for revision.');}catch(err){setStatus(err.message);}}

  function renderKnowledge(){
    content.replaceChildren();
    const actions=node('div',null,'mc-actions'),search=node('input');search.type='search';search.placeholder='Search knowledge and deliverables…';search.className='mc-search-input';actions.append(search);
    content.append(sectionHead('Knowledge','Durable work should become organizational memory, not disappear inside chat history. Browse deliverables, evidence, assumptions, and the decisions behind them.',actions));
    const list=node('div',null,'mc-grid mc-knowledge-grid');content.append(list);
    const renderList=()=>{
      list.replaceChildren();
      const query=search.value.trim().toLowerCase();
      const items=state.deliverables.filter(d=>{const version=d.versions?.find(v=>v.id===d.currentVersionId)||d.versions?.at(-1);return !query||`${d.title} ${version?.content||''} ${d.status||''}`.toLowerCase().includes(query);});
      if(!items.length){const empty=node('div',null,'mc-empty full'),inner=node('div');inner.append(node('strong',query?'No knowledge matches your search.':'Your knowledge base will grow as missions produce durable work.'),node('span',query?'Try a different keyword.':'Completed deliverables, evidence, and rationale will appear here automatically.'));empty.append(inner);list.append(empty);return;}
      for(const d of items){const version=d.versions?.find(v=>v.id===d.currentVersionId)||d.versions?.at(-1),c=card(d.title,'full mc-knowledge-card');c.append(badge(d.status),node('p',version?.content||'No textual content yet.','mc-deliverable'));const meta=node('div',null,'mc-actions'),why=button('View traceability','mc-secondary');meta.append(why);c.append(meta);why.onclick=async()=>{why.disabled=true;try{const data=await api('GET',`/api/deliverables/${d.id}/why`),panel=node('div',null,'mc-why');panel.append(node('strong','Why this exists'));const ul=node('ul');[`Goals: ${data.goals.map(g=>g.title).join(', ')||'none'}`,`Evidence: ${data.evidenceRefs.join(', ')||'none'}`,`Assumptions: ${data.assumptions.join(' · ')||'none'}`,`Collaborators: ${data.collaborators.map(a=>a.displayName).join(', ')||'none'}`,`Decision summary: ${data.decisionSummary||'none'}`].forEach(x=>ul.append(node('li',x)));panel.append(ul);c.append(panel);why.remove();}catch(err){setStatus(err.message);why.disabled=false;}};list.append(c);}
    };
    search.oninput=renderList;renderList();
    const learning=card('Recent learning signals','full');const useful=state.events.filter(e=>['task.completed','meeting.completed','approval.resolved','deliverable.created','deliverable.updated'].includes(e.type)).slice(0,12);if(!useful.length)learning.append(node('p','No learning signals yet. Finish a mission or approve a deliverable and Organa will retain the result here.','mc-muted'));else useful.forEach(e=>{const row=node('div',null,'mc-event');row.append(node('time',formatTime(e.createdAt)),node('span',`${e.type.replaceAll('.',' · ')}${e.payload?.title?` · ${e.payload.title}`:''}`));learning.append(row);});content.append(learning);
  }

  function renderGoals(){
    content.replaceChildren();const company=state.company?.company||{},ns=state.company?.northStar||{};
    const actions=node('div',null,'mc-actions'),edit=button('Edit North Star','mc-primary');edit.onclick=()=>renderNorthStarEditor(ns);actions.append(edit);
    content.append(sectionHead('Goals & North Star','This is the center of the organization. Every mission, agent, approval, and deliverable should be explainable against these human-defined goals and constraints.',actions));
    const grid=node('div',null,'mc-grid');
    const mission=card('Mission');mission.append(node('p',ns.mission||'No mission set yet.','mc-goal-primary'));grid.append(mission);
    const vision=card('Vision');vision.append(node('p',ns.vision||'No vision set yet.'));grid.append(vision);
    const principles=card('Company principles');if(ns.principles?.length){const ul=node('ul');ns.principles.forEach(x=>ul.append(node('li',x)));principles.append(ul);}else principles.append(node('p','No principles defined yet.','mc-muted'));grid.append(principles);
    const constraints=card('Strategic constraints');if(ns.constraints?.length){const wrap=node('div',null,'mc-constraints');wrap.textContent=ns.constraints.map(c=>`${c.severity==='hard'?'HARD':'SOFT'} · ${c.text}`).join('\n');constraints.append(wrap);}else constraints.append(node('p','No constraints defined yet.','mc-muted'));grid.append(constraints);
    content.append(grid);
    const kpis=card(`KPIs · ${ns.kpis?.length||0}`,'full');if(ns.kpis?.length){const rows=node('div',null,'mc-list');ns.kpis.forEach(kpi=>{const row=node('div',null,'mc-event');row.append(node('span',kpi.name),node('span',`${kpi.target??'—'} ${kpi.unit||''}${kpi.deadline?` · due ${kpi.deadline}`:''}`));rows.append(row);});kpis.append(rows);}else kpis.append(node('p','No KPIs defined yet. Add measurable outcomes to make mission progress easier to evaluate.','mc-muted'));content.append(kpis);
    const active=card(`Active missions · ${state.projects.filter(p=>!['completed','cancelled'].includes(p.status)).length}`,'full');const projects=state.projects.filter(p=>!['completed','cancelled'].includes(p.status));if(!projects.length)active.append(node('p','No active mission yet. Create one from the Missions section when you are ready to execute against this North Star.','mc-muted'));else projects.forEach(project=>{const row=node('div',null,'mc-event');row.append(node('span',project.title),badge(project.status));active.append(row);});content.append(active);
  }

  function renderPerformance(){
    content.replaceChildren();
    const completed=state.tasks.filter(t=>t.status==='done').length,working=state.tasks.filter(t=>['active','queued'].includes(t.status)).length,review=state.tasks.filter(t=>t.status==='review').length,blocked=state.tasks.filter(t=>['blocked','failed','waiting_dependency'].includes(t.status)).length;
    content.append(sectionHead('Performance','Focus on operational health rather than vanity metrics: what is moving, what is blocked, which coworkers are contributing, and how much model capacity the organization is using.'));
    const metrics=node('div',null,'mc-hero-stats mc-performance-stats');[[completed,'tasks completed'],[working,'working / queued'],[review,'awaiting review'],[blocked,'blocked / waiting'],[state.deliverables.length,'deliverables'],[state.usageSummary?.requests||0,'model calls']].forEach(([value,label])=>{const stat=node('div',null,'mc-hero-stat');stat.append(node('strong',value),node('span',label));metrics.append(stat);});content.append(metrics);
    const missionCard=card('Mission progress','full');if(!state.projects.length)missionCard.append(node('p','No mission history yet.','mc-muted'));else state.projects.slice(0,8).forEach(project=>{const tasks=state.tasks.filter(t=>t.projectId===project.id),done=tasks.filter(t=>t.status==='done').length,pct=tasks.length?Math.round(done/tasks.length*100):0,row=node('div',null,'mc-performance-row'),head=node('div',null,'mc-performance-head'),bar=node('div',null,'mc-progress');head.append(node('strong',project.title),node('span',`${done}/${tasks.length} · ${pct}%`));bar.append(node('span'));bar.firstChild.style.width=`${pct}%`;row.append(head,bar);missionCard.append(row);});content.append(missionCard);
    const agents=card('AI coworker activity','full'),grid=node('div',null,'mc-grid');state.agents.filter(a=>a.status!=='draft').forEach(agent=>{const tasks=state.tasks.filter(t=>t.assigneeAgentId===agent.id),done=tasks.filter(t=>t.status==='done').length,active=tasks.filter(t=>['active','queued'].includes(t.status)).length,usage=state.usageSummary?.byAgent?.[agent.id]||{},c=card(agent.displayName);c.append(node('p',agent.role,'mc-muted'),node('p',`${done} done · ${active} active · ${usage.requests||0} model calls · ${(usage.totalTokens||0).toLocaleString()} tokens`));grid.append(c);});if(!state.agents.length)agents.append(node('p','No coworkers yet.','mc-muted'));else agents.append(grid);content.append(agents);
  }

  function renderReview(){
    content.replaceChildren();content.append(sectionHead('Approval Center & Traceability','Important decisions come to you. Review recommendations, request changes, and inspect the goals, evidence, assumptions, and collaborators behind each deliverable.'));
    const pending=card(`Pending approvals · ${state.approvals.length}`,'full');if(!state.approvals.length)pending.append(node('p','You are all caught up. No decision needs your approval right now.','mc-muted'));for(const approval of state.approvals){const row=node('div',null,'mc-card full');row.append(badge(approval.status),node('h3',approval.title),node('p',approval.summary||''));const acts=node('div',null,'mc-actions'),approve=button('Approve','mc-primary'),revise=button('Request revision','mc-secondary');approve.onclick=()=>resolveApproval(approval,'approve');revise.onclick=()=>resolveApproval(approval,'request-revision');acts.append(approve,revise);row.append(acts);pending.append(row);}content.append(pending);
    const deliveries=card(`Deliverables · ${state.deliverables.length}`,'full');if(!state.deliverables.length)deliveries.append(node('p','No deliverables yet. Completed mission work will appear here with its traceability.','mc-muted'));for(const d of state.deliverables.slice(0,20)){const box=node('article',null,'mc-card full'),version=d.versions?.find(v=>v.id===d.currentVersionId)||d.versions?.at(-1);box.append(badge(d.status),node('h3',d.title),node('div',version?.content||'No textual content.','mc-deliverable'));const why=button('Why did the team do this?','mc-secondary');box.append(why);why.onclick=async()=>{why.disabled=true;try{const data=await api('GET',`/api/deliverables/${d.id}/why`),panel=node('div',null,'mc-why');panel.append(node('strong','Traceability'));const list=node('ul');[`Goals: ${data.goals.map(g=>g.title).join(', ')||'none'}`,`Evidence: ${data.evidenceRefs.join(', ')||'none'}`,`Assumptions: ${data.assumptions.join(' · ')||'none'}`,`Collaborators: ${data.collaborators.map(a=>a.displayName).join(', ')||'none'}`,`Decision summary: ${data.decisionSummary||'none'}`].forEach(x=>list.append(node('li',x)));panel.append(list);box.append(panel);why.remove();}catch(err){setStatus(err.message);why.disabled=false;}};deliveries.append(box);}content.append(deliveries);
  }
  async function resolveApproval(approval,action){let note='';if(action!=='approve'){note=prompt('Revision request','Make the decision rationale more explicit and reconcile it with the hard constraints.')||'';if(!note)return;}setStatus(`${action==='approve'?'Approving':'Requesting revision for'} ${approval.title}…`);try{await api('POST',`/api/approvals/${approval.id}/${action}`,{note});await refresh('review');setStatus('Review state updated.');}catch(err){setStatus(err.message);}}

  function renderStandup(){
    content.replaceChildren();const actions=node('div',null,'mc-actions'),generate=button(state.standup?'Refresh Stand-Up':'Start Stand-Up','mc-primary');actions.append(generate);content.append(sectionHead('Morning Stand-up','Get a concise owner briefing based on real tasks, decisions, approvals, and blockers from your organization.',actions));generate.onclick=async()=>{generate.disabled=true;const original=generate.textContent;generate.textContent='Preparing…';signalAiAction('Generating this Stand-up');if(usingLiveAi())setStatus('Preparing your morning brief from the team’s verified activity…');try{state.standup=await api('POST','/api/standups/generate',{}, {timeoutMs:60000});setStatus(state.standup?.generation?.degraded?'Stand-up ready from verified activity. AI summarization was temporarily unavailable.':'Your morning brief is ready.');renderStandup();}catch(err){setStatus(err.message);errorBox(err);}finally{generate.disabled=false;generate.textContent=original;}};
    if(state.standup){const s=state.standup.summary||{},c=card('Owner brief','full mc-standup');const meta=node('div',null,'mc-standup-meta');meta.append(badge(state.standup.generation?.degraded?'verified fallback':'completed'),node('span',`Generated ${formatTime(state.standup.createdAt)}`,'mc-muted'));c.append(meta,node('h3',s.headline||'Stand-up'));if(state.standup.generation?.degraded){const notice=node('div',null,'mc-standup-notice');notice.append(node('strong','Verified fallback'),node('span','The AI summarizer was temporarily unavailable, so Organa built this brief directly from stored tasks, approvals, meetings, and blockers.'));c.append(notice);}const add=(title,items,formatter=x=>x.summary)=>{if(!items?.length)return;c.append(node('h4',title));const ul=node('ul');items.forEach(x=>ul.append(node('li',formatter(x))));c.append(ul);};add('Needs attention',s.needsAttention);add('Blockers',s.blockers);add('Completed',s.completed);add('Decisions',s.decisions);add('Next',s.next);if(s.usageSummary)c.append(node('p',s.usageSummary,'mc-muted'));content.append(c);}else content.append(node('div','No stand-up yet. Start one when you want an owner brief from the organization’s verified activity.','mc-empty'));
    const activity=card('Recent activity','full');for(const e of state.events.slice(0,30)){const row=node('div',null,'mc-event');row.append(node('time',formatTime(e.createdAt)),node('span',`${e.type}${e.payload?.title?` · ${e.payload.title}`:''}`));activity.append(row);}content.append(activity);
  }

  function renderSettings(){
    content.replaceChildren();
    content.append(sectionHead('AI Settings','Choose which AI provider powers Organa. Credentials stay server-side, and individual coworkers can inherit the workspace choice or use an approved override.'));
    const settings=state.llmSettings||{}, providers=settings.providers||[],runtime=settings.runtime||{};
    const runtimeCard=card('AI runtime status','full mc-ai-runtime-card'),runtimeRow=node('div',null,'mc-ai-runtime-row'),runtimeCopy=node('div'),runtimeError=runtime.status==='error';
    runtimeCopy.append(node('strong',runtimeError?'AI provider needs attention':runtime.usingLiveAi?`Live AI · ${runtime.selectedProviderLabel||settings.provider||'provider'}`:runtime.liveProviderConfigured?'Deterministic mode selected':'No live AI provider configured'),node('p',runtimeError?(runtime.lastError?.message||'The selected provider could not complete the last model request. Review credentials and permissions, then retry.'):runtime.usingLiveAi?`New AI work uses ${settings.model||'the provider default model'}. Credentials remain server-side.`:runtime.liveProviderConfigured?'A live provider is available on the server, but Organa is currently using deterministic demo output. Select the live provider below to switch.':'Organa remains usable in deterministic demo mode. Connect Gemini when you want real model reasoning and generation.','mc-muted'));
    runtimeRow.append(node('span',runtimeError?'ATTENTION':runtime.usingLiveAi?'LIVE':'DEMO',`mc-badge ${runtimeError?'blocked':runtime.usingLiveAi?'done':'warn'}`),runtimeCopy);runtimeCard.append(runtimeRow);content.append(runtimeCard);
    const cardEl=card('Workspace default','full'),form=node('form',null,'mc-form'),providerLabel=node('label','Provider'),providerSelect=node('select');
    for(const p of providers){const option=node('option',`${p.label}${p.configured?'':' · not configured'}`);option.value=p.id;option.disabled=!p.configured;providerSelect.append(option);}providerSelect.value=settings.provider||'dry-run';providerLabel.append(providerSelect);
    const model=field('Default worker model','input',settings.model||''),planner=field('Planner / Chief of Staff model','input',settings.plannerModel||'');
    const hint=node('p','','mc-muted');
    const updateHint=()=>{const p=providers.find(x=>x.id===providerSelect.value);hint.textContent=p?`Authentication: ${p.authMode}. Default: ${p.defaultModel||'n/a'}${p.plannerModel&&p.plannerModel!==p.defaultModel?` · planner ${p.plannerModel}`:''}`:'';if(!model.input.value||!model.input.dataset.edited)model.input.placeholder=p?.defaultModel||'';if(!planner.input.value||!planner.input.dataset.edited)planner.input.placeholder=p?.plannerModel||p?.defaultModel||'';};
    model.input.oninput=()=>model.input.dataset.edited='1';planner.input.oninput=()=>planner.input.dataset.edited='1';providerSelect.onchange=updateHint;updateHint();
    const save=button('Save AI Provider','mc-primary');save.type='submit';form.append(providerLabel,model.label,planner.label,hint,save);cardEl.append(form);content.append(cardEl);
    const security=card('Credential setup','full');
    const authGrid=node('div',null,'mc-ai-auth-grid'),vertexAuth=node('div',null,'mc-ai-auth-option'),apiAuth=node('div',null,'mc-ai-auth-option');
    vertexAuth.append(node('strong','Gemini on Vertex AI · recommended'),node('p','Supports Google Cloud service accounts and Application Default Credentials. Local options: GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64. On Cloud Run, attach a runtime service account instead of shipping a key file.','mc-muted'),node('code','ORGANA_LLM_PROVIDER=vertex\nGOOGLE_CLOUD_PROJECT=your-project\nGOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json'));
    apiAuth.append(node('strong','Gemini Developer API'),node('p','Uses an API key instead of a Google Cloud service account. Keep the key on the server.','mc-muted'),node('code','ORGANA_LLM_PROVIDER=gemini\nGEMINI_API_KEY=your-server-side-key'));
    authGrid.append(vertexAuth,apiAuth);security.append(authGrid);const rows=node('div',null,'mc-list');for(const p of providers){const row=node('div',null,'mc-event');row.append(node('span',p.configured?'CONFIGURED':'NOT CONFIGURED'),node('span',`${p.label} · ${p.authMode}`));rows.append(row);}security.append(rows);content.append(security);
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;setStatus('Updating the workspace AI provider…');try{state.llmSettings=await api('PATCH','/api/llm/settings',{provider:providerSelect.value,model:model.input.value.trim(),plannerModel:planner.input.value.trim()});state.health=await api('GET','/api/health');document.dispatchEvent(new CustomEvent('organa:ai-settings-changed'));setStatus(`Now using ${state.llmSettings.provider}${state.llmSettings.model?` · ${state.llmSettings.model}`:''}. New model calls use this setting.`);renderSettings();}catch(err){setStatus(err.message);errorBox(err);}finally{save.disabled=false;}};
  }

  function render(){
    if(state.onboardingMode){document.querySelectorAll('[data-mc-tab]').forEach(b=>b.classList.remove('active'));renderOnboarding();content.focus({preventScroll:true});return;}
    document.querySelectorAll('[data-mc-tab]').forEach(b=>b.classList.toggle('active',b.dataset.mcTab===state.tab));
    syncGlobalNavigation(state.tab);
    ({company:renderCompany,team:renderTeam,mission:renderMission,meetings:renderMeetings,knowledge:renderKnowledge,review:renderReview,standup:renderStandup,goals:renderGoals,performance:renderPerformance,settings:renderSettings}[state.tab]||renderCompany)();
    if(['company','team','mission','meetings','standup'].includes(state.tab))mountAiModeNotice({company:'Organization design',team:'AI employee design',mission:'Mission planning and execution',meetings:'AI collaboration',standup:'AI Stand-up summarization'}[state.tab]);
    content.focus({preventScroll:true});
  }
  async function refresh(tab=state.tab){
    state.tab=tab;
    try{
      if(state.onboardingMode){await loadOnboarding();renderOnboarding();return;}
      await loadAll();render();
    }catch(err){
      if(state.onboardingMode){state.onboardingError=err.message||String(err);renderOnboarding();setStatus('Organa cannot reach the onboarding service right now. You can retry without reloading the page.');return;}
      content.replaceChildren();errorBox(err);setStatus('Organa cannot reach the workspace service right now.');
    }
  }

  async function openMissionControl({onboarding=false}={}){
    state.onboardingMode=onboarding||state.onboardingMode;
    if(state.onboardingMode){
      state.tab='company';setOnboardingChrome(true);ensureDialog(false);renderOnboarding();setStatus('Preparing your organization builder…');
      await refresh('company');
      setStatus(state.onboardingError||'Choose how to start. Every path creates an editable draft and keeps activation under your approval.');
      requestAnimationFrame(()=>content.querySelector('[data-onboarding-goal]')?.focus({preventScroll:true}));
      return;
    }
    setOnboardingChrome(false);ensureDialog(true);setStatus('Loading your organization…');
    await refresh(state.tab);
    setStatus(state.health?.provider==='dry-run'?'Demo mode is active. Connect an AI provider in Settings for live model output.':`Connected to ${state.health?.provider} (${state.health?.model||'default model'}) · ${state.health?.storage} persistence`);
  }
  $('bMission').onclick=()=>openMissionControl();
  $('closeMission').onclick=()=>{if(state.onboardingMode){state.onboardingMode=false;clearOnboardingRoute();setOnboardingChrome(false);}dialog.close();};
  dialog.addEventListener('click',e=>{if(e.target===dialog&&dialog.matches?.(':modal'))dialog.close();});
  dialog.addEventListener('close',()=>{if(state.onboardingMode){state.onboardingMode=false;clearOnboardingRoute();setOnboardingChrome(false);}});
  document.querySelectorAll('[data-mc-tab]').forEach(b=>b.onclick=()=>{const wasOnboarding=state.onboardingMode;state.onboardingMode=false;state.tab=b.dataset.mcTab;if(wasOnboarding){clearOnboardingRoute();setOnboardingChrome(false);ensureDialog(true);refresh(state.tab);}else render();});
  if(onboardingRequested)setTimeout(()=>openMissionControl({onboarding:true}),60);
  setInterval(()=>{if(dialog.open&&!state.onboardingMode&&!['company','team'].includes(state.tab))loadAll().then(render).catch(()=>{});},3000);
})();
