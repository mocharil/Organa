(() => {
  const storageKey = 'kantor-ai.tasks.v1';
  const states = {planned:'Planned', waiting_dependency:'Waiting on dependency', queued:'Queued', active:'In progress', blocked:'Needs decision', review:'Needs review', done:'Done', failed:'Failed', cancelled:'Cancelled'};
  const el = id => document.getElementById(id);
  let tasks = [], team = [], changed, locate;
  let storageHealthy = true;
  let mutation=0,polling=false,writing=0;
  const drafts=new Map(),busyTasks=new Set();
  let creating=false;
  const identity=person=>person.agentId||person.id||server?.members?.[person.n]?.id||person.n;
  function assigneeDraft(task){const raw=draftRead('assignee:'+task.id);try{return JSON.parse(raw)||null;}catch{return null;}}
  function assignmentPicker(task){const wrap=node('div',undefined,'task-assign-row'),select=node('select');select.setAttribute('aria-label',`New assignee for ${task.title}`);select.id=`assign-${task.id}`;for(const person of team){const option=node('option',person.n);option.value=identity(person);select.append(option);}const draft=assigneeDraft(task),value=draft?.id||task.assigneeAgentId||identity(team.find(person=>person.n===task.assignee)||{n:task.assignee});if(!team.some(person=>identity(person)===value)){const option=node('option',`${draft?.name||task.assignee} · unavailable`);option.value=value;option.disabled=true;select.prepend(option);}select.value=value;select.onchange=()=>{const person=team.find(person=>identity(person)===select.value);draftWrite('assignee:'+task.id,JSON.stringify({id:select.value,name:person?.n||select.value}));};const move=action('Move task',()=>reassign(task.id,select.value));move.disabled=busyTasks.has(task.id);wrap.append(select,move);return wrap;}
  function taskBusy(id,busy){if(busy)busyTasks.add(id);else busyTasks.delete(id);el('taskList').querySelector(`[data-task-id="${CSS.escape(id)}"]`)?.querySelectorAll('button').forEach(button=>button.disabled=busy);}
  function syncRoster(info){const previous=el('taskAssignee').value,previousId=identity(team.find(person=>person.n===previous)||{n:previous}),filter=el('agentFilter').value;team=(info.roster||[]).map(person=>({...person,agentId:person.id}));server=info;for(const id of ['taskAssignee','agentFilter']){const select=el(id);select.replaceChildren();if(id==='agentFilter'){const all=node('option','All coworkers');all.value='all';select.append(all);}for(const person of team){const option=node('option',`${person.n} · ${person.role}`);option.value=person.n;select.append(option);}}el('taskAssignee').value=team.find(person=>identity(person)===previousId)?.n||team[0]?.n||'';el('agentFilter').value=team.some(person=>person.n===filter)?filter:'all';}

  const draftKey=(task,kind)=>`${kind}:${task.id}:${kind==='result'?'result':(task.version||0)}`;
  function draftRead(key){if(drafts.has(key))return drafts.get(key);try{return sessionStorage.getItem('kantor-draft:'+key)||'';}catch{return '';}}
  function draftWrite(key,value){drafts.set(key,value);try{sessionStorage.setItem('kantor-draft:'+key,value);}catch{feedback('Draft is kept in this tab only; browser storage is unavailable.');}}
  function draftClear(key){drafts.delete(key);try{sessionStorage.removeItem('kantor-draft:'+key);}catch{}}

  // With the server running, tasks live there and some members are AI agents; without it, tasks stay in this browser.
  let server = null;
  const displayName = name => team.find(person => person.n === name)?.n || name;
  const agentFor = name => server?.members[name] ? {...server.members[name], mode: server.mode} : null;

  function feedback(message) { el('taskFeedback').textContent = message; }
  function persist(next) {
    if (!storageHealthy) {
      feedback('Saved data cannot be read. Changes are blocked so the old data is not overwritten.');
      return false;
    }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { feedback('Could not save. Check browser storage; the change was not applied.'); return false; }
    tasks = next;
    return true;
  }
  async function call(method, path, body) {
    const write=method!=='GET';if(write){mutation++;writing++;}
    try{
      const response=await fetch(path,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const err=new Error(data.error||`Server error ${response.status}`);err.code=data.code||'';if(err.code==='AI_PROVIDER_NOT_READY'||err.code==='AI_PROVIDER_UNAVAILABLE')document.dispatchEvent(new CustomEvent('organa:ai-provider-error',{detail:{code:err.code,message:err.message}}));throw err;}
      return data;
    }finally{if(write){writing--;mutation++;}}
  }
  // Server changes arrive as whole task lists; report each status change once so the office log and characters follow.
  function apply(list) {
    const before = new Map(tasks.map(t => [t.id, t]));
    tasks = list;
    for (const task of list) {
      const old = before.get(task.id);
      // A fast agent can go from queued to done between two polls; still log that it started.
      if (old && old.status === 'queued' && ['blocked','review','done'].includes(task.status)) changed(task.assignee, 'active', task.title);
      if (old && old.status !== task.status) changed(task.assignee, task.status, task.title);
      if (old && old.assignee !== task.assignee) changed(old.assignee);
    }
  }
  function validTask(task) {
    return task && typeof task.id === 'string' && typeof task.title === 'string' && task.title.trim() &&
      task.title.length <= 160 && typeof task.assignee === 'string' && task.assignee.trim() &&
      Object.hasOwn(states, task.status) && typeof task.brief === 'string' && task.brief.length <= 5000 &&
      typeof task.result === 'string' && task.result.length <= 10000 &&
      (!['review','done'].includes(task.status) || task.result.trim()) && typeof task.createdAt === 'string';
  }
  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function action(text, handler) {
    const button = node('button', text);
    button.type = 'button'; button.onclick = handler;
    return button;
  }
  async function update(id, status, result = '') {
    const task = tasks.find(t => t.id === id);
    if (!task||busyTasks.has(id)) return;
    if (status === 'active' && tasks.some(t => t.id !== id && t.assignee === task.assignee && t.status === 'active')) {
      feedback(`${displayName(task.assignee)} already has an active task. Move it back to the queue or finish it first.`);
      return;
    }
    if (server) {
      taskBusy(id,true);try { const saved = await call('PATCH', `/api/tasks/${id}`, {status, result}); apply(tasks.map(t => t.id === id ? saved : t)); }
      catch (error) { feedback(error.message); return; }finally{taskBusy(id,false);}
    } else {
      const next = tasks.map(t => t.id === id ? {...t, status, result, updatedAt: new Date().toISOString()} : t);
      if (!persist(next)) return;
      changed(task.assignee, status, task.title);
    }
    if(status==='done')draftClear(draftKey(task,'result'));
    render(); feedback(`Task status: ${states[status]}.`);
    el('taskFilter').focus();
  }
  async function reassign(id, selectedId) {
    const target=team.find(person=>identity(person)===selectedId||person.n===selectedId);
    if(!target){feedback('This coworker is no longer active. Choose an available owner.');return;}
    if(busyTasks.has(id))return;
    const key='assignee:'+id,submitted=draftRead(key);taskBusy(id,true);
    try{
      if(server){const saved=await call('PATCH',`/api/tasks/${id}`,{assignee:identity(target)});apply(tasks.map(task=>task.id===id?saved:task));}
      else if(!persist(tasks.map(task=>task.id===id?{...task,assignee:target.n,status:['done','cancelled'].includes(task.status)?task.status:'queued'}:task)))return;
      if(draftRead(key)===submitted)draftClear(key);
      render();feedback(`Task moved to ${target.n}.`);
    }catch(error){feedback(error.message);}
    finally{taskBusy(id,false);}
  }
  async function reviewTask(task,action,comments=''){
    if(busyTasks.has(task.id))return;taskBusy(task.id,true);const key=draftKey(task,'review'),submitted=draftRead(key);try{
      if(server){const saved=await call('PATCH',`/api/tasks/${task.id}`,{action,feedback:comments,version:task.version||0});apply(tasks.map(t=>t.id===task.id?saved:t));}
      else{
        const next=tasks.map(t=>t.id===task.id?{...t,status:action==='approve'?'done':'queued',feedback:comments,version:(t.version||0)+1,updatedAt:new Date().toISOString()}:t);
        if(!persist(next))return;
        changed(task.assignee,action==='approve'?'done':'queued',task.title);
      }
      if(draftRead(key)===submitted)draftClear(key);render();feedback(action==='approve'?'Draft approved.':'Revision requested. The previous draft stays in history.');
    }catch(error){feedback(error.message);}finally{taskBusy(task.id,false);}
  }
  function reviewControls(task,article){
    article.append(window.OrganaUI.documentView(task.result,'task-result'));
    const approve=action('Approve & finish',()=>reviewTask(task,'approve'));approve.className='task-primary';article.append(approve);
    const form=node('form'),label=node('label','Revision comments'),input=node('textarea'),key=draftKey(task,'review');
    input.id=`review-${task.id}`;label.htmlFor=input.id;input.required=true;input.maxLength=5000;input.rows=3;input.value=draftRead(key);
    input.oninput=()=>{input.setCustomValidity('');draftWrite(key,input.value);};
    const submit=node('button','Request revision');submit.type='submit';
    form.append(label,input,submit);form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.setCustomValidity('Describe the changes needed.');input.reportValidity();return;}reviewTask(task,'revise',input.value.trim());};article.append(form);
  }
  // An agent that asked instead of guessing: show its questions and take the answers.
  async function answerTask(task,answer){
    if(busyTasks.has(task.id))return;taskBusy(task.id,true);const key=draftKey(task,'answer'),submitted=draftRead(key);try{const saved=await call('PATCH',`/api/tasks/${task.id}`,{action:'answer',answer,version:task.version||0});apply(tasks.map(t=>t.id===task.id?saved:t));if(draftRead(key)===submitted)draftClear(key);render();feedback(`Answer sent. ${displayName(task.assignee)} picks the task up again.`);}
    catch(error){feedback(error.message);}finally{taskBusy(task.id,false);}
  }
  function answerControls(task,article){
    const questions=node('ul',undefined,'task-result task-questions');
    for(const question of Array.isArray(task.questions)?task.questions:[task.questions].filter(Boolean))questions.append(node('li',question));
    article.append(node('p',`${displayName(task.assignee)} needs more information before drafting:`,'task-agent'),questions);
    const form=node('form'),label=node('label','Your answer'),input=node('textarea'),key=draftKey(task,'answer');
    input.id=`answer-${task.id}`;label.htmlFor=input.id;input.required=true;input.maxLength=3000;input.rows=3;input.value=draftRead(key);
    input.oninput=()=>{input.setCustomValidity('');draftWrite(key,input.value);};
    const submit=node('button','Send answer');submit.type='submit';submit.className='task-primary';
    form.append(label,input,submit);form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.setCustomValidity('Write an answer first.');input.reportValidity();return;}answerTask(task,input.value.trim());};
    article.append(form);
    const assume=node('button','Proceed with your best assumptions');assume.type='button';assume.className='task-secondary';assume.title='The coworker continues using your goals and constraints, and lists the assumptions it made';
    assume.onclick=()=>answerTask(task,'Use your best judgement based on the company goals and hard constraints. Do not ask again; state the assumptions you make clearly in the deliverable.');article.append(assume);
  }
  function agentActions(task, article, actions) {
    const agent = agentFor(task.assignee);
    if (task.status === 'blocked') answerControls(task, article);
    else if (task.status === 'waiting_dependency') article.append(node('p', 'Waiting for upstream work to finish before this task can start.', 'task-agent'));
    else if (task.status === 'failed') { article.append(node('p', `The agent could not finish: ${task.error || 'Unknown error'}`, 'task-error')); actions.append(action('Try again', () => update(task.id, 'queued'))); }
    else if (task.status === 'queued' && task.error) {
      article.append(node('p', `The agent could not finish: ${task.error}`, 'task-error'));
      actions.append(action('Try again', () => update(task.id, 'queued')));
    } else if (task.status === 'queued') article.append(node('p', 'Waiting for the AI agent to pick this up.', 'task-agent'));
    else if (task.status === 'active') {
      const since = Date.parse(task.updatedAt || task.startedAt || ''), seconds = Number.isFinite(since) ? Math.max(0, Math.round((Date.now() - since) / 1000)) : 0;
      const elapsed = seconds >= 5 ? ` ${seconds}s elapsed${seconds > 90 ? ' — taking longer than usual, it will fail with a reason if the model does not answer' : ' (usually 20–60s)'}.` : '';
      article.append(node('p', agent.mode !== 'dry-run' ? `The configured AI agent is working on this…${elapsed}` : 'Deterministic demo run in progress…', 'task-agent'));
    }
    else {
      article.append(node('p', task.by === 'dry-run' ? 'Dry run result, not AI output. Review before use.' : task.by ? `Draft by ${task.by}. Review before use.` : 'Result', 'task-agent'));
      if(task.status==='review')reviewControls(task,article);else article.append(window.OrganaUI.documentView(task.result,'task-result'));
    }
    article.append(actions);
  }
  const announce = () => document.dispatchEvent(new CustomEvent('officetasks:change'));
  function render() {
    const expanded=new Set([...el('taskList').querySelectorAll('article details[open]')].map(details=>details.closest('article').dataset.taskId));
    const focused=el('taskList').contains(document.activeElement)&&document.activeElement.tagName==='TEXTAREA'?{id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
    announce();
    const list = el('taskList'); list.replaceChildren();
    const done = tasks.filter(t => t.status === 'done').length;
    el('taskCount').textContent = tasks.length - done;
    el('taskSummary').textContent = `${tasks.length} tasks · ${done} done`;
    el('exportTasks').disabled = tasks.length === 0;
    const query=(el('taskSearch')?.value||'').toLowerCase().trim();
    const visible = tasks.filter(t => (!query||`${t.title} ${t.brief} ${t.assignee}`.toLowerCase().includes(query)) && (el('taskFilter').value === 'all' || t.status === el('taskFilter').value) &&
      (el('agentFilter').value === 'all' || t.assignee === el('agentFilter').value));
    if (!visible.length) list.append(node('p', tasks.length ? 'No tasks match this filter.' : 'No tasks yet. Add the first job for your team.', 'task-empty'));
    for (const task of visible) {
      const article = node('article', undefined, 'task-item');
      article.dataset.taskId=task.id;
      const agent = agentFor(task.assignee);
      article.append(node('h3', task.title), node('div', `${displayName(task.assignee)} · ${states[task.status]}${agent ? ` · AI agent${agent.mode === 'gemini' ? ` · ${agent.model}` : ''}` : ''}`, 'task-meta'));
      if (task.brief) article.append(node('p', task.brief));
      if(task.history?.length){const history=node('details'),summary=node('summary',`Draft history (${task.history.length})`);history.append(summary);task.history.forEach((draft,i)=>{history.append(node('h4',`Draft ${i+1} · ${draft.by||'Saved'}`));if(draft.feedback)history.append(node('p',`Revision brief: ${draft.feedback}`));history.append(window.OrganaUI.documentView(draft.result,'task-result'));});article.append(history);}
      if(expanded.has(task.id))article.querySelector('details')?.setAttribute('open','');
      const actions = node('div', undefined, 'task-actions');
      if (!team.some(person => person.n === task.assignee)) {
        article.append(node('p', 'This assignee comes from an old prototype. Pick a team member to continue.'));
        const select=assignmentPicker(task);
        if (task.result) article.append(window.OrganaUI.documentView(task.result,'task-result'));
        article.append(select, actions); list.append(article); continue;
      }
      if(server&&['queued','waiting_dependency','blocked','failed'].includes(task.status))article.append(assignmentPicker(task));
      actions.append(action('Show character', () => { el('taskDialog').close(); const workspace=el('missionDialog');if(workspace?.open)workspace.close();locate(task.assignee); }));
      if (agent) { agentActions(task, article, actions); list.append(article); continue; }
      if(task.status==='review'){reviewControls(task,article);article.append(actions);list.append(article);continue;}
      if (task.status === 'queued') actions.append(action('Start task', () => update(task.id, 'active')));
      if (task.status === 'active') {
        actions.append(action('Back to queue', () => update(task.id, 'queued')));
        const form = node('form');
        const label = node('label', 'Result'); label.htmlFor = `result-${task.id}`;
        const input = node('textarea'); input.id = label.htmlFor; input.required = true; input.maxLength = 10000; input.rows = 3;
        const key=draftKey(task,'result');input.value=draftRead(key);
        input.placeholder = 'Write the result or a document link before finishing the task';
        const submit = node('button', 'Save result & finish'); submit.type = 'submit'; submit.className = 'task-primary';
        const footer = node('div', undefined, 'task-actions'); footer.append(submit);
        form.append(label, input, footer);
        form.onsubmit = event => {
          event.preventDefault();
          if (!input.value.trim()) { input.setCustomValidity('Fill in the result first.'); input.reportValidity(); return; }
          update(task.id, 'done', input.value.trim());
        };
        input.oninput = () => {input.setCustomValidity('');draftWrite(key,input.value);};
        article.append(actions, form);
      } else {
        if (task.status === 'done') article.append(window.OrganaUI.documentView(task.result,'task-result'));
        article.append(actions);
      }
      list.append(article);
    }
    for(const id of busyTasks)taskBusy(id,true);
    if(focused){const input=document.getElementById(focused.id);if(input){input.focus({preventScroll:true});input.setSelectionRange(focused.start,focused.end);}}
  }
  // Look for the server once at start. A static host (or no server) keeps the browser-only behaviour.
  async function connect() {
    let info;
    try {
      const response = await fetch('/api/agents', {cache: 'no-store'});
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
      info = await response.json();
    } catch { return; }
    let list = await call('GET', '/api/tasks').catch(() => null);
    if (!list) return;
    // First visit with the server: carry over tasks this browser saved before, if the server has none.
    if (!list.length && storageHealthy && tasks.length) {
      list = await call('POST', '/api/tasks/import', tasks).then(imported => { feedback(`${imported.length} tasks from this browser moved to the server.`); return imported; }).catch(() => list);
    }
    syncRoster(info);
    tasks = list;
    el('taskNote').textContent=info.mode!=='dry-run'?'Live AI is selected. Your team returns task outputs for review.':'Demo output is active. Your team can execute tasks and save results. Connect Gemini in Settings for live AI.';
    el('saveNote').textContent = 'Saved on the Organa server. Export tasks to keep a copy.';
    render();
    tasks.filter(t => t.status === 'active' && team.some(person => person.n === t.assignee)).forEach(t => changed(t.assignee));
    document.dispatchEvent(new CustomEvent('officetasks:server', {detail: info}));
    setInterval(async () => {
      if(polling||writing)return;polling=true;const ticket=mutation;
      const [latest,info]=await Promise.all([call('GET','/api/tasks').catch(()=>null),call('GET','/api/agents').catch(()=>null)]);
      polling=false;if(ticket!==mutation)return;
      if(!latest)return;const changedRoster=info&&JSON.stringify(info.members)!==JSON.stringify(server?.members),changedTasks=JSON.stringify(latest)!==JSON.stringify(tasks);if(!changedRoster&&!changedTasks)return;if(info)syncRoster(info);apply(latest);render();
    }, 2500);
  }
  window.officeTasks = {
    activeFor: name => tasks.find(t => t.assignee === name && t.status === 'active'),
    list: () => tasks.map(t => ({...t})),
    agentFor,
    open(name, status = 'all') {
      el('taskSearch').value='';
      if (name) el('taskAssignee').value = name;
      el('agentFilter').value = [...el('agentFilter').options].some(option=>option.value===name)?name:'all';
      el('taskFilter').value = status; render();
      if(!el('taskDialog').open)el('taskDialog').showModal();
      el('taskSearch').focus();
    },
    async openTask(id) {
      try{
        if(server)apply(await call('GET','/api/tasks'));
        const task=tasks.find(item=>item.id===id);
        this.open(task?.assignee,'all');
        if(!task){feedback('This task is no longer available. Review the current work queue.');return;}
        feedback('');
        const record=el('taskList').querySelector(`[data-task-id="${CSS.escape(id)}"]`);
        if(record){record.tabIndex=-1;record.scrollIntoView({block:'start'});record.focus({preventScroll:true});}
      }catch(error){this.open();feedback(error.message);}
    },
    init(people, onChange, onLocate) {
      team = people.map(person=>({...person})); changed = onChange; locate = onLocate;
      for (const person of team) {
        for (const id of ['taskAssignee', 'agentFilter']) {
          const option = node('option', `${displayName(person.n)} · ${person.role}`); option.value = person.n; el(id).append(option);
        }
      }
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (!Array.isArray(parsed) || !parsed.every(validTask) || new Set(parsed.map(t => t.id)).size !== parsed.length ||
            new Set(parsed.filter(t => t.status === 'active').map(t => t.assignee)).size !== parsed.filter(t => t.status === 'active').length) throw new Error('Invalid task data');
          tasks = parsed;
        }
      } catch { storageHealthy = false; feedback('Task data cannot be read. The old data is kept; changes are blocked.'); }
      for (const name of new Set(tasks.filter(task => !team.some(person => person.n === task.assignee)).map(task => task.assignee))) {
        const option = node('option', `${name} (old prototype)`); option.value = name; el('agentFilter').append(option);
      }
      if(el('taskWebResearch'))window.OrganaWorkspaces?.bindResearchCheckbox(el('taskWebResearch'));
      el('closeTasks').onclick = () => el('taskDialog').close();
      el('taskFilter').onchange = render; el('agentFilter').onchange = render;el('taskSearch').oninput=render;
      const savedCreation=draftRead('creation');try{const data=JSON.parse(savedCreation);if(data){el('taskTitle').value=data.title||'';el('taskBrief').value=data.brief||'';}}catch{}
      const saveCreation=()=>draftWrite('creation',JSON.stringify({title:el('taskTitle').value,brief:el('taskBrief').value,assignee:el('taskAssignee').value}));for(const id of ['taskTitle','taskBrief','taskAssignee'])el(id).addEventListener('input',saveCreation);
      el('taskForm').onsubmit = async event => {
        event.preventDefault();
        if(creating)return;const title = el('taskTitle').value.trim();
        if (!title) { el('taskTitle').setCustomValidity('Enter a task name.'); el('taskTitle').reportValidity(); return; }
        const draft = {title, assignee: el('taskAssignee').value, brief: el('taskBrief').value.trim(), status: 'queued', result: ''};
        if(el('taskWebResearch')?.checked)draft.webResearch=true;
        if(server){draft.assigneeAgentId=identity(team.find(person=>person.n===draft.assignee)||{n:draft.assignee});delete draft.assignee;}
        const submitted=JSON.stringify({title:el('taskTitle').value,brief:el('taskBrief').value,assignee:el('taskAssignee').value}),signature=JSON.stringify(draft),requestKey='creation-request';let request;try{request=JSON.parse(draftRead(requestKey));}catch{}if(request?.signature!==signature){request={signature,id:crypto.randomUUID()};draftWrite(requestKey,JSON.stringify(request));}draft.clientRequestId=request.id;let task;creating=true;el('taskForm').querySelector('[type=submit]').disabled=true;try{
        if (server) {
          try { task = await call('POST', '/api/tasks', draft); tasks = [task, ...tasks.filter(existing=>existing.id!==task.id)]; if (task.status !== 'queued') changed(task.assignee, task.status, task.title); }
          catch (error) { feedback(error.message); return; }
        } else {
          task = {id: crypto.randomUUID(), ...draft, createdAt: new Date().toISOString()};
          if (!persist([task, ...tasks])) return;
        }
        if(JSON.stringify({title:el('taskTitle').value,brief:el('taskBrief').value,assignee:el('taskAssignee').value})===submitted){el('taskTitle').value='';el('taskBrief').value='';draftClear('creation');}
        el('agentFilter').value = 'all'; el('taskFilter').value = 'all';
        render(); feedback(`Task added for ${displayName(task.assignee)}${agentFor(task.assignee) ? (server?.mode==='dry-run'?'. It will run in deterministic demo mode because live AI is not connected.':'. The live AI agent will pick it up.') : '.'}`); el('taskTitle').focus();
        }finally{creating=false;el('taskForm').querySelector('[type=submit]').disabled=false;}
      };
      el('taskTitle').oninput = () => el('taskTitle').setCustomValidity('');
      el('exportTasks').onclick = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(tasks, null, 2)], {type: 'application/json'}));
        const link = node('a'); link.href = url; link.download = 'organa-tasks.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); feedback('Task copy exported.');
      };
      render();
      tasks.filter(t => t.status === 'active' && team.some(person => person.n === t.assignee)).forEach(t => changed(t.assignee));
      connect();
    }
  };
})();
