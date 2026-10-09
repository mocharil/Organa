(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('missionDialog'), content = $('mcContent'), statusEl = $('mcStatus');
  if (!dialog || !content) return;

  const ui = window.OrganaUI;
  const collectionFilters = {};
  const draftCache = new Map();
  const draftStorageKey = kind => `organa-workflow:${state.company?.company?.id || 'workspace'}:${kind}`;
  function readDraft(kind, fallback = {}) { const key = draftStorageKey(kind); if (draftCache.has(key)) return draftCache.get(key); try { return JSON.parse(sessionStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function writeDraft(kind, value) { const key = draftStorageKey(kind); draftCache.set(key, value); try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function clearDraft(kind, expected) { if (expected !== undefined && JSON.stringify(readDraft(kind)) !== JSON.stringify(expected)) return; const key = draftStorageKey(kind); draftCache.delete(key); try { sessionStorage.removeItem(key); } catch {} }
  function requestId(kind, payload) { const signature = JSON.stringify(payload), saved = readDraft('request:' + kind); if (saved.signature === signature) return saved.id; const request = {signature, id: crypto.randomUUID()}; writeDraft('request:' + kind, request); return request.id; }
  const params = new URLSearchParams(location.search);
  const onboardingRequested = params.get('onboarding') === '1';
  const onboardingGoal = params.get('goal') || '';
  const state = {tab:'company', onboardingMode:onboardingRequested, teamSelectedAgentId:null, teamCollapsedDivisions:new Set(), health:null, company:null, templates:[], northStarVersions:[], agents:[], projects:[], tasks:[], meetings:[], approvals:[], deliverables:[], events:[], standup:null, usageSummary:null,llmSettings:null, missionIntakeMode:'chief', missionDirectAgentId:null, missionDirectSearch:''};
  const workflowState={standupBusy:false,meetingBusy:new Set(),approvalBusy:new Set(),employeeBusy:new Set(),hiringBusy:false,hiringText:'',hiringRequestId:'',hiringSignature:'',missionBusy:false,directBusy:false,activationBusy:new Set(),clarificationBusy:new Set(),northStarBusy:false};
  let navigationVersion=0,lastRenderedSignature='',polling=false;
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
  const tabRoutes={company:'overview',team:'team',mission:'missions',meetings:'meetings',knowledge:'knowledge',review:'approvals',emails:'emails',standup:'standup',goals:'goals',performance:'performance',settings:'settings'};
  const tabChrome={
    company:['Organization Overview','Your team, its progress, and the decisions waiting for you.'],
    team:['Your AI Team','Find a coworker, explore the structure, and review who owns each responsibility.'],
    mission:['Missions','Give your team an outcome and follow it through to delivery.'],
    meetings:['Meeting Room','Coordinate cross-functional AI coworkers around one shared objective.'],
    knowledge:['Knowledge','Find saved work and the evidence behind it.'],
    emails:['Emails','Draft with AI, review, and send from your own Gmail.'],
    review:['Approval Center','Review consequential recommendations and keep human authority over important decisions.'],
    standup:['Morning Stand-up','Get an owner briefing generated from real work, blockers, decisions, and progress.'],
    goals:['Goals & North Star','Keep mission, vision, KPIs, principles, and hard constraints visible to the whole organization.'],
    performance:['Performance','Review progress, team activity, and recorded model usage.'],
    settings:['AI Settings','Choose the provider and models your team uses.']
  };
  function syncGlobalNavigation(tab){
    const route=tabRoutes[tab];
    if(route)document.querySelectorAll('[data-organa-route]').forEach(button=>{const active=button.dataset.organaRoute===route;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
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
      const data=await response.json().catch(()=>{throw new Error('Organa returned an unreadable response. Please try again.');});
      if(!response.ok){const err=new Error(typeof data.error==='string'?data.error:data.error?.message||`Server error ${response.status}`);err.status=response.status;err.code=data.code||'';err.details=data.details||null;if(err.code==='AI_PROVIDER_NOT_READY'||err.code==='AI_PROVIDER_UNAVAILABLE')document.dispatchEvent(new CustomEvent('organa:ai-provider-error',{detail:{code:err.code,message:err.message}}));throw err;}
      return data;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('This request is taking longer than expected. Please try again.');
      if(error?.name==='TypeError')throw new Error('The connection was interrupted. Please retry; your draft stays in place.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  async function loadAll(){
    const [health,company,templates,northStarVersions,agents,projects,tasks,meetings,approvals,deliverables,events,standup,usageSummary,llmSettings,emails]=await Promise.all([
      api('GET','/api/health'),api('GET','/api/company'),api('GET','/api/company-bootstrap/templates'),api('GET','/api/north-star/versions'),api('GET','/api/agents?includeDrafts=1'),api('GET','/api/projects'),api('GET','/api/tasks'),api('GET','/api/meetings'),api('GET','/api/approvals?status=pending'),api('GET','/api/deliverables'),api('GET','/api/events?limit=80'),api('GET','/api/standups/latest'),api('GET','/api/usage/summary'),api('GET','/api/llm/settings'),api('GET','/api/emails').catch(()=>[])
    ]);
    Object.assign(state,{health,company,templates,northStarVersions,agents:agents.agents||[],projects,tasks,meetings,approvals,deliverables,events,standup,usageSummary,llmSettings,emails});
    updateAttentionBadge();
  }
  // Everything that is waiting on the owner, in the order it should be handled.
  function attentionItems(){
    const items=[];
    for(const approval of state.approvals.filter(a=>a.status==='pending'))items.push({kind:'Approve',text:approval.title||'Decision waiting',tab:'review'});
    for(const task of state.tasks.filter(t=>t.status==='blocked'))items.push({kind:'Answer',text:`${task.title} · a coworker needs information`,route:'tasks'});
    for(const task of state.tasks.filter(t=>t.status==='failed'))items.push({kind:'Retry',text:`${task.title} · failed${task.error?': '+String(task.error).slice(0,90):''}`,route:'tasks'});
    for(const meeting of state.meetings.filter(x=>x.status==='needs_input'))items.push({kind:'Revise',text:`${meeting.title} · meeting needs your input`,tab:'meetings'});
    for(const email of (state.emails||[]).filter(x=>x.status==='draft'||x.status==='failed'))items.push({kind:email.status==='failed'?'Retry':'Send',text:`Email: ${email.subject}${email.status==='failed'?' · not sent':' · draft waiting for your review'}`,tab:'emails'});
    return items;
  }
  function updateAttentionBadge(){
    try{const count=attentionItems().length,base=document.title.replace(/^\(\d+\)\s*/,'');document.title=count?`(${count}) ${base}`:base;}catch{}
  }
  function renderToday(){
    const items=attentionItems();
    const panel=card(items.length?`Needs you · ${items.length}`:'Needs you','full mc-today');
    if(!items.length){panel.append(node('p','Nothing is waiting on you. Give the team a mission, or open the Stand-up for a summary.','mc-muted'));content.append(panel);return;}
    const list=node('ul',null,'mc-today-list');
    items.slice(0,6).forEach(item=>{const row=node('li',null,'mc-today-item');row.append(node('span',item.kind,'mc-badge warn'),node('span',item.text));const go=button('Open','mc-secondary');go.onclick=()=>item.route?document.querySelector(`[data-organa-route="${item.route}"]`)?.click():openMissionControl({tab:item.tab});row.append(go);list.append(row);});
    panel.append(list);if(items.length>6)panel.append(node('p',`+${items.length-6} more in Approvals and Tasks`,'mc-muted'));content.append(panel);
  }
  const sectionHead=(title,desc,actions)=>{const pageTitle=(tabChrome[state.tab]?.[0]||'').toLowerCase();if(title.toLowerCase()===pageTitle||title==='Approval Center & Traceability'){const wrap=node('div',null,'mc-page-actions');if(actions)wrap.append(actions);return wrap;}const wrap=node('div',null,'mc-section-head'),left=node('div');left.append(node('h2',title),node('p',desc));wrap.append(left);if(actions)wrap.append(actions);return wrap;};
  const card=(title,cls='')=>{const c=node('section',null,`mc-card ${cls}`.trim());if(title)c.append(node('h3',title));return c;};
  const field=(labelText,kind='input',value='')=>{const label=node('label',labelText);const input=node(kind);if(kind==='textarea')input.rows=4;input.value=value||'';label.append(input);return{label,input};};
  function errorBox(error){const box=node('div',error.message||String(error),'mc-error');box.setAttribute('role','alert');content.prepend(box);}
  async function refreshWorkView(tab,ownerAgentId=null){await loadAll();const otherEdit=tab==='team'&&state.teamSelectedAgentId!==ownerAgentId&&content.querySelector('.mc-profile-config form[data-dirty="true"]');if(dialog.open&&state.tab===tab&&!state.onboardingMode&&!otherEdit)render({preservePosition:true});}
  function workError(error,tab){if(dialog.open&&state.tab===tab&&!state.onboardingMode){setStatus(error.message);errorBox(error);}}
  function selectTeamAgent(agent,profile,chart){
    state.teamSelectedAgentId=agent.id;renderTeamProfile(profile,agent);
    chart.querySelectorAll('.mc-org-agent-node,.mc-directory-person').forEach(el=>{const selected=el.dataset.agentId===agent.id;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});
    if(matchMedia('(max-width:980px)').matches)profile.scrollIntoView({behavior:'instant',block:'start'});
  }

  function aiRuntime(){return state.llmSettings?.runtime||state.health?.ai||{};}
  function usingLiveAi(){return Boolean(aiRuntime().usingLiveAi)&&state.health?.provider!=='dry-run';}
  function aiModeCopy(action='AI-powered work'){
    const runtime=aiRuntime();
    if(usingLiveAi())return null;
    const hasLive=Boolean(runtime.liveProviderConfigured);
    return{
      title:hasLive?'Deterministic mode is selected':'Live AI is not connected',
      body:hasLive
        ? 'Demo output is selected. Switch to the live provider in Settings when ready.'
        : 'Demo output is active. Connect Gemini in Settings for live AI.',
      setupRequired:!hasLive,
    };
  }
  function openAiSettings(){return openMissionControl({tab:'settings'});}
  function aiModeNotice(action){
    const copy=aiModeCopy(action);if(!copy)return null;
    const notice=node('div',null,'mc-ai-setup-notice');const icon=node('span',copy.setupRequired?'!':'D','mc-ai-setup-icon'),body=node('div',null,'mc-ai-setup-copy');body.append(node('strong',copy.title),node('span',copy.body));const configure=button(copy.setupRequired?'Configure Gemini':'Open AI Settings','mc-secondary');configure.onclick=openAiSettings;notice.append(icon,body,configure);return notice;
  }
  function mountAiModeNotice(action){const notice=aiModeNotice(action);if(!notice)return;const first=content.firstElementChild;if(first)first.after(notice);else content.prepend(notice);}
  function signalAiAction(action){const copy=aiModeCopy(action);if(!copy){setStatus(`${action}… The AI team is working, usually 20–60 seconds. You can keep this window open.`);return true;}setStatus(`${copy.title}. ${copy.body}`);return true;}

  function clearOnboardingRoute(){
    const url=new URL(location.href);
    url.searchParams.delete('onboarding');
    url.searchParams.delete('goal');
    history.replaceState({},'',url.pathname+url.search+url.hash);
  }

  function setOnboardingChrome(enabled){
    document.body.classList.toggle('organa-onboarding-mode',enabled);
    dialog.classList.toggle('mc-onboarding-dialog',enabled);
    const close=$('closeMission');if(close)close.textContent=enabled?'Save & exit':'Close';
    const heading=$('missionHeading');
    const description=document.querySelector('.mc-header p');
    if(heading)heading.textContent=enabled?'Organization setup':'Organization Control';
    if(description)description.textContent=enabled?'A clear goal. The right people. Your approval.':'Set the North Star, coordinate missions, build your AI team, and keep human authority over consequential decisions.';
    if(enabled){
      document.querySelectorAll('[data-organa-route]').forEach(button=>button.classList.remove('active'));
      document.body.classList.remove('organa-loading');
      const splash=$('organaBootSplash');
      if(splash)splash.hidden=true;
    }else{
      document.dispatchEvent(new CustomEvent('organa:onboarding-exit'));
    }
  }

  function ensureDialog(){
    if(!dialog.open)dialog.show();
    document.body.classList.toggle('organa-workspace-open',!state.onboardingMode);
  }

  const onboardingController = new window.OrganaOnboarding({
    content, api, workspaceState:state, goal:onboardingGoal,
    isOpen:()=>state.onboardingMode,
    setStatus, clearRoute:clearOnboardingRoute,
    onDesign:()=>signalAiAction('Building this organization'),
    onSettings:openAiSettings,
    onExit:tab=>{
      if(tab==='mission'&&onboardingController.state.completion)state.missionDraftGoal=onboardingController.state.completion.goals?.[0]?.description||'';
      if(!onboardingController.state.completion)onboardingController.save();
      state.onboardingMode=false;
      clearOnboardingRoute();
      setOnboardingChrome(false);
      openMissionControl({tab:tab||'company'});
    },
  });
  const loadOnboarding=()=>onboardingController.load();
  const renderOnboarding=()=>onboardingController.render();


  // First-run guide: shows the next few steps until the owner finishes or dismisses them.
  function renderGettingStarted(){
    let dismissed=false;try{dismissed=localStorage.getItem('organaGuideDismissed')==='1';}catch{}
    const steps=[
      ['Connect AI',usingLiveAi(),'Open Settings','settings','Gemini answers are live when this is done.'],
      ['Build your team',state.agents.filter(agent=>agent.status==='active').length>1,'Build My Team','onboarding','Pick a template or describe your goal.'],
      ['Give the team a mission',state.projects.length>0,'Create Mission','mission','Describe the outcome you want; the Chief of Staff plans it.'],
      ['Review the first result',state.tasks.some(task=>task.status==='done')||state.deliverables.length>0,'Open Approvals','review','Approve or ask for changes. Nothing important happens without you.'],
      ['Read the Stand-up',Boolean(state.standup),'Open Stand-up','standup','A short summary of what the team did.'],
    ];
    const finished=steps.filter(step=>step[1]).length;
    if(dismissed||finished===steps.length)return;
    const guide=card(`Getting started · ${finished}/${steps.length} done`,'full');
    const list=node('ol',null,'mc-guide');
    const next=steps.find(step=>!step[1]);
    steps.forEach(step=>{const item=node('li',null,'mc-guide-step'+(step[1]?' done':''));item.append(node('strong',(step[1]?'✓ ':'')+step[0]),node('span',step[4],'mc-muted'));if(step===next){const go=button(step[2],'mc-primary');go.onclick=()=>step[3]==='onboarding'?openMissionControl({onboarding:true}):openMissionControl({tab:step[3]});item.append(go);}list.append(item);});
    const hide=button('Hide this guide','mc-secondary');hide.onclick=()=>{try{localStorage.setItem('organaGuideDismissed','1');}catch{}renderCompany();};
    guide.append(list,hide);content.append(guide);
  }

  function renderCompany(){
    content.replaceChildren();
    const company=state.company?.company||{},ns=state.company?.northStar||{};
    const activeMissions=state.projects.filter(project=>!['completed','cancelled'].includes(project.status)).length;
    const completedTasks=state.tasks.filter(task=>task.status==='done').length;
    const hero=node('section',null,'mc-hero');
    hero.append(node('span','YOUR ORGANIZATION','mc-hero-kicker'),node('h2',company.name||'Build your AI organization'),node('p',ns.mission||"Set a North Star so every AI coworker can connect daily work to the organization's actual goal."));
    const stats=node('div',null,'mc-hero-stats');
    [[activeMissions,'active missions','mission'],[completedTasks,'tasks completed','performance'],[state.approvals.length,'decisions need you','review'],[state.agents.filter(agent=>agent.status==='active').length,'active AI coworkers','team']].forEach(([value,label,tab])=>{const stat=button(null,'mc-hero-stat mc-hero-stat-link');stat.append(node('strong',value),node('span',label));stat.onclick=()=>openMissionControl({tab});stats.append(stat);});
    hero.append(stats);
    const heroActions=node('div',null,'mc-actions'),missionAction=button('Create Mission','mc-primary'),chiefAction=button('View your team','mc-secondary');
    missionAction.onclick=()=>openMissionControl({tab:'mission'});chiefAction.onclick=()=>openMissionControl({tab:'team'});heroActions.append(missionAction,chiefAction);hero.append(heroActions);content.append(hero);
    renderToday();
    renderGettingStarted();
    const actions=node('div',null,'mc-actions'),reset=button('Open the demo workspace (keeps your data)','mc-secondary');actions.append(reset);
    content.append(sectionHead('Company North Star','The direction and context guiding your team.'));
    const grid=node('div',null,'mc-grid');
    const overview=card(company.name||'No active company');overview.append(node('span',`${state.llmSettings?.providers?.find(p=>p.id===state.health?.provider)?.label||state.health?.provider||'AI'}${state.health?.model?` · ${state.health.model}`:''}`,'mc-badge active'),node('p',company.description||'Tell Organa what you want to build below.'),node('p',`${company.industry||'General'} · ${company.stage||'stage not set'}`,'mc-muted'));grid.append(overview);
    const north=card(`North Star${ns.version?` · v${ns.version}`:''}`);north.append(node('h4','Mission'),node('p',ns.mission||'Not set'),node('h4','Vision'),node('p',ns.vision||'Not set'));if(ns.constraints?.length){north.append(node('h4','Constraints'));const list=node('div',null,'mc-constraints');list.textContent=ns.constraints.map(c=>`${c.severity==='hard'?'HARD':'SOFT'} · ${c.text}`).join('\n');north.append(list);}const editNorth=button('Edit as new version','mc-secondary');north.append(editNorth);grid.append(north);
    const attention=card(`Needs your approval · ${state.approvals.length}`);if(state.approvals.length){state.approvals.slice(0,3).forEach(item=>attention.append(node('p',`• ${item.title}`)));const review=button('Open Approval Center','mc-secondary');review.onclick=()=>{state.tab='review';render();};attention.append(review);}else attention.append(node('p','No consequential decision is waiting on you.','mc-muted'));grid.append(attention);
    const recent=card(`Recent deliverables · ${state.deliverables.length}`);if(state.deliverables.length){state.deliverables.slice(0,3).forEach(item=>recent.append(node('p',`• ${item.title}`)));const open=button('Browse knowledge','mc-secondary');open.onclick=()=>openMissionControl({tab:'knowledge'});recent.append(open);}else recent.append(node('p','Deliverables will appear here as missions complete.','mc-muted'));grid.append(recent);content.append(grid);

    const builder=card('Organization setup','full');
    builder.append(node('p','Start from your own goal or a focused team template. Review the North Star, people, and constraints in one guided setup.','mc-muted'));
    const setup=button(onboardingController.hasDraft()?'Continue organization setup':'Build My Team','mc-primary');
    setup.onclick=()=>openMissionControl({onboarding:true});
    const setupActions=node('div',null,'mc-actions');setupActions.append(setup,reset);builder.append(setupActions);content.append(builder);
    if(state.northStarVersions.length>1){const history=card('North Star history','full');for(const version of state.northStarVersions.slice(0,8)){const row=node('div',null,'mc-event');row.append(node('span',`v${version.version} · ${version.status}`),node('span',version.changeNote||version.mission||''));history.append(row);}content.append(history);}

    editNorth.onclick=()=>renderNorthStarEditor(ns);
    reset.onclick=async()=>{setStatus('Preparing the demo workspace…');try{await api('POST','/api/workspaces/demo',{});setStatus('Demo workspace ready. Reloading the 3D office roster…');setTimeout(()=>location.reload(),300);}catch(err){errorBox(err);}};
  }

  function renderNorthStarEditor(ns){
    const original={mission:ns?.mission||'',vision:ns?.vision||'',principles:(ns?.principles||[]).join('\n'),constraints:(ns?.constraints||[]).map(x=>`${x.severity==='soft'?'SOFT: ':''}${x.text}`).join('\n'),note:'Updated by human owner'},saved=readDraft('north-star',original);
    content.replaceChildren();content.dataset.northStarReview='editor';content.append(sectionHead('Edit North Star','Changes are saved as a new draft version. The currently active version stays authoritative until you explicitly activate the draft.'));
    const c=card(`Create version ${(state.northStarVersions[0]?.version||0)+1}`,'full'),form=node('form',null,'mc-form'),mission=field('Mission','textarea',ns?.mission),vision=field('Vision','textarea',ns?.vision),principles=field('Principles, one per line','textarea',(ns?.principles||[]).join('\n')),constraints=field('Constraints, one per line. Prefix soft preferences with SOFT:','textarea',(ns?.constraints||[]).map(x=>`${x.severity==='soft'?'SOFT: ':''}${x.text}`).join('\n')),note=field('Change note','input','Updated by human owner');const save=button('Save draft version','mc-primary');save.type='submit';form.append(mission.label,vision.label,principles.label,constraints.label,note.label,save);c.append(form);content.append(c);
    const inputs={mission:mission.input,vision:vision.input,principles:principles.input,constraints:constraints.input,note:note.input};Object.entries(inputs).forEach(([key,input])=>{input.value=saved[key]??original[key];input.addEventListener('input',()=>writeDraft('north-star',Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]))));});const back=button(state.tab==='goals'?'Back to goals':'Back to overview','mc-secondary');back.onclick=()=>render();c.prepend(back);
    const ownerTab=state.tab,ownerNavigation=navigationVersion;
    mission.input.required=true;mission.input.maxLength=vision.input.maxLength=1000;note.input.maxLength=500;
    const isCurrent=()=>dialog.open&&state.tab===ownerTab&&navigationVersion===ownerNavigation&&!state.onboardingMode;
    form.onsubmit=async e=>{
      e.preventDefault();if(save.disabled||workflowState.northStarBusy)return;
      if(!mission.input.value.trim()){mission.input.setCustomValidity('Describe the organization mission.');mission.input.reportValidity();mission.input.oninput=()=>mission.input.setCustomValidity('');return;}
      const parsed=constraints.input.value.split('\n').map(x=>x.trim()).filter(Boolean).map((text,i)=>({id:`manual_${Date.now()}_${i}`,type:'policy',severity:/^SOFT:/i.test(text)?'soft':'hard',text:text.replace(/^SOFT:\s*/i,'')}));
      const submitted=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]));workflowState.northStarBusy=true;save.disabled=true;form.inert=true;setStatus('Saving a new North Star draft…');content.querySelectorAll('.mc-error').forEach(el=>el.remove());
      try{
        const draft=await api('POST','/api/north-star/versions',{mission:mission.input.value.trim(),vision:vision.input.value.trim(),principles:principles.input.value.split('\n').map(x=>x.trim()).filter(Boolean),constraints:parsed,changeNote:note.input.value.trim(),clientRequestId:requestId('north-star',submitted)});clearDraft('north-star',submitted);
        if(!isCurrent())return;
        content.replaceChildren();content.dataset.northStarReview='true';content.append(sectionHead(`North Star v${draft.version} saved as draft`,'Review this direction before activating it. The current North Star remains authoritative.'));
        const d=card('Draft','full');d.append(node('h4','Mission'),node('p',draft.mission),node('h4','Vision'),node('p',draft.vision||'Not set'),node('h4','Principles'),node('p',draft.principles.join(' · ')||'Not set'),node('h4','Constraints'),node('p',draft.constraints.map(x=>`${x.severity.toUpperCase()} · ${x.text}`).join('\n')||'Not set','mc-constraints'));
        const activate=button(`Activate v${draft.version}`,'mc-primary'),cancel=button('Keep current active version','mc-secondary'),acts=node('div',null,'mc-actions');acts.append(activate,cancel);d.append(acts);content.append(d);
        activate.onclick=async()=>{
          if(activate.disabled)return;activate.disabled=cancel.disabled=true;setStatus('Activating the reviewed North Star version…');content.querySelectorAll('.mc-error').forEach(el=>el.remove());
          try{await api('POST',`/api/north-star/versions/${draft.version}/activate`,{});await refreshWorkView(ownerTab);if(isCurrent())setStatus(`North Star v${draft.version} is active. New runs will record this version.`);}
          catch(error){if(isCurrent())workError(error,ownerTab);}
          finally{activate.disabled=cancel.disabled=false;}
        };
        cancel.onclick=()=>refresh(ownerTab);
      }catch(error){if(isCurrent())workError(error,ownerTab);}
      finally{workflowState.northStarBusy=false;save.disabled=false;form.inert=false;}
    };
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
    panel.scrollTop=0;
    if(!agent){
      const empty=node('div',null,'mc-team-profile-empty');empty.append(node('span','AI','mc-profile-empty-orbit'),node('strong','Select an AI coworker'),node('p','Open a person in the organization chart to see their work, reporting line, collaborators, performance, and configuration.'));panel.append(empty);return;
    }
    state.teamSelectedAgentId=agent.id;panel.dataset.agentId=agent.id;panel.setAttribute('aria-label',agent.displayName+' profile');
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

    const config=node('details',null,'mc-profile-config');config.append(node('summary','Configuration'));const form=node('form',null,'mc-form'),name=field('Display name','input',agent.displayName),role=field('Role','input',agent.role),division=field('Division','input',agent.division),purpose=field('Purpose','textarea',agent.purpose),responsibilities=field('Responsibilities, one per line','textarea',(agent.responsibilities||[]).join('\n')),skillsInput=field('Skills, one per line','textarea',(agent.skills||[]).map(x=>x.name||x).join('\n')),managerLabel=node('label','Reports to'),managerSelect=node('select');managerSelect.setAttribute('aria-label','Reports to');
    const founderOpt=node('option','Human Founder');founderOpt.value='';managerSelect.append(founderOpt);for(const candidate of state.agents.filter(a=>a.id!==agent.id&&['active','paused'].includes(a.status)&&!teamDescendant(a,agent.id))){const opt=node('option',`${candidate.displayName} · ${candidate.role}`);opt.value=candidate.id;managerSelect.append(opt);}managerSelect.value=agent.managerAgentId||'';if(/chief of staff/i.test(agent.role||'')){managerSelect.value='';managerSelect.disabled=true;}managerLabel.append(managerSelect);name.input.required=role.input.required=division.input.required=true;name.input.maxLength=role.input.maxLength=division.input.maxLength=120;role.input.readOnly=isChiefOfStaff(agent);const syncManagerControl=()=>{const chiefRole=/chief of staff/i.test(role.input.value||'');managerSelect.disabled=chiefRole;if(chiefRole)managerSelect.value='';};role.input.addEventListener('input',syncManagerControl);syncManagerControl();
    const prompt=field('System prompt','textarea',agent.systemPrompt),personality=field('Personality','textarea',agent.personality),providerLabelEl=node('label','AI provider'),providerSelect=node('select');providerSelect.setAttribute('aria-label','AI provider');const inherit=node('option','Inherit workspace provider');inherit.value='inherit';providerSelect.append(inherit);for(const p of (state.llmSettings?.providers||[]).filter(x=>x.configured&&x.id!=='dry-run')){const opt=node('option',p.label);opt.value=p.id;providerSelect.append(opt);}providerSelect.value=agent.modelPolicy?.provider||'inherit';providerLabelEl.append(providerSelect);const model=field('Model override (blank = provider default)','input',agent.modelPolicy?.defaultModel||'');model.input.placeholder='e.g. gemini-2.5-flash';const save=button('Save employee settings','mc-primary');save.type='submit';form.append(name.label,role.label,division.label,managerLabel,purpose.label,responsibilities.label,skillsInput.label,prompt.label,personality.label,providerLabelEl,model.label,save);config.append(form);panel.append(config);
    const configInputs=[name.input,role.input,division.input,managerSelect,purpose.input,responsibilities.input,skillsInput.input,prompt.input,personality.input,providerSelect,model.input],configKind='employee:'+agent.id,configDraft=readDraft(configKind,null);if(configDraft){configInputs.forEach((input,index)=>{if(configDraft[index]!==undefined)input.value=configDraft[index];});form.dataset.dirty='true';config.open=true;}configInputs.forEach(input=>input.addEventListener('input',()=>writeDraft(configKind,configInputs.map(input=>input.value))));configInputs.forEach(input=>input.addEventListener('change',()=>writeDraft(configKind,configInputs.map(input=>input.value))));
    form.onsubmit=async event=>{
      const submittedConfig=configInputs.map(input=>input.value);event.preventDefault();if(workflowState.employeeBusy.has(agent.id))return;workflowState.employeeBusy.add(agent.id);form.inert=true;form.setAttribute('aria-busy','true');save.disabled=true;setStatus(`Saving ${agent.displayName}…`);
      try{
        await api('PATCH',`/api/agents/${agent.id}`,{displayName:name.input.value.trim(),role:role.input.value.trim(),division:division.input.value.trim(),managerAgentId:isChiefOfStaff(agent)?null:(managerSelect.value||null),purpose:purpose.input.value.trim(),responsibilities:responsibilities.input.value.split('\n').map(x=>x.trim()).filter(Boolean),skills:skillsInput.input.value.split('\n').map(x=>x.trim()).filter(Boolean).map(name=>({name,level:'advanced'})),systemPrompt:prompt.input.value,personality:personality.input.value,modelPolicy:{...(agent.modelPolicy||{}),provider:providerSelect.value,defaultModel:model.input.value.trim()||null}});
        clearDraft(configKind,submittedConfig);await refreshWorkView('team',agent.id);if(state.tab==='team')setStatus('Employee profile and reporting line saved.');
      }catch(error){workError(error,'team');}finally{workflowState.employeeBusy.delete(agent.id);form.inert=false;form.removeAttribute('aria-busy');save.disabled=false;const live=content.querySelector('.mc-team-profile');if(live?.dataset.agentId===agent.id){live.querySelectorAll('button').forEach(item=>item.disabled=false);}}
    };

    const actions=node('div',null,'mc-profile-actions');if(agent.status==='draft'){const hire=button('Hire AI Employee','mc-primary');hire.onclick=()=>agentStatus(agent.id,'activate');actions.append(hire);}else if(agent.status==='active'&&!isChiefOfStaff(agent)){const pause=button('Pause','mc-secondary');pause.onclick=()=>agentStatus(agent.id,'pause');actions.append(pause);}else if(agent.status==='paused'||agent.status==='archived'){const activate=button(agent.status==='archived'?'Restore & Activate':'Activate','mc-primary');activate.onclick=()=>agentStatus(agent.id,'activate');actions.append(activate);}if(agent.status!=='archived'&&!(agent.status==='active'&&isChiefOfStaff(agent))){const archive=button('Archive','mc-danger');archive.onclick=()=>{if(confirm(`Archive ${agent.displayName}? Their historical work remains available.`))agentStatus(agent.id,'archive');};actions.append(archive);}if(agent.status==='active'&&isChiefOfStaff(agent))actions.append(node('p','Required team coordinator. Keep this role active.','mc-muted'));actions.querySelectorAll('button').forEach(item=>item.disabled=workflowState.employeeBusy.has(agent.id));panel.append(actions);
  }

  function mountTeamDirectory(chart,profile,agents){
    const toolbar=chart.firstElementChild,tree=node('div',null,'mc-team-tree');while(toolbar.nextSibling)tree.append(toolbar.nextSibling);
    const switches=node('div',null,'mc-team-view-switch');switches.setAttribute('role','group');switches.setAttribute('aria-label','Team view');
    const structure=button('Structure'),people=button('People'),directory=node('div',null,'mc-team-directory'),label=node('label','Search team'),search=node('input');search.type='search';search.placeholder='Name, role, division, or skill';search.value=state.teamSearch||'';search.setAttribute('aria-label','Search team');search.className='mc-search-input';label.append(search);
    const count=node('span','','mc-collection-count');count.setAttribute('role','status');const grid=node('div',null,'mc-team-directory-grid'),empty=ui.emptyState('No coworkers match','Try a name, role, division, or skill.');
    agents.forEach(agent=>{const choice=button(null,'mc-directory-person');choice.dataset.agentId=agent.id;const avatar=node('span',initials(agent.displayName),'mc-avatar'),identity=node('div');avatar.dataset.status=teamAgentWorkState(agent);identity.append(node('strong',agent.displayName),node('small',agent.role),node('small',agent.division||'General'));choice.append(avatar,identity,badge(teamAgentWorkState(agent)));choice.onclick=()=>selectTeamAgent(agent,profile,chart);grid.append(choice);});
    const apply=()=>{state.teamSearch=search.value;const query=search.value.toLowerCase().trim();let visible=0;grid.querySelectorAll('[data-agent-id]').forEach(element=>{const agent=agents.find(item=>item.id===element.dataset.agentId);element.hidden=Boolean(query&&!JSON.stringify(agent).toLowerCase().includes(query));if(!element.hidden)visible++;});count.textContent=`${visible} of ${agents.length} coworkers`;empty.hidden=visible>0;};search.oninput=apply;apply();directory.append(label,count,grid,empty);
    const setView=view=>{state.teamView=view;tree.hidden=view!=='structure';directory.hidden=view!=='people';toolbar.querySelector('.mc-actions').hidden=view!=='structure';structure.setAttribute('aria-pressed',String(view==='structure'));people.setAttribute('aria-pressed',String(view==='people'));};structure.onclick=()=>setView('structure');people.onclick=()=>setView('people');switches.append(structure,people);chart.append(switches,tree,directory);setView(state.teamView||'structure');
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
      const chiefNode=button(null,'mc-org-agent-node mc-chief-node');chiefNode.dataset.agentId=chief.id;const chiefAvatar=node('span',initials(chief.displayName),'mc-avatar');chiefAvatar.dataset.status=teamAgentWorkState(chief);const chiefCopy=node('div',null,'mc-org-agent-copy');chiefCopy.append(node('span','Chief of Staff','mc-org-eyebrow'),node('strong',chief.displayName),node('small',chief.role));chiefNode.append(chiefAvatar,chiefCopy,badge(teamAgentWorkState(chief)));chiefNode.onclick=()=>selectTeamAgent(chief,profile,chart);chart.append(chiefNode);
      if(departments.length){chart.append(node('div',null,'mc-org-trunk'));const divisions=node('div',null,'mc-division-grid');
        const renderAgentBranch=(agent,divisionAgents,seen=new Set())=>{if(seen.has(agent.id))return null;seen.add(agent.id);const branch=node('div',null,'mc-report-branch'),agentNode=button(null,'mc-org-agent-node');agentNode.dataset.agentId=agent.id;const av=node('span',initials(agent.displayName),'mc-avatar');av.dataset.status=teamAgentWorkState(agent);const copy=node('div',null,'mc-org-agent-copy');copy.append(node('strong',agent.displayName),node('small',agent.role),node('em',`Reports to ${teamManagerName(agent)}`));agentNode.append(av,copy,badge(teamAgentWorkState(agent)));agentNode.onclick=()=>selectTeamAgent(agent,profile,chart);if(state.teamSelectedAgentId===agent.id)agentNode.classList.add('selected');branch.append(agentNode);const children=divisionAgents.filter(a=>a.managerAgentId===agent.id);if(children.length){const childWrap=node('div',null,'mc-report-children');children.forEach(child=>{const childBranch=renderAgentBranch(child,divisionAgents,new Set(seen));if(childBranch)childWrap.append(childBranch);});branch.append(childWrap);}return branch;};
        for(const division of departments){const members=currentAgents.filter(a=>a.id!==chief.id&&(a.division||'General')===division),divisionCard=node('section',null,'mc-division-card'),head=button(null,'mc-division-head'),headCopy=node('span');headCopy.append(node('strong',division),node('small',`${members.length} ${members.length===1?'AI employee':'AI employees'}`));const chevron=node('span','⌄','mc-division-chevron');head.append(headCopy,chevron);divisionCard.append(head);const body=node('div',null,'mc-division-body'),roots=members.filter(a=>!members.some(candidate=>candidate.id===a.managerAgentId));roots.forEach(root=>{const branch=renderAgentBranch(root,members);if(branch)body.append(branch);});if(!roots.length&&members.length){members.forEach(member=>{const branch=renderAgentBranch(member,members);if(branch)body.append(branch);});}divisionCard.append(body);const collapsed=state.teamCollapsedDivisions.has(division);divisionCard.classList.toggle('collapsed',collapsed);body.hidden=collapsed;head.setAttribute('aria-expanded',String(!collapsed));head.onclick=()=>{const next=!body.hidden;body.hidden=next;divisionCard.classList.toggle('collapsed',next);head.setAttribute('aria-expanded',String(!next));if(next)state.teamCollapsedDivisions.add(division);else state.teamCollapsedDivisions.delete(division);};divisions.append(divisionCard);}chart.append(divisions);
        expand.onclick=()=>{state.teamCollapsedDivisions.clear();chart.querySelectorAll('.mc-division-card').forEach(card=>{card.classList.remove('collapsed');const body=card.querySelector('.mc-division-body'),head=card.querySelector('.mc-division-head');if(body)body.hidden=false;if(head)head.setAttribute('aria-expanded','true');});};collapse.onclick=()=>{departments.forEach(d=>state.teamCollapsedDivisions.add(d));chart.querySelectorAll('.mc-division-card').forEach(card=>{card.classList.add('collapsed');const body=card.querySelector('.mc-division-body'),head=card.querySelector('.mc-division-head');if(body)body.hidden=true;if(head)head.setAttribute('aria-expanded','false');});};
      }
      mountTeamDirectory(chart,profile,currentAgents);workspace.append(chart,profile);content.append(workspace);if(!state.teamSelectedAgentId||!state.agents.some(a=>a.id===state.teamSelectedAgentId))state.teamSelectedAgentId=chief.id;renderTeamProfile(profile,teamAgentById(state.teamSelectedAgentId)||chief);chart.querySelectorAll('.mc-org-agent-node,.mc-directory-person').forEach(n=>{const selected=n.dataset.agentId===state.teamSelectedAgentId;n.classList.toggle('selected',selected);n.setAttribute('aria-pressed',String(selected));});
    }
    const hireCard=card('Hire an AI Employee','full');hireCard.id='mcHireEmployee';
    const hireCopy=node('p','Describe the capability you need. Review the draft role and reporting line before hiring.','mc-muted'),form=node('form',null,'mc-form'),request=field('Hiring request','textarea',workflowState.hiringText),design=button(workflowState.hiringBusy?'Designing employee…':'Design Employee','mc-primary');
    request.input.required=true;request.input.maxLength=4000;request.input.placeholder='Example: Hire a researcher who tests launch assumptions with evidence.';request.input.disabled=workflowState.hiringBusy;design.type='submit';design.disabled=workflowState.hiringBusy||!request.input.value.trim();
    request.input.oninput=()=>{workflowState.hiringText=request.input.value;design.disabled=workflowState.hiringBusy||!request.input.value.trim();};form.append(request.label,design);hireCard.append(hireCopy,form);content.append(hireCard);
    form.onsubmit=async event=>{
      event.preventDefault();const brief=request.input.value.trim();if(!brief||workflowState.hiringBusy)return;
      if(workflowState.hiringSignature!==brief){workflowState.hiringSignature=brief;workflowState.hiringRequestId=crypto.randomUUID();}
      workflowState.hiringBusy=true;request.input.disabled=true;design.disabled=true;design.textContent='Designing employee…';signalAiAction('Designing this AI employee');
      try{const draft=await api('POST','/api/agents/design',{request:brief,clientRequestId:workflowState.hiringRequestId});if(state.tab==='team'&&!content.querySelector('.mc-profile-config form[data-dirty="true"]'))state.teamSelectedAgentId=draft.id;workflowState.hiringText='';workflowState.hiringSignature='';workflowState.hiringRequestId='';await refreshWorkView('team',draft.id);if(state.tab==='team'){setStatus(`${draft.displayName} is a draft. Review the profile before hiring.`);const profile=content.querySelector('.mc-team-profile');profile?.scrollIntoView({block:'start'});}}
      catch(error){workError(error,'team');}finally{workflowState.hiringBusy=false;const live=content.querySelector('#mcHireEmployee button[type=submit]');if(live){const input=content.querySelector('#mcHireEmployee textarea');if(input)input.disabled=false;live.disabled=!input?.value.trim();live.textContent='Design Employee';}}
    };
    if(archivedAgents.length){const archived=card(`Archived AI Employees · ${archivedAgents.length}`,'full mc-team-archived');archived.append(node('p','Archived coworkers stay outside the active reporting structure, while their historical work and traceability remain available.','mc-muted'));const rows=node('div',null,'mc-team-archive-list');archivedAgents.forEach(agent=>{const row=node('div',null,'mc-team-archive-row'),identity=node('div',null,'mc-agent'),av=node('span',initials(agent.displayName),'mc-avatar'),copy=node('div');copy.append(node('strong',agent.displayName),node('span',`${agent.role} · ${agent.division||'General'}`));identity.append(av,copy);const restore=button('Restore','mc-secondary');restore.onclick=()=>{state.teamSelectedAgentId=agent.id;agentStatus(agent.id,'activate');};const review=button('Review profile','mc-secondary');review.onclick=()=>{state.teamSelectedAgentId=agent.id;const profile=content.querySelector('.mc-team-profile'),chart=content.querySelector('.mc-team-org-chart');if(profile&&chart)selectTeamAgent(agent,profile,chart);};const actions=node('div',null,'mc-actions');actions.append(review,restore);row.append(identity,actions);rows.append(row);});archived.append(rows);content.append(archived);}
  }

  async function agentStatus(id,action){
    if(workflowState.employeeBusy.has(id))return;workflowState.employeeBusy.add(id);setStatus(`Updating employee…`);
    content.querySelector('.mc-profile-actions')?.querySelectorAll('button').forEach(item=>item.disabled=true);
    try{await api('POST',`/api/agents/${id}/${action}`,{});await refreshWorkView('team',id);if(state.tab==='team')setStatus('Employee status saved. Reload the office to update the 3D roster.');document.dispatchEvent(new CustomEvent('organa:team-changed'));}
    catch(error){workError(error,'team');}finally{workflowState.employeeBusy.delete(id);content.querySelector('.mc-profile-actions')?.querySelectorAll('button').forEach(item=>item.disabled=false);}
  }
  function teamDescendant(candidate,ancestorId){
    const seen=new Set();let cursor=candidate;
    while(cursor?.managerAgentId&&!seen.has(cursor.id)){if(cursor.managerAgentId===ancestorId)return true;seen.add(cursor.id);cursor=teamAgentById(cursor.managerAgentId);}
    return false;
  }

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
  // Real progress from task status; nothing here is estimated.
  function missionProgress(project){
    const tasks=state.tasks.filter(task=>task.projectId===project.id);
    if(!tasks.length||project.status==='draft_plan')return[];
    const count=status=>tasks.filter(task=>task.status===status).length,done=count('done'),review=count('review'),blocked=count('blocked'),failed=count('failed'),active=tasks.filter(task=>task.status==='active');
    const bar=node('div',null,'mc-progress');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(tasks.length));bar.setAttribute('aria-valuenow',String(done));bar.setAttribute('aria-label','Mission progress');
    const fill=node('span');fill.style.width=`${Math.round(done/tasks.length*100)}%`;bar.append(fill);
    const parts=[`${done} of ${tasks.length} tasks done`];
    if(review)parts.push(`${review} waiting for your review`);if(blocked)parts.push(`${blocked} need your answer`);if(failed)parts.push(`${failed} failed`);
    if(active.length){const who=state.agents.find(agent=>agent.id===active[0].assigneeAgentId)?.displayName;parts.push(`${who||'A coworker'} is working on "${active[0].title}"`);}
    return[bar,node('p',parts.join(' · '),'mc-muted mc-progress-text')];
  }
  function renderMission(){
    content.replaceChildren();
    content.append(sectionHead('Missions','Send work through your AI Chief of Staff when Organa should plan and distribute it, or assign an instruction directly to a specific AI employee when you already know who should own it.'));

    const intake=card('Start work','full mc-mission-intake');
    const modeGrid=node('div',null,'mc-intake-modes');
    const chief=button('',`mc-intake-mode ${state.missionIntakeMode==='chief'?'selected':''}`.trim());chief.dataset.intakeMode='chief';
    const chiefIcon=node('span','◎','mc-intake-mode-icon');const chiefCopy=node('span',null,'mc-intake-mode-copy');chiefCopy.append(node('strong','Ask Chief of Staff'),node('small','Give Organa a problem or outcome. Your Chief of Staff plans the work and assembles the right AI team.'));chief.append(chiefIcon,chiefCopy,node('span','Plan with your team','mc-intake-mode-tag'));
    const direct=button('',`mc-intake-mode ${state.missionIntakeMode==='direct'?'selected':''}`.trim());direct.dataset.intakeMode='direct';
    const directIcon=node('span','→','mc-intake-mode-icon');const directCopy=node('span',null,'mc-intake-mode-copy');directCopy.append(node('strong','Assign to AI Employee'),node('small','Send a focused instruction straight to a specific coworker. Organa still tracks the work, review, cost, and activity.'));direct.append(directIcon,directCopy,node('span','Choose the owner','mc-intake-mode-tag'));
    [chief,direct].forEach(option=>{option.setAttribute('aria-pressed',String(option.dataset.intakeMode===state.missionIntakeMode));option.onclick=()=>{state.missionIntakeMode=option.dataset.intakeMode;render();};});
    modeGrid.append(chief,direct);intake.append(modeGrid);

    if(state.missionIntakeMode==='chief'){
      const flow=node('div',null,'mc-intake-flow');
      const form=node('form',null,'mc-form mc-intake-form'),goal=field('What do you need the organization to solve?','textarea');
      goal.input.rows=5;goal.input.placeholder='Example: Revenue dropped this month. Find the likely causes, quantify the impact, and recommend the next actions.';
      goal.input.value=readDraft('mission',{goal:state.missionDraftGoal}).goal||(state.company?.company?.name==='Nusa Coffee'?'Prepare the Nusa Coffee launch next month. Recommend positioning, channels, budget allocation under IDR 25 million, and an execution-ready web launch package.':'');
      goal.input.addEventListener('input',()=>{state.missionDraftGoal=goal.input.value;writeDraft('mission',{goal:goal.input.value});});
      const hint=node('div',null,'mc-intake-hint');hint.append(node('strong','Chief of Staff will'),node('span','understand the request → choose owners and collaborators → coordinate tasks and dependencies → bring important outputs back for human review'));
      const planBtn=button('Plan with Chief of Staff','mc-primary');planBtn.type='submit';const research=window.OrganaWorkspaces?.researchToggle();form.append(goal.label,hint,...(research?[research.label]:[]),planBtn);flow.append(form);intake.append(flow);
      goal.input.required=true;goal.input.maxLength=5000;planBtn.disabled=workflowState.missionBusy;
      form.onsubmit=async e=>{e.preventDefault();if(!goal.input.value.trim()||workflowState.missionBusy)return;const submitted={goal:goal.input.value},payload={goal:goal.input.value.trim(),intakeMode:'chief_of_staff',...(research?.checked?{webResearch:true}:{})};workflowState.missionBusy=true;signalAiAction('Planning and routing this mission');planBtn.disabled=true;try{await api('POST','/api/projects/plan',{...payload,clientRequestId:requestId('mission',payload)});clearDraft('mission',submitted);state.missionDraftGoal='';await refreshWorkView('mission');if(state.tab==='mission')setStatus('Mission plan ready. Review the owners and dependencies before starting.');}catch(err){workError(err,'mission');}finally{workflowState.missionBusy=false;planBtn.disabled=false;}};
    }else{
      const agents=specialistMissionAgents();
      const form=node('form',null,'mc-form mc-intake-form'),instruction=field('Instruction','textarea'),taskTitle=field('Task title (optional)','input');
      instruction.input.rows=5;instruction.input.placeholder='Example: Review last month\'s campaign results and propose three experiments for next week.';
      taskTitle.input.placeholder='Organa will create a title from your instruction if left blank.';const directDraft=readDraft('direct',{title:'',brief:'',agentId:state.missionDirectAgentId});taskTitle.input.value=directDraft.title||'';instruction.input.value=directDraft.brief||'';if(directDraft.agentId)state.missionDirectAgentId=directDraft.agentId;const saveDirect=()=>writeDraft('direct',{title:taskTitle.input.value,brief:instruction.input.value,agentId:state.missionDirectAgentId});taskTitle.input.oninput=instruction.input.oninput=saveDirect;instruction.input.required=true;instruction.input.maxLength=5000;taskTitle.input.maxLength=160;
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
        for(const [division,members] of [...divisions.entries()].sort(([a],[b])=>a.localeCompare(b))){const group=node('section',null,'mc-direct-division');group.append(node('h4',division));const grid=node('div',null,'mc-direct-agent-grid');members.sort((a,b)=>a.displayName.localeCompare(b.displayName)).forEach(agent=>{const selected=state.missionDirectAgentId===agent.id,choice=button('',`mc-direct-agent ${selected?'selected':''}`.trim());choice.dataset.agentId=agent.id;const avatar=node('span',initials(agent.displayName),'mc-avatar'),copy=node('span',null,'mc-direct-agent-copy');copy.append(node('strong',agent.displayName),node('span',agent.role),node('small',agent.managerAgentId?`Reports to ${state.agents.find(a=>a.id===agent.managerAgentId)?.displayName||'manager'}`:'Direct report'));choice.append(avatar,copy,badge(agent.status));choice.onclick=()=>{state.missionDirectAgentId=agent.id;saveDirect();renderAgentChoices();};grid.append(choice);});group.append(grid);agentList.append(group);}
      };
      if(!state.missionDirectAgentId&&agents[0])state.missionDirectAgentId=agents[0].id;
      search.oninput=renderAgentChoices;renderAgentChoices();
      const governance=node('div',null,'mc-intake-hint');governance.append(node('strong','Still governed by Organa'),node('span','The instruction is logged, traceable, shown in Mission Control and Stand-up, counted in model usage, and the output returns for human review.'));
      const sendBtn=button('Send instruction','mc-primary');sendBtn.type='submit';if(!agents.length)sendBtn.disabled=true;
      const directResearch=window.OrganaWorkspaces?.researchToggle();form.append(taskTitle.label,instruction.label,chooser,governance,...(directResearch?[directResearch.label]:[]),sendBtn);intake.append(form);
      sendBtn.disabled=workflowState.directBusy||!agents.length;
      form.onsubmit=async e=>{e.preventDefault();const brief=instruction.input.value.trim(),assignee=agents.find(agent=>agent.id===state.missionDirectAgentId);if(!brief||!assignee||workflowState.directBusy)return;const submitted={title:taskTitle.input.value,brief:instruction.input.value,agentId:assignee.id},payload={title:taskTitle.input.value.trim()||missionInstructionTitle(brief),brief,assigneeAgentId:assignee.id,approvalPolicy:'review_output',intakeMode:'direct_agent',...(directResearch?.checked?{webResearch:true}:{})};workflowState.directBusy=true;signalAiAction('Executing this direct assignment');sendBtn.disabled=true;try{await api('POST','/api/tasks',{...payload,clientRequestId:requestId('direct',payload)});clearDraft('direct',submitted);instruction.input.value='';taskTitle.input.value='';await refreshWorkView('mission');if(state.tab==='mission')setStatus(`Instruction sent to ${assignee.displayName}. The output returns here for review.`);}catch(err){workError(err,'mission');}finally{workflowState.directBusy=false;sendBtn.disabled=false;}};
    }
    content.append(intake);

    const directTasks=state.tasks.filter(task=>task.intakeMode==='direct_agent'&&!task.projectId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    if(directTasks.length){const directCard=card(`Direct assignments · ${directTasks.length}`,'full mc-direct-history'),intro=node('p','Focused instructions sent straight to an AI employee. These bypass Chief of Staff routing but remain inside the same Organa governance and audit trail.','mc-muted');directCard.append(intro);const rows=node('div',null,'mc-direct-history-list');directTasks.slice(0,8).forEach(task=>{const agent=state.agents.find(a=>a.id===task.assigneeAgentId),row=node('article',null,'mc-direct-history-row'),identity=node('div',null,'mc-direct-history-main');identity.append(node('strong',task.title),node('span',`${agentLabel(agent)} · ${formatTime(task.createdAt)}`));const side=node('div',null,'mc-actions');side.append(badge(task.status));const open=button('Open task','mc-secondary');open.onclick=()=>window.officeTasks?.openTask(task.id);side.append(open);row.append(identity,side);rows.append(row);});directCard.append(rows);content.append(directCard);}

    if(!state.projects.length){if(!directTasks.length){const empty=node('div',null,'mc-empty'),inner=node('div');inner.append(node('strong','Your organization is ready for its first piece of work.'),node('span','Ask the Chief of Staff for cross-functional work, or assign a focused instruction directly to an AI employee.'));empty.append(inner);content.append(empty);}return;}
    for(const project of state.projects){const c=card(project.title,'full mc-mission-card');c.dataset.collectionId=project.id;c.dataset.projectId=project.id;const top=node('div',null,'mc-actions');top.append(badge(project.status),node('span','Chief of Staff routed','mc-route-label'));if(project.status==='draft_plan'){const activate=button(workflowState.activationBusy.has(project.id)?'Starting mission…':'Start Mission','mc-primary');activate.dataset.projectActivate=project.id;activate.disabled=workflowState.activationBusy.has(project.id);activate.onclick=async()=>{if(workflowState.activationBusy.has(project.id))return;workflowState.activationBusy.add(project.id);activate.disabled=true;signalAiAction('Starting this mission');if(usingLiveAi())setStatus('Starting the mission and assigning ready work…');try{await api('POST',`/api/projects/${project.id}/activate-plan`,{});await refreshWorkView('mission');if(state.tab==='mission')setStatus('Mission started. AI coworkers are working in dependency order.');}catch(err){workError(err,'mission');}finally{workflowState.activationBusy.delete(project.id);activate.disabled=false;const live=content.querySelector(`[data-project-activate="${CSS.escape(project.id)}"]`);if(live){live.disabled=false;live.textContent='Start Mission';}}};top.append(activate);}const openTasks=button('Open task review','mc-secondary');openTasks.onclick=()=>{dialog.close();window.officeTasks?.open();};top.append(openTasks);c.append(top,...missionProgress(project),node('p',project.objective||project.planDraft?.objectiveSummary||''));
      if(project.status==='needs_input')c.append(missionClarificationForm(project));
      const routingAgents=projectRoutingAgents(project);if(routingAgents.length){const routing=node('div',null,'mc-routing-preview'),routingHead=node('div',null,'mc-routing-preview-head');routingHead.append(node('strong','Team assembled by Chief of Staff'),node('span',project.routing?.rationale||'Owners and collaborators are selected from the task requirements, skills, and current organization.'));routing.append(routingHead);const people=node('div',null,'mc-routing-people');const coordinator=state.agents.find(agent=>agent.id===project.routing?.coordinatorAgentId)||activeMissionAgents().find(isChiefOfStaff);if(coordinator){const chip=node('span',null,'mc-routing-person coordinator');chip.append(node('b',coordinator.displayName),node('small','Chief of Staff · coordinates'));people.append(chip);}routingAgents.filter(agent=>agent.id!==coordinator?.id).forEach(agent=>{const chip=node('span',null,'mc-routing-person');chip.append(node('b',agent.displayName),node('small',agent.role));people.append(chip);});routing.append(people);c.append(routing);}
      const projectTasks=state.tasks.filter(t=>t.projectId===project.id);if(project.status==='draft_plan'){const dag=node('div',null,'mc-dag');(project.planDraft?.tasks||[]).forEach((t,i)=>{const owner=state.agents.find(a=>a.id===t.preferredAgentIds?.[0]),collaborators=(t.collaborationSuggestedWith||[]).map(id=>state.agents.find(a=>a.id===id)).filter(Boolean),r=node('div',null,'mc-task-node');r.append(node('span',i+1,'mc-node-number'));const mid=node('div');mid.append(node('h4',t.title),node('p',t.description||''),node('p',`${owner?`Owner: ${agentLabel(owner)}`:'Owner will be resolved'}${collaborators.length?` · Collaborators: ${collaborators.map(a=>a.displayName).join(', ')}`:''}`,'mc-owner-line'),node('p',t.dependsOn?.length?`Depends on: ${t.dependsOn.join(', ')}`:'Starts immediately','mc-deps'));if(t.reason)mid.append(node('p',`Why this route: ${t.reason}`,'mc-routing-reason'));r.append(mid,badge(t.approvalPolicy==='none'?'planned':'review'));dag.append(r);});c.append(dag);}else if(projectTasks.length){const done=projectTasks.filter(t=>t.status==='done').length,progress=node('div',null,'mc-progress');progress.append(node('span'));progress.firstChild.style.width=`${Math.round(done/projectTasks.length*100)}%`;c.append(node('p',`${done}/${projectTasks.length} tasks completed`,'mc-muted'),progress);const dag=node('div',null,'mc-dag');projectTasks.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).forEach((t,i)=>{const agent=state.agents.find(a=>a.id===t.assigneeAgentId),r=node('div',null,'mc-task-node');r.append(node('span',i+1,'mc-node-number'));const mid=node('div');mid.append(node('h4',t.title),node('p',`${agent?.displayName||'Agent'} · ${agent?.role||''}`),node('p',t.dependencyIds?.length?`Dependencies: ${t.dependencyIds.map(d=>projectTasks.find(x=>x.id===d)?.title||d).join(' → ')}`:'No dependencies','mc-deps'));r.append(mid,badge(t.status));dag.append(r);});c.append(dag);}content.append(c);}
  }

  function missionClarificationForm(project){
    const kind='mission-answer:'+project.id,saved=readDraft(kind,{answer:''}),form=node('form',null,'mc-form mc-mission-clarification');
    form.append(node('h4','Your input is needed'),node('p','Answer these questions so the Chief of Staff can finish the plan.','mc-muted'));
    const questions=node('ul');(project.planDraft?.clarifyingQuestions||[]).forEach(question=>questions.append(node('li',question)));form.append(questions);
    const fieldAnswer=field('Your answer','textarea',saved.answer),submit=button(workflowState.clarificationBusy.has(project.id)?'Preparing the updated plan…':'Update mission plan','mc-primary');
    fieldAnswer.input.required=true;fieldAnswer.input.maxLength=3000;fieldAnswer.input.oninput=()=>{form.dataset.dirty='true';writeDraft(kind,{answer:fieldAnswer.input.value});};submit.type='submit';submit.dataset.projectAnswer=project.id;submit.disabled=workflowState.clarificationBusy.has(project.id);form.append(fieldAnswer.label,submit);
    form.onsubmit=async event=>{event.preventDefault();if(workflowState.clarificationBusy.has(project.id)||!fieldAnswer.input.value.trim())return;const submitted={answer:fieldAnswer.input.value},payload={answer:submitted.answer.trim(),expectedPlanVersion:project.planVersion||1};workflowState.clarificationBusy.add(project.id);submit.disabled=true;signalAiAction('Updating this mission plan');try{await api('POST',`/api/projects/${project.id}/answer`,{...payload,clientRequestId:requestId(kind,payload)});clearDraft(kind,submitted);await refreshWorkView('mission');if(state.tab==='mission')setStatus('Mission plan updated. Review it before starting.');}catch(error){workError(error,'mission');}finally{workflowState.clarificationBusy.delete(project.id);submit.disabled=false;const live=content.querySelector(`[data-project-answer="${CSS.escape(project.id)}"]`);if(live){live.disabled=false;live.textContent='Update mission plan';}}};
    return form;
  }

  function renderMeetings(){
    content.replaceChildren();
    const refreshButton=button('Refresh meetings','mc-secondary');
    refreshButton.onclick=()=>refreshWorkView('meetings').catch(error=>workError(error,'meetings'));
    content.append(sectionHead('Meeting Room','Review each perspective, resolve the trade-offs, and approve the decision before the team proceeds.',refreshButton));
    if(!state.meetings.length){
      const empty=node('div',null,'mc-empty');
      empty.append(node('strong','No meetings yet.'),node('p','Start a mission to bring the right specialists together around a shared outcome.'));
      const mission=button('Create a mission','mc-primary');mission.onclick=()=>openMissionControl({tab:'mission'});empty.append(mission);content.append(empty);return;
    }
    for(const meeting of state.meetings){
      const c=card(meeting.title,'full mc-meeting-card');c.dataset.meetingId=meeting.id;c.dataset.collectionId=meeting.id;
      const agents=(meeting.participantAgentIds||[]).map(id=>state.agents.find(agent=>agent.id===id)).filter(Boolean);
      const running=['in_progress','synthesizing'].includes(meeting.status)||workflowState.meetingBusy.has(meeting.id);
      const meta=node('div',null,'mc-meeting-meta');meta.append(badge(meeting.status),node('span',`${agents.length} specialists · ${state.agents.find(agent=>agent.id===meeting.moderatorAgentId)?.displayName||'Coordinator'} moderates`,'mc-muted'));c.append(meta,node('p',meeting.agenda,'mc-meeting-agenda'));
      const people=node('div',null,'mc-meeting-people');
      agents.forEach(agent=>{const person=node('span',initials(agent.displayName));person.title=`${agent.displayName} · ${agent.role}`;person.setAttribute('aria-label',person.title);person.dataset.status=running?'collaborating':'idle';people.append(person);});c.append(people);
      const names=node('div',null,'mc-meeting-names');agents.forEach(agent=>{const name=node('span',agent.displayName,'mc-chip');name.title=agent.role;names.append(name);});c.append(names);
      const dependencies=(meeting.dependencyIds||[]).map(id=>state.tasks.find(task=>task.id===id));
      const waiting=dependencies.filter(task=>!task||task.status!=='done'),unavailable=agents.filter(agent=>agent.status!=='active');
      if(waiting.length)c.append(node('p',`Waiting for ${waiting.length} required task${waiting.length===1?'':'s'}: ${waiting.map(task=>task?.title||'Missing task').join(', ')}.`,'mc-meeting-readiness'));
      else if(dependencies.length)c.append(node('p','All required work is complete. The meeting is ready.','mc-meeting-readiness ready'));
      if(unavailable.length){const notice=node('div',null,'mc-meeting-readiness');notice.append(node('p',`Activate ${unavailable.map(agent=>agent.displayName).join(', ')} before starting.`));const team=button('Open Team','mc-secondary');team.onclick=()=>openMissionControl({tab:'team'});notice.append(team);c.append(notice);}
      if(meeting.error&&meeting.status==='failed')c.append(node('div',meeting.error,'mc-error'));
      if(meeting.reviewNote)c.append(node('p',`Owner revision request: ${meeting.reviewNote}`,'mc-revision-note'));
      if(meeting.result?.summary){
        const synthesis=node('section',null,'mc-meeting-synthesis');synthesis.append(node('h4','Synthesis'),node('p',meeting.result.summary));
        for(const [label,items] of [['Recommendations',meeting.result.recommendations],['Material disagreements',meeting.result.disagreements],['Open questions',meeting.result.unresolvedQuestions]]){
          if(!items?.length)continue;const list=node('ul');items.forEach(item=>list.append(node('li',item)));synthesis.append(node('h4',label),list);
        }
        c.append(synthesis);
      }
      const actions=node('div',null,'mc-actions mc-meeting-actions');
      if(['scheduled','failed','needs_input'].includes(meeting.status)){
        const start=button(running?'Meeting in progress…':meeting.status==='needs_input'?'Run revised meeting':meeting.status==='failed'?'Retry meeting':'Start cross-functional meeting','mc-primary');
        start.disabled=running||waiting.length>0||unavailable.length>0||agents.length<2;start.onclick=()=>startMeeting(meeting,agents,start);actions.append(start);
      }
      if(meeting.status==='review'){
        const approve=button(running?'Saving decision…':'Approve decision','mc-primary'),revise=button('Request revision','mc-secondary');approve.disabled=revise.disabled=running;
        approve.onclick=()=>reviewMeeting(meeting,true,'',actions);revise.onclick=()=>meetingRevisionForm(c,meeting);actions.append(approve,revise);
      }
      if(['in_progress','synthesizing'].includes(meeting.status))actions.append(node('p',meeting.status==='synthesizing'?'The coordinator is combining the specialist perspectives…':'The specialists are preparing their independent perspectives…','mc-muted'));
      c.append(actions);
      if(meeting.contributions?.length){
        const contributions=node('details',null,'mc-meeting-contributions');contributions.append(node('summary',`Specialist perspectives · ${meeting.contributions.length}`));
        meeting.contributions.forEach(item=>{const view=node('section');view.append(node('h4',`${item.agentName} · ${item.role}`),node('p',item.position));for(const [label,values] of [['Risks',item.risks],['Recommendations',item.recommendations],['Assumptions',item.assumptions]]){if(!values?.length)continue;view.append(node('strong',label));const list=node('ul');values.forEach(value=>list.append(node('li',value)));view.append(list);}contributions.append(view);});c.append(contributions);
      }
      const deliverable=state.deliverables.find(item=>item.id===meeting.deliverableId);
      if(deliverable){const record=node('details',null,'mc-meeting-record');record.append(node('summary','Decision record'));record.append(ui.documentView(deliverable.versions?.find(version=>version.id===deliverable.currentVersionId)?.content||'','mc-deliverable'));c.append(record);}
      content.append(c);
    }
  }
  function meetingRevisionForm(cardElement,meeting){
    if(cardElement.querySelector('.mc-meeting-revision'))return;
    const form=node('form',null,'mc-form mc-meeting-revision'),feedback=field('Revision feedback','textarea'),submit=button('Send revision request','mc-primary'),cancel=button('Cancel','mc-secondary');
    feedback.input.required=true;feedback.input.maxLength=3000;feedback.input.placeholder='Describe the decision or trade-off the team should revisit.';submit.type='submit';submit.disabled=true;feedback.input.oninput=()=>submit.disabled=!feedback.input.value.trim();
    const actions=node('div',null,'mc-actions');actions.append(submit,cancel);form.append(feedback.label,actions);cardElement.querySelector('.mc-meeting-actions').after(form);cancel.onclick=()=>form.remove();
    form.onsubmit=event=>{event.preventDefault();if(feedback.input.value.trim())reviewMeeting(meeting,false,feedback.input.value,actions);};feedback.input.focus();
  }
  async function startMeeting(meeting,agents,start){
    if(workflowState.meetingBusy.has(meeting.id))return;workflowState.meetingBusy.add(meeting.id);start.disabled=true;start.textContent='Meeting in progress…';signalAiAction('Running this cross-functional meeting');setStatus('Your team is preparing independent perspectives…');
    let actionError;
    try{await api('POST',`/api/meetings/${meeting.id}/start`,{});await loadAll();}
    catch(error){actionError=error;try{await loadAll();}catch{}}
    finally{workflowState.meetingBusy.delete(meeting.id);if(state.tab==='meetings'&&!state.onboardingMode){render();const saved=state.meetings.find(item=>item.id===meeting.id);if(['review','completed'].includes(saved?.status))setStatus('The meeting decision is ready for your review.');else if(['in_progress','synthesizing'].includes(saved?.status))setStatus('The meeting is still running. Its status will update automatically.');else if(actionError)workError(actionError,'meetings');}}
  }
  async function reviewMeeting(meeting,approved,note='',actions){
    if(workflowState.meetingBusy.has(meeting.id))return;workflowState.meetingBusy.add(meeting.id);actions?.querySelectorAll('button').forEach(item=>item.disabled=true);
    try{await api('POST',`/api/meetings/${meeting.id}/${approved?'approve':'request-revision'}`,{note,expectedApprovalId:meeting.approvalId});await refreshWorkView('meetings');if(state.tab==='meetings')setStatus(approved?'Decision approved.':'Revision request saved. Run the revised meeting when ready.');}
    catch(error){
      let saved;try{saved=await api('GET',`/api/meetings/${meeting.id}`);}catch{}
      if(saved?.approvalId===meeting.approvalId&&saved.status===(approved?'completed':'needs_input')){await refreshWorkView('meetings');if(state.tab==='meetings')setStatus(approved?'Decision approved.':'Revision request saved.');}
      else workError(error,'meetings');
    }
    finally{workflowState.meetingBusy.delete(meeting.id);actions?.querySelectorAll('button').forEach(item=>item.disabled=false);if(state.tab==='meetings'&&!content.querySelector('.mc-error'))render();else if(state.tab==='meetings')content.querySelector(`[data-meeting-id="${meeting.id}"]`)?.querySelectorAll('button').forEach(item=>item.disabled=false);}
  }

  function renderKnowledge(){
    content.replaceChildren();
    const actions=node('div',null,'mc-knowledge-toolbar'),search=node('input'),searchLabel=node('label','Search knowledge'),resultCount=node('span','','mc-collection-count');resultCount.setAttribute('role','status');search.type='search';search.setAttribute('aria-label','Search knowledge');search.value=state.knowledgeSearch||'';search.placeholder='Title, content, or status';search.className='mc-search-input';searchLabel.append(search);actions.append(searchLabel,resultCount);
    content.append(sectionHead('Knowledge','Durable work should become organizational memory, not disappear inside chat history. Browse deliverables, evidence, assumptions, and the decisions behind them.',actions));
    const list=node('div',null,'mc-grid mc-knowledge-grid');content.append(list);
    const renderList=()=>{
      list.replaceChildren();
      state.knowledgeSearch=search.value;const query=search.value.trim().toLowerCase();
      const items=state.deliverables.filter(d=>{const version=d.versions?.find(v=>v.id===d.currentVersionId)||d.versions?.at(-1);return !query||`${d.title} ${version?.content||''} ${d.status||''}`.toLowerCase().includes(query);});
      resultCount.textContent=`${items.length} of ${state.deliverables.length} documents`;if(!items.length){const action=button(query?'Clear search':'Create a mission','mc-secondary');action.onclick=()=>{if(query){search.value='';renderList();search.focus();}else openMissionControl({tab:'mission'});};const empty=ui.emptyState(query?'No knowledge matches your search.':'Your knowledge base will grow as missions produce durable work.',query?'Try another keyword or clear your search.':'Saved deliverables will appear here as your team works.',action);empty.classList.add('full');list.append(empty);return;}
      for(const d of items){const version=d.versions?.find(v=>v.id===d.currentVersionId)||d.versions?.at(-1),c=card(d.title,'full mc-knowledge-card');c.append(badge(d.status),ui.documentView(version?.content||'No textual content yet.','mc-deliverable'));if(window.OrganaWorkspaces)c.append(window.OrganaWorkspaces.deliverableExtras(d));const meta=node('div',null,'mc-actions'),why=button('View traceability','mc-secondary');meta.append(why);c.append(meta);why.onclick=async()=>{why.disabled=true;try{const data=await api('GET',`/api/deliverables/${d.id}/why`),panel=node('div',null,'mc-why');panel.append(node('strong','Why this exists'));const ul=node('ul');[`Goals: ${data.goals.map(g=>g.title).join(', ')||'none'}`,`Evidence: ${data.evidenceRefs.join(', ')||'none'}`,`Assumptions: ${data.assumptions.join(' · ')||'none'}`,`Collaborators: ${data.collaborators.map(a=>a.displayName).join(', ')||'none'}`,`Decision summary: ${data.decisionSummary||'none'}`].forEach(x=>ul.append(node('li',x)));panel.append(ul);c.append(panel);why.remove();}catch(err){setStatus(err.message);why.disabled=false;}};list.append(c);}
    };
    search.oninput=renderList;renderList();
    const learning=card('Recent learning signals','full');const useful=state.events.filter(e=>['task.completed','meeting.completed','approval.resolved','deliverable.created','deliverable.updated'].includes(e.type)).slice(0,12);if(!useful.length)learning.append(node('p','No learning signals yet. Finish a mission or approve a deliverable and Organa will retain the result here.','mc-muted'));else useful.forEach(e=>{const row=node('div',null,'mc-event');row.append(node('time',formatTime(e.createdAt)),node('span',`${({'task.completed':'Task completed','meeting.completed':'Meeting completed','approval.resolved':'Decision reviewed','deliverable.created':'Deliverable saved','deliverable.updated':'Deliverable updated'})[e.type]||e.type}${e.payload?.title?` · ${e.payload.title}`:''}`));learning.append(row);});content.append(learning);
  }

  function renderGoals(){
    content.replaceChildren();const company=state.company?.company||{},ns=state.company?.northStar||{};
    const actions=node('div',null,'mc-actions'),edit=button('Edit North Star','mc-primary');edit.onclick=()=>renderNorthStarEditor(ns);actions.append(edit);
    content.append(sectionHead('Goals & North Star','This is the center of the organization. Every mission, agent, approval, and deliverable should be explainable against these human-defined goals and constraints.',actions));
    const direction=node('div',null,'mc-actions');direction.append(node('span',ns.version?`Active version ${ns.version}`:'No active North Star','mc-badge active'));content.append(direction);
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
    const missionCard=card('Mission progress','full');if(!state.projects.length)missionCard.append(node('p','No mission history yet.','mc-muted'));else state.projects.slice(0,8).forEach(project=>{const tasks=state.tasks.filter(t=>t.projectId===project.id),done=tasks.filter(t=>t.status==='done').length,pct=tasks.length?Math.round(done/tasks.length*100):0,row=node('div',null,'mc-performance-row'),head=node('div',null,'mc-performance-head'),bar=node('div',null,'mc-progress');row.dataset.projectId=project.id;head.append(node('strong',project.title),node('span',`${done}/${tasks.length} · ${pct}%`));bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',project.title);bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-valuenow',String(pct));bar.append(node('span'));bar.firstChild.style.width=`${pct}%`;row.append(head,bar);missionCard.append(row);});content.append(missionCard);
    const agents=card('AI coworker activity','full'),grid=node('div',null,'mc-grid'),coworkers=state.agents.filter(a=>a.status!=='draft');coworkers.forEach(agent=>{const tasks=state.tasks.filter(t=>t.assigneeAgentId===agent.id),done=tasks.filter(t=>t.status==='done').length,active=tasks.filter(t=>['active','queued'].includes(t.status)).length,usage=state.usageSummary?.byAgent?.[agent.id]||{},c=card();c.dataset.evaluationAgentId=agent.id;const identity=node('div',null,'mc-evaluation-identity'),copy=node('div');copy.append(node('h3',agent.displayName),node('p',agent.role,'mc-muted'));identity.append(node('span',initials(agent.displayName),'mc-avatar'),copy);const metrics=node('dl',null,'mc-evaluation-metrics');[['Completed',done],['Active / queued',active],['Model calls',usage.requests||0],['Tokens',(usage.totalTokens||0).toLocaleString()]].forEach(([label,value])=>{const item=node('div');item.append(node('dt',label),node('dd',value));metrics.append(item);});const open=button('View coworker','mc-secondary');open.onclick=()=>window.OrganaWorkspace.openAgent(agent.id);c.append(identity,badge(teamAgentWorkState(agent)),metrics,open);if(agent.evaluationCriteria?.length){const criteria=node('details',null,'mc-evaluation-criteria'),list=node('ul');criteria.append(node('summary','Evaluation criteria'));agent.evaluationCriteria.forEach(text=>list.append(node('li',text)));criteria.append(list);c.append(criteria);}grid.append(c);});if(!coworkers.length)agents.append(node('p','No hired coworkers yet. Review and hire a draft from Team.','mc-muted'));else agents.append(grid);content.append(agents);
  }

  function renderReview(){
    content.replaceChildren();content.append(sectionHead('Approval Center & Traceability','Important decisions come to you. Review recommendations, request changes, and inspect the goals, evidence, assumptions, and collaborators behind each deliverable.'));
    const pending=card(`Pending approvals · ${state.approvals.length}`,'full');if(!state.approvals.length)pending.append(node('p','You are all caught up. No decision needs your approval right now.','mc-muted'));for(const approval of state.approvals){const row=node('div',null,'mc-card full mc-approval-record');row.dataset.approvalId=approval.id;row.dataset.collectionId=approval.id;row.append(badge(approval.status),node('h3',approval.title),node('p',approval.summary||''));const acts=node('div',null,'mc-actions'),approve=button(workflowState.approvalBusy.has(approval.id)?'Saving review…':'Approve','mc-primary'),revise=button('Request revision','mc-secondary');approve.disabled=revise.disabled=workflowState.approvalBusy.has(approval.id);approve.onclick=()=>resolveApproval(approval,'approve');revise.onclick=()=>approvalRevisionForm(row,approval);acts.append(approve,revise);if(['task','meeting','project'].includes(approval.entityType)&&approval.entityId){const type=approval.entityType,records=type==='task'?state.tasks:type==='meeting'?state.meetings:state.projects,source=records.find(record=>record.id===approval.entityId);row.append(node('p',`Source: ${type}${source?.title?' · '+source.title:''}`,'mc-muted'));const open=button(`Open ${type}`,'mc-secondary');open.onclick=()=>openStandupRef(`${type}:${approval.entityId}`);acts.append(open);}row.append(acts);pending.append(row);}content.append(pending);
    const deliveries=card(`Deliverables · ${state.deliverables.length}`,'full');if(!state.deliverables.length)deliveries.append(node('p','No deliverables yet. Completed mission work will appear here with its traceability.','mc-muted'));for(const d of state.deliverables.slice(0,20)){const box=node('article',null,'mc-card full'),version=d.versions?.find(v=>v.id===d.currentVersionId)||d.versions?.at(-1);box.append(badge(d.status),node('h3',d.title),ui.documentView(version?.content||'No textual content.','mc-deliverable'));if(window.OrganaWorkspaces)box.append(window.OrganaWorkspaces.deliverableExtras(d));const why=button('Why did the team do this?','mc-secondary');box.append(why);why.onclick=async()=>{why.disabled=true;try{const data=await api('GET',`/api/deliverables/${d.id}/why`),panel=node('div',null,'mc-why');panel.append(node('strong','Traceability'));const list=node('ul');[`Goals: ${data.goals.map(g=>g.title).join(', ')||'none'}`,`Evidence: ${data.evidenceRefs.join(', ')||'none'}`,`Assumptions: ${data.assumptions.join(' · ')||'none'}`,`Collaborators: ${data.collaborators.map(a=>a.displayName).join(', ')||'none'}`,`Decision summary: ${data.decisionSummary||'none'}`].forEach(x=>list.append(node('li',x)));panel.append(list);box.append(panel);why.remove();}catch(err){setStatus(err.message);why.disabled=false;}};deliveries.append(box);}content.append(deliveries);
  }
  function approvalRevisionForm(row,approval){if(row.querySelector('.mc-approval-revision'))return;const form=node('form',null,'mc-form mc-approval-revision'),feedback=field('Revision feedback','textarea',readDraft('approval:'+approval.id,{text:''}).text),submit=button('Send revision request','mc-primary'),cancel=button('Cancel','mc-secondary');feedback.input.required=true;feedback.input.maxLength=3000;feedback.input.oninput=()=>writeDraft('approval:'+approval.id,{text:feedback.input.value});submit.type='submit';const actions=node('div',null,'mc-actions');actions.append(submit,cancel);form.append(feedback.label,actions);row.append(form);cancel.onclick=()=>form.remove();form.onsubmit=e=>{e.preventDefault();if(feedback.input.value.trim())resolveApproval(approval,'request-revision',feedback.input.value);};feedback.input.focus();}
  async function resolveApproval(approval,action,note=''){
    if(workflowState.approvalBusy.has(approval.id))return;
    if(action!=='approve'&&!note.trim())return;
    workflowState.approvalBusy.add(approval.id);
    const controls=content.querySelector(`[data-approval-id="${CSS.escape(approval.id)}"] .mc-actions`);controls?.querySelectorAll('button').forEach(button=>button.disabled=true);
    setStatus(`${action==='approve'?'Approving':'Requesting revision for'} ${approval.title}…`);
    try{await api('POST',`/api/approvals/${approval.id}/${action}`,{note,expectedVersion:approval.version});clearDraft('approval:'+approval.id,{text:note});await refreshWorkView('review');if(dialog.open&&state.tab==='review'&&!state.onboardingMode)setStatus('Review state updated.');}
    catch(error){workError(error,'review');}
    finally{workflowState.approvalBusy.delete(approval.id);if(state.tab==='review')content.querySelector(`[data-approval-id="${CSS.escape(approval.id)}"] .mc-actions`)?.querySelectorAll('button').forEach(button=>{button.disabled=false;if(button.textContent==='Saving review…')button.textContent='Approve';});}
  }

  function renderEmails(){
    content.replaceChildren();
    content.append(sectionHead('Emails','Draft with AI, review, and send from your own Gmail.'));
    if(window.OrganaEmails)window.OrganaEmails.render(content,{state,setStatus,reload:()=>refreshWorkView('emails')});
    else content.append(node('p','Emails are unavailable right now. Reload the page.','mc-muted'));
  }
  function renderStandup(){
    content.replaceChildren();
    const actions=node('div',null,'mc-actions'),generate=button(workflowState.standupBusy?'Preparing…':state.standup?'Refresh Stand-Up':'Start Stand-Up','mc-primary');generate.id='mcGenerateStandup';generate.disabled=workflowState.standupBusy;actions.append(generate);
    content.append(sectionHead('Morning Stand-up','See what needs your attention, what changed, and what the team can do next.',actions));
    generate.onclick=async()=>{
      if(workflowState.standupBusy)return;workflowState.standupBusy=true;generate.disabled=true;generate.textContent='Preparing…';signalAiAction('Generating this Stand-up');
      try{const result=await api('POST','/api/standups/generate',{}, {timeoutMs:60000});state.standup=result;if(state.tab==='standup'&&!state.onboardingMode){setStatus(result?.generation?.degraded?'Stand-up ready from verified activity. AI summarization was temporarily unavailable.':'Your morning brief is ready.');}}
      catch(error){workError(error,'standup');}
      finally{workflowState.standupBusy=false;if(dialog.open&&state.tab==='standup'&&!state.onboardingMode){if(!content.querySelector('.mc-error'))render();else{const live=$('mcGenerateStandup');if(live){live.disabled=false;live.textContent=state.standup?'Refresh Stand-Up':'Start Stand-Up';}}}}
    };
    if(!state.standup){content.append(ui.emptyState('Your morning brief starts here','Create a stand-up from saved work, blockers, and decisions.'));return;}
    const summary=state.standup.summary||{},brief=card('Owner brief','full mc-standup'),meta=node('div',null,'mc-standup-meta');
    meta.append(badge(state.standup.generation?.degraded?'verified fallback':state.standup.generation?.mode==='deterministic'?'demo brief':'completed'),node('span',`Generated ${formatTime(state.standup.createdAt)}`,'mc-muted'));brief.append(meta,node('h3',summary.headline||'Stand-up'));
    if(state.standup.generation?.degraded){const notice=node('div',null,'mc-standup-notice');notice.append(node('strong','Verified fallback'),node('span','The AI summarizer was unavailable. This brief uses stored tasks, approvals, meetings, and blockers.'));brief.append(notice);}
    const grid=node('div',null,'mc-standup-grid');
    for(const [title,items,empty] of [['Needs attention',summary.needsAttention,'No pending reviews.'],['Blockers',summary.blockers,'No recorded blockers.'],['Completed',summary.completed,'No completed work yet.'],['Decisions',summary.decisions,'No meeting decisions yet.'],['Next',summary.next,'The team is ready for a new mission.']]){
      const section=node('section',null,'mc-standup-section');section.append(node('h4',`${title} · ${items?.length||0}`));
      if(!items?.length)section.append(node('p',empty,'mc-muted'));
      else{const list=node('ul');items.forEach(item=>{const row=node('li');row.append(node('p',item.summary));if(item.ref){const kind=item.ref.split(':')[0],open=button(`Open ${kind} →`,'mc-ref-link');open.onclick=()=>openStandupRef(item.ref);row.append(open);}list.append(row);});section.append(list);}grid.append(section);
    }
    brief.append(grid);if(summary.usageSummary)brief.append(node('p',summary.usageSummary,'mc-muted mc-standup-usage'));content.append(brief);
  }
  async function openStandupRef(ref){
    const [kind,id]=ref.split(':');if(['approval','meeting','project'].includes(kind))collectionFilters[kind==='approval'?'approvals':kind==='meeting'?'meetings':'missions']={query:'',status:'all'};
    if(kind==='task'&&window.officeTasks?.openTask){await window.officeTasks.openTask(id);return;}
    const tab=kind==='approval'?'review':kind==='meeting'?'meetings':'mission';await openMissionControl({tab});
    const record=content.querySelector(`[data-${kind==='approval'?'approval':kind==='project'?'project':'meeting'}-id="${CSS.escape(id)}"]`);record?.scrollIntoView({block:'center'});
  }

  function renderSettings(){
    content.replaceChildren();
    const settingsActions=node('div',null,'mc-actions');
    if(onboardingController.hasDraft()){
      const resume=button('Continue organization setup','mc-secondary');
      resume.onclick=()=>openMissionControl({onboarding:true});settingsActions.append(resume);
    }
    content.append(sectionHead('AI Settings','Choose which AI provider powers Organa. Credentials stay server-side, and individual coworkers can inherit the workspace choice or use an approved override.',settingsActions));
    const settings=state.llmSettings||{}, providers=settings.providers||[],runtime=settings.runtime||{};
    const runtimeCard=card('AI runtime status','full mc-ai-runtime-card'),runtimeRow=node('div',null,'mc-ai-runtime-row'),runtimeCopy=node('div'),runtimeError=runtime.status==='error';
    runtimeCopy.append(node('strong',runtimeError?'AI provider needs attention':runtime.usingLiveAi?`Live AI · ${runtime.selectedProviderLabel||settings.provider||'provider'}`:runtime.liveProviderConfigured?'Deterministic mode selected':'No live AI provider configured'),node('p',runtimeError?(runtime.lastError?.message||'The selected provider could not complete the last model request. Review credentials and permissions, then retry.'):runtime.usingLiveAi?`New AI work uses ${settings.model||'the provider default model'}. Credentials remain server-side.`:runtime.liveProviderConfigured?'A live provider is available on the server, but Organa is currently using deterministic demo output. Select the live provider below to switch.':'Organa remains usable in deterministic demo mode. Connect Gemini when you want real model reasoning and generation.','mc-muted'));
    runtimeRow.append(node('span',runtimeError?'ATTENTION':runtime.usingLiveAi?'LIVE':'DEMO',`mc-badge ${runtimeError?'blocked':runtime.usingLiveAi?'done':'warn'}`),runtimeCopy);runtimeCard.append(runtimeRow);content.append(runtimeCard);
    const cardEl=card('Workspace default','full'),form=node('form',null,'mc-form mc-settings-form'),providerLabel=node('label','Provider'),providerSelect=node('select');
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
    authGrid.append(vertexAuth,apiAuth);const guide=node('details',null,'mc-connection-guide');guide.append(node('summary','Server credentials and connection instructions'),authGrid);security.append(guide);const rows=node('div',null,'mc-list');for(const p of providers){const row=node('div',null,'mc-event');row.append(node('span',p.configured?'CONFIGURED':'NOT CONFIGURED'),node('span',`${p.label} · ${p.authMode}`));rows.append(row);}security.append(rows);content.append(security);
    window.OrganaWorkspaces?.mountSettings(content,{setStatus});
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;setStatus('Updating the workspace AI provider…');try{state.llmSettings=await api('PATCH','/api/llm/settings',{provider:providerSelect.value,model:model.input.value.trim(),plannerModel:planner.input.value.trim()});state.health=await api('GET','/api/health');document.dispatchEvent(new CustomEvent('organa:ai-settings-changed'));setStatus(`Now using ${state.llmSettings.provider}${state.llmSettings.model?` · ${state.llmSettings.model}`:''}. New model calls use this setting.`);renderSettings();}catch(err){setStatus(err.message);errorBox(err);}finally{save.disabled=false;}};
  }

  function mountCollection(name,records,selector){const statuses=[...new Set(records.map(record=>record.status))].map(status=>[status,status==='draft_plan'?'Ready to start':status==='needs_input'?'Needs your input':badge(status).textContent]);const tools=ui.collectionTools({name,records,root:content,selector,statuses,saved:collectionFilters[name]||{},onChange:values=>collectionFilters[name]=values});const first=content.querySelector(selector);if(first)first.before(tools.toolbar,tools.empty);else content.append(tools.toolbar,tools.empty);tools.apply();}
  function viewSignature(){
    const fields={company:['company','northStarVersions','agents','projects','tasks','approvals','deliverables'],team:['agents','tasks','usageSummary'],mission:['projects','tasks','agents','company'],meetings:['meetings','agents','tasks','deliverables'],knowledge:['deliverables'],review:['approvals','deliverables'],emails:['emails','deliverables'],standup:['standup'],goals:['company','northStarVersions'],performance:['tasks','projects','agents','deliverables','usageSummary'],settings:['llmSettings']};
    return JSON.stringify([state.tab,state.llmSettings,...(fields[state.tab]||[]).map(key=>state[key])]);
  }
  function render({preservePosition=false}={}){
    if(state.onboardingMode){renderOnboarding();content.focus({preventScroll:true});return;}
    const scrollTop=content.scrollTop;
    delete content.dataset.northStarReview;
    syncGlobalNavigation(state.tab);
    if(!preservePosition&&matchMedia('(max-width:640px)').matches)document.querySelector('[data-organa-route].active')?.scrollIntoView({block:'nearest',inline:'nearest'});
    ({company:renderCompany,team:renderTeam,mission:renderMission,meetings:renderMeetings,knowledge:renderKnowledge,review:renderReview,emails:renderEmails,standup:renderStandup,goals:renderGoals,performance:renderPerformance,settings:renderSettings}[state.tab]||renderCompany)();
    if(state.tab==='mission'&&state.projects.length)mountCollection('missions',state.projects,'.mc-mission-card');if(state.tab==='meetings'&&state.meetings.length)mountCollection('meetings',state.meetings,'.mc-meeting-card');if(state.tab==='review'&&state.approvals.length)mountCollection('approvals',state.approvals,'.mc-approval-record');
    if(['company','team','mission','meetings','standup'].includes(state.tab))mountAiModeNotice({company:'Organization design',team:'AI employee design',mission:'Mission planning and execution',meetings:'AI collaboration',standup:'AI Stand-up summarization'}[state.tab]);
    lastRenderedSignature=viewSignature();
    if(preservePosition)content.scrollTop=scrollTop;
    else{content.scrollTop=0;content.focus({preventScroll:true});}
  }
  async function refresh(tab=state.tab,requestedNavigation=navigationVersion){
    state.tab=tab;
    try{
      if(state.onboardingMode){await loadOnboarding();return;}
      await loadAll();if(requestedNavigation===navigationVersion&&dialog.open&&state.tab===tab&&!state.onboardingMode)render();
    }catch(err){
      if(requestedNavigation!==navigationVersion||!dialog.open||state.tab!==tab)return;
      if(state.onboardingMode){onboardingController.state.error=err.message||String(err);renderOnboarding();setStatus('Organa cannot reach the onboarding service right now. You can retry without reloading the page.');return;}
      content.replaceChildren();errorBox(err);const retry=button('Retry loading this view','mc-primary');retry.onclick=()=>openMissionControl({tab});content.append(retry);setStatus('Organa cannot reach the workspace service right now.');
    }
  }

  async function openMissionControl({onboarding=false,tab=null}={}){
    const requestedNavigation=++navigationVersion;
    if(tab&&state.onboardingMode){onboardingController.save();state.onboardingMode=false;clearOnboardingRoute();}
    if(onboarding&&!state.onboardingMode)onboardingController.restartCompleted();
    state.onboardingMode=onboarding||state.onboardingMode;
    if(state.onboardingMode){
      const url=new URL(location.href);url.searchParams.set('onboarding','1');history.replaceState({},'',url.pathname+url.search+url.hash);
      state.tab='company';setOnboardingChrome(true);ensureDialog();renderOnboarding();onboardingController.focusHeading();setStatus('Preparing your organization builder…');
      await refresh('company',requestedNavigation);
      if(state.onboardingMode&&requestedNavigation===navigationVersion)setStatus(onboardingController.state.error||'Your setup is saved as you go. Nothing activates until you approve.');
      return;
    }
    state.tab=tab||state.tab;setOnboardingChrome(false);ensureDialog();syncGlobalNavigation(state.tab);setStatus('Loading your organization…');
    content.replaceChildren(ui.loadingView(tabChrome[state.tab]?.[0]||'your organization'));content.dataset.view='loading';content.setAttribute('aria-busy','true');content.inert=true;
    await refresh(state.tab,requestedNavigation);
    if(requestedNavigation!==navigationVersion||!dialog.open)return;
    content.dataset.view=state.tab;content.removeAttribute('aria-busy');content.inert=false;
    content.focus({preventScroll:true});
    if(!content.querySelector('.mc-error'))setStatus(state.health?.provider==='dry-run'?'Demo mode is active. Connect an AI provider in Settings for live model output.':`AI provider: ${state.health?.provider}. Your work is saved in this workspace.`);
  }
  window.OrganaWorkspace={open:tab=>tabChrome[tab]?openMissionControl({tab}):Promise.resolve(),openAgent:id=>{state.teamSelectedAgentId=id;state.teamSearch='';return openMissionControl({tab:'team'});}};
  $('bMission').onclick=()=>openMissionControl();
  $('organaResumeOnboarding').onclick=()=>openMissionControl({onboarding:true});
  $('closeMission').onclick=()=>{if(state.onboardingMode){if(onboardingController.state.completion)onboardingController.clear();else onboardingController.save();state.onboardingMode=false;clearOnboardingRoute();setOnboardingChrome(false);}dialog.close();};
  dialog.addEventListener('click',e=>{if(e.target===dialog&&dialog.matches?.(':modal'))dialog.close();});
  dialog.addEventListener('close',()=>{if(dialog.open)return;navigationVersion++;content.inert=false;content.removeAttribute('aria-busy');document.body.classList.remove('organa-workspace-open');if(state.onboardingMode){onboardingController.save();state.onboardingMode=false;clearOnboardingRoute();setOnboardingChrome(false);}if(!document.querySelector('dialog:modal'))document.querySelector('[data-organa-route="office"]')?.focus({preventScroll:true});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialog.open&&!document.querySelector('dialog:modal')){event.preventDefault();$('closeMission').click();}});
  if(onboardingRequested)setTimeout(()=>openMissionControl({onboarding:true}),60);
  const markDirty=event=>{const form=event.target.closest('form');if(form)form.dataset.dirty='true';};
  content.addEventListener('input',markDirty);content.addEventListener('change',markDirty);
  const canRefreshView=()=>dialog.open&&!state.onboardingMode&&!content.inert&&!content.dataset.northStarReview&&!workflowState.standupBusy&&!workflowState.meetingBusy.size&&!workflowState.approvalBusy.size&&!workflowState.clarificationBusy.size&&!workflowState.employeeBusy.size&&!workflowState.hiringBusy&&!['company','team'].includes(state.tab)&&!content.querySelector('form[data-dirty="true"],form button[type="submit"]:disabled,details[open],.mc-why,.mc-error')&&!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  setInterval(async()=>{if(!canRefreshView()||polling)return;polling=true;const requestedNavigation=navigationVersion;try{await loadAll();if(requestedNavigation===navigationVersion&&canRefreshView()&&viewSignature()!==lastRenderedSignature)render({preservePosition:true});}catch{}finally{polling=false;}},3000);
  // Keeps the tab title ("(3) Organa …") current while the dashboard is closed, so you notice work waiting for you.
  async function pollAttention(){
    if(dialog.open||document.hidden)return;
    try{const [approvals,tasks,meetings]=await Promise.all([api('GET','/api/approvals?status=pending'),api('GET','/api/tasks'),api('GET','/api/meetings')]);Object.assign(state,{approvals,tasks,meetings});updateAttentionBadge();}catch{}
  }
  setTimeout(pollAttention,2500);setInterval(pollAttention,20000);
})();
