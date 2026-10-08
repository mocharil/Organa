const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require('playwright');
const {startServer}=require('./helpers/server.cjs');
const output=process.env.WORKFLOWS_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'organa-workflows-'));
fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];
let runtime,browser,page,companyId,dinaId,mayaId,meetingId,oldApprovalId;
const goal='Prepare an evidence-backed coffee launch plan with a controlled Jakarta pilot budget.';
const revision='Use a Jakarta-only pilot capped at IDR 2,000,000 and explain the change from the first decision.';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(label,run){await run();checks.push(label);console.log('PASS:',label);}
async function eventually(condition,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(await condition())return;await delay(60);}throw new Error('Expected workflow state did not appear.');}
async function api(route,method='GET',body){const r=await fetch(runtime.base+route,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();return {status:r.status,data};}
const activeAgents=async()=> (await api('/api/agents?includeDrafts=1')).data.agents;
const shot=name=>page.screenshot({path:path.join(output,name),animations:'disabled'});
const profile=()=>page.locator('.mc-team-profile');
const routes={company:'overview',mission:'missions',review:'approvals'};
async function tab(name){await page.locator(`[data-organa-route="${routes[name]||name}"]`).click();await page.locator(`#mcContent[data-view="${name}"]:not([aria-busy])`).waitFor();}
async function selectAgent(id){await page.locator(`.mc-org-agent-node[data-agent-id="${id}"]`).click();}
async function config(){if(!await profile().locator('details.mc-profile-config').getAttribute('open').then(x=>x!==null))await profile().getByText('Configuration',{exact:true}).click();}
const meeting=()=>page.locator(`[data-meeting-id="${meetingId}"]`);

(async()=>{
 try{
  runtime=await startServer({extraEnv:{DRY_RUN_DELAY_MS:'900'}});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-zygote']});
  const context=await browser.newContext({viewport:{width:1440,height:960}});await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await check('Organization setup activates the reviewed team and passes the outcome to Missions',async()=>{
   await page.goto(runtime.base+'/app?onboarding=1');await page.getByRole('button',{name:/Build from scratch/}).click();await page.getByLabel('Company or project name',{exact:true}).fill('Workflow QA Studio');await page.getByLabel('What should this team achieve?',{exact:true}).fill(goal);
   await page.getByRole('button',{name:'Design my AI team',exact:true}).click();await page.getByRole('button',{name:'Approve & start organization',exact:true}).click();await page.getByRole('button',{name:'Create my first mission',exact:true}).click();
   await eventually(async()=>await page.locator('#missionHeading').textContent()==='Missions');assert.equal(await page.getByLabel('What do you need the organization to solve?',{exact:true}).inputValue(),goal);
   const agents=await activeAgents();assert.equal(agents.length,5);companyId=agents[0].companyId;mayaId=agents.find(agent=>agent.displayName==='Maya').id;
  });
  await check('Team profile protects the Chief of Staff and exposes the reporting structure',async()=>{
   await tab('team');await profile().getByText('Required team coordinator. Keep this role active.',{exact:true}).waitFor();assert.equal(await profile().getByRole('button',{name:'Pause',exact:true}).count(),0);assert.equal(await profile().getByRole('button',{name:'Archive',exact:true}).count(),0);await shot('team-desktop.png');await config();assert.equal(await profile().getByLabel('Role',{exact:true}).getAttribute('readonly'),'');
  });
  await check('Overview and every workspace popup use one reachable main navigation on desktop and mobile',async()=>{
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:960});
    for(const name of ['company','team','mission','meetings','knowledge','review','standup','goals','performance','settings']){
     await tab(name);assert.equal(await page.locator('dialog nav,dialog [data-mc-tab],dialog #appSidebar').count(),0);assert.equal(await page.locator('#appSidebar').count(),1);assert.equal(await page.locator('#missionDialog').evaluate(el=>el.matches(':modal')),false);assert.equal(await page.locator(`[data-organa-route="${routes[name]||name}"]`).getAttribute('aria-current'),'page');assert.equal(await page.locator('#mcContent').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`${name} overflows at ${width}px`);
    }
    await page.locator('[data-organa-route="office"]').click();await page.locator('#missionDialog').waitFor({state:'hidden'});
   }
   await page.setViewportSize({width:1440,height:960});await tab('team');
  });
  await check('Overview loading failure has a working retry and its counters match stored organization data',async()=>{
   const handler=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Overview service temporarily unavailable.'})});await page.route('**/api/company',handler);await tab('company');await page.locator('#mcContent').getByText('Overview service temporarily unavailable.',{exact:true}).waitFor();await page.unroute('**/api/company',handler);await page.getByRole('button',{name:'Retry loading this view',exact:true}).click();await page.locator('.mc-hero').waitFor();
   const counts=await page.locator('.mc-hero-stat').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.querySelector('span').textContent,Number(row.querySelector('strong').textContent)])));assert.equal(counts['active AI coworkers'],(await activeAgents()).filter(agent=>agent.status==='active').length);assert.equal(counts['tasks completed'],(await api('/api/tasks')).data.filter(task=>task.status==='done').length);await shot('overview-desktop.png');await tab('team');
  });
  await check('A slow Overview response cannot replace a newer Team navigation',async()=>{
   let release,first=true;const gate=new Promise(resolve=>release=resolve),handler=async route=>{if(first){first=false;await gate;}await route.continue();};await page.route('**/api/company',handler);await page.locator('[data-organa-route="overview"]').click();await eventually(async()=>!first);await tab('team');release();await delay(250);assert.equal(await page.locator('#missionHeading').textContent(),'Your AI Team');assert.equal(await page.locator('#mcContent').getAttribute('data-view'),'team');assert.equal(await page.locator('.mc-hero').count(),0);await page.unroute('**/api/company',handler);
  });
  await check('A lost employee-design response retries one draft with a unique name',async()=>{
   const handler=async route=>{await route.fetch();await route.abort('failed');};await page.route('**/api/agents/design',handler);
   await page.getByLabel('Hiring request',{exact:true}).fill('Hire a research specialist who verifies coffee launch assumptions.');await page.getByRole('button',{name:'Design Employee',exact:true}).click();await page.locator('.mc-error').waitFor();assert.equal((await activeAgents()).length,6);assert.match(await page.getByLabel('Hiring request',{exact:true}).inputValue(),/coffee launch/);
   await page.unroute('**/api/agents/design',handler);await page.getByRole('button',{name:'Design Employee',exact:true}).click();await profile().getByRole('heading',{name:'Maya 2',exact:true}).waitFor();dinaId=(await activeAgents()).find(agent=>agent.displayName==='Maya 2').id;assert.equal((await activeAgents()).length,6);assert.equal((await api('/api/agents')).data.agents.length,5);
  });
  await check('Required profile fields, duplicate names and failed saves preserve review edits',async()=>{
   await config();await profile().getByLabel('Display name',{exact:true}).fill('');await profile().getByRole('button',{name:'Save employee settings',exact:true}).click();assert.equal(await profile().getByLabel('Display name',{exact:true}).evaluate(el=>el.validity.valueMissing),true);
   await profile().getByLabel('Display name',{exact:true}).fill('Ari');await profile().getByRole('button',{name:'Save employee settings',exact:true}).click();await page.locator('#mcContent').getByText('Coworker names must be unique in this organization.',{exact:true}).waitFor();assert.equal(await profile().getByLabel('Display name',{exact:true}).inputValue(),'Ari');
   await profile().getByLabel('Display name',{exact:true}).fill('Dina QA');await profile().getByLabel('Role',{exact:true}).fill('Research QA Lead');await profile().getByLabel('Responsibilities, one per line',{exact:true}).fill('Find launch evidence\nCheck claims\nSummarize risks');await profile().getByLabel('Reports to',{exact:true}).selectOption(mayaId);
   const handler=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary employee-save failure. Please retry.'})});await page.route(`**/api/agents/${dinaId}`,handler);
   await profile().getByRole('button',{name:'Save employee settings',exact:true}).click();await page.locator('#mcContent').getByText('Temporary employee-save failure. Please retry.',{exact:true}).waitFor();assert.equal(await profile().getByLabel('Display name',{exact:true}).inputValue(),'Dina QA');assert.equal(await profile().getByLabel('Reports to',{exact:true}).inputValue(),mayaId);await page.unroute(`**/api/agents/${dinaId}`,handler);
  });
  await check('Reviewed employee settings persist, hiring requires approval, and the draft becomes active',async()=>{
   await profile().getByRole('button',{name:'Save employee settings',exact:true}).click();await profile().getByRole('heading',{name:'Dina QA',exact:true}).waitFor();await profile().getByRole('button',{name:'Hire AI Employee',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${dinaId}`)).data.status==='active');
   const saved=(await api(`/api/agents/${dinaId}`)).data;assert.equal(saved.role,'Research QA Lead');assert.deepEqual(saved.responsibilities,['Find launch evidence','Check claims','Summarize risks']);assert.equal(saved.managerAgentId,mayaId);assert.equal(saved.avatar.initials,'DQ');
  });
  await check('Reloaded 3D office uses saved names, roster identities and avatar genders',async()=>{
   await page.reload();await page.waitForFunction(()=>Boolean(window.officeScene));const snapshot=await page.evaluate(()=>window.officeScene.snapshot());assert.equal(snapshot.team.length,6);assert.ok(snapshot.team.some(agent=>agent.name==='Dina QA'));
   const roster=(await api('/api/agents')).data.roster;for(const person of snapshot.team)assert.equal(person.gender,roster.find(agent=>agent.id===person.agentId).gender);
   await page.locator('[data-organa-route="team"]').click();await page.getByRole('heading',{name:'Your AI Team',exact:true}).waitFor();
  });
  await check('Pause, activate, archive and restore work without duplicate lifecycle records',async()=>{
   await selectAgent(dinaId);await profile().getByRole('button',{name:'Pause',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${dinaId}`)).data.status==='paused');
   await profile().getByRole('button',{name:'Activate',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${dinaId}`)).data.status==='active');
   await profile().getByRole('button',{name:'Archive',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${dinaId}`)).data.status==='archived');
   await profile().getByRole('button',{name:'Restore & Activate',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${dinaId}`)).data.status==='active');
   const events=(await api('/api/events?limit=120')).data.filter(event=>event.entity?.id===dinaId);assert.equal(events.filter(event=>event.type==='agent.paused').length,1);assert.equal(events.filter(event=>event.type==='agent.archived').length,1);assert.equal(events.filter(event=>event.type==='agent.hired').length,1);
  });
  await check('Archiving a manager repairs its reports and archived profiles can be reviewed and restored',async()=>{
   if((await api(`/api/agents/${dinaId}`)).data.status==='archived'){await profile().getByRole('button',{name:'Restore & Activate',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${dinaId}`)).data.status==='active');}
   await selectAgent(mayaId);await profile().getByRole('button',{name:'Archive',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${mayaId}`)).data.status==='archived');assert.equal((await api(`/api/agents/${dinaId}`)).data.managerAgentId,(await activeAgents()).find(agent=>/chief of staff/i.test(agent.role)).id);
   await profile().getByRole('button',{name:'Restore & Activate',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${mayaId}`)).data.status==='active');
  });
  await check('Mobile coworker selection brings the profile into view and every navigation tab remains reachable',async()=>{
   await tab('team');await selectAgent(mayaId);let release;const gate=new Promise(resolve=>release=resolve),handler=async route=>{const response=await route.fetch();await gate;await route.fulfill({response});};await page.route(`**/api/agents/${mayaId}/pause`,handler);await profile().getByRole('button',{name:'Pause',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${mayaId}`)).data.status==='paused');
   await page.setViewportSize({width:390,height:844});await selectAgent(dinaId);release();await eventually(async()=>{const box=await profile().boundingBox();return box&&box.y<240&&box.y>=70;});await page.locator('#mcStatus').getByText('Employee status saved. Reload the office to update the 3D roster.',{exact:true}).waitFor();assert.equal(await profile().getAttribute('data-agent-id'),dinaId);await eventually(async()=>{const box=await profile().boundingBox();return box&&box.y<240&&box.y>=70;});await page.unroute(`**/api/agents/${mayaId}/pause`,handler);await config();assert.ok(await profile().getByLabel('Display name',{exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=16);await shot('team-profile-mobile.png');
   await tab('settings');assert.equal(await page.locator('#missionHeading').textContent(),'AI Settings');await tab('team');await page.setViewportSize({width:1440,height:960});await selectAgent(mayaId);await profile().getByRole('button',{name:'Activate',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${mayaId}`)).data.status==='active');
  });
  await check('Overview North Star edits stay drafts, retain failed saves, and recover from activation errors',async()=>{
   await tab('company');const before=(await api('/api/company')).data.northStar,newMission='Run a bounded Jakarta pilot with evidence and human approval.';await page.getByRole('button',{name:'Edit as new version',exact:true}).click();await page.getByLabel('Mission',{exact:true}).fill('');await page.getByRole('button',{name:'Save draft version',exact:true}).click();assert.equal(await page.getByLabel('Mission',{exact:true}).evaluate(el=>el.validity.valueMissing),true);await page.getByLabel('Mission',{exact:true}).fill(newMission);
   const failedSave=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'North Star save unavailable. Please retry.'})});await page.route('**/api/north-star/versions',failedSave);await page.getByRole('button',{name:'Save draft version',exact:true}).click();await page.locator('#mcContent').getByText('North Star save unavailable. Please retry.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Mission',{exact:true}).inputValue(),newMission);await page.unroute('**/api/north-star/versions',failedSave);await page.getByRole('button',{name:'Save draft version',exact:true}).click();
   const version=before.version+1;await page.getByRole('button',{name:`Activate v${version}`,exact:true}).waitFor();assert.equal((await api('/api/company')).data.northStar.mission,before.mission);await delay(3200);assert.equal(await page.getByRole('button',{name:`Activate v${version}`,exact:true}).isVisible(),true);
   const failedActivate=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'North Star activation unavailable. Please retry.'})});await page.route(`**/api/north-star/versions/${version}/activate`,failedActivate);await page.getByRole('button',{name:`Activate v${version}`,exact:true}).click();await page.locator('#mcContent').getByText('North Star activation unavailable. Please retry.',{exact:true}).waitFor();assert.equal((await api('/api/company')).data.northStar.version,before.version);assert.equal(await page.getByRole('button',{name:`Activate v${version}`,exact:true}).isEnabled(),true);await page.unroute(`**/api/north-star/versions/${version}/activate`,failedActivate);await page.getByRole('button',{name:`Activate v${version}`,exact:true}).click();await eventually(async()=> (await api('/api/company')).data.northStar.version===version);await page.getByRole('button',{name:'Edit as new version',exact:true}).waitFor();
  });
  await check('An actual mission creates dependencies and an approval before the meeting runs',async()=>{
   await tab('mission');await page.getByLabel('What do you need the organization to solve?',{exact:true}).fill(goal);await page.getByRole('button',{name:'Plan with Chief of Staff',exact:true}).click();await page.getByRole('button',{name:'Start Mission',exact:true}).click();
   await eventually(async()=> (await api('/api/meetings')).data.length===1);meetingId=(await api('/api/meetings')).data[0].id;
   await tab('review');await page.getByRole('button',{name:'Approve',exact:true}).click();await eventually(async()=> (await api('/api/tasks')).data.every(task=>task.status==='done'));assert.equal((await api('/api/meetings')).data[0].status,'scheduled');
  });
  await check('A paused meeting participant disables starting and offers a route back to Team',async()=>{
   await tab('team');await selectAgent(mayaId);await profile().getByRole('button',{name:'Pause',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${mayaId}`)).data.status==='paused');await tab('meetings');assert.equal(await meeting().getByRole('button',{name:'Start cross-functional meeting',exact:true}).isDisabled(),true);await meeting().getByRole('button',{name:'Open Team',exact:true}).click();await selectAgent(mayaId);await profile().getByRole('button',{name:'Activate',exact:true}).click();await eventually(async()=> (await api(`/api/agents/${mayaId}`)).data.status==='active');await tab('meetings');
  });
  await check('A failed meeting request shows a recoverable error and can be retried',async()=>{
   const handler=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary meeting outage. Please retry.'})});await page.route(`**/api/meetings/${meetingId}/start`,handler);await meeting().getByRole('button',{name:'Start cross-functional meeting',exact:true}).click();await page.locator('#mcContent').getByText('Temporary meeting outage. Please retry.',{exact:true}).waitFor();assert.equal(await meeting().getByRole('button',{name:'Start cross-functional meeting',exact:true}).isEnabled(),true);await page.unroute(`**/api/meetings/${meetingId}/start`,handler);
  });
  await check('A running meeting keeps busy state and persisted participants drive the live 3D office',async()=>{
   await meeting().getByRole('button',{name:'Start cross-functional meeting',exact:true}).click();await eventually(async()=> (await api(`/api/meetings/${meetingId}`)).data.status==='in_progress');
   await page.waitForFunction(id=>window.officeScene?.snapshot().team.some(agent=>agent.meetingId===id),meetingId,{timeout:12000});await delay(1600);
   if((await api(`/api/meetings/${meetingId}`)).data.status==='in_progress')assert.equal(await meeting().getByRole('button',{name:'Meeting in progress…',exact:true}).isDisabled(),true);
   await meeting().getByRole('button',{name:'Approve decision',exact:true}).waitFor();const saved=(await api(`/api/meetings/${meetingId}`)).data;assert.equal(saved.contributions.length,saved.participantAgentIds.length);assert.equal(saved.status,'review');oldApprovalId=saved.approvalId;
  });
  await check('Meeting review exposes specialist perspectives, synthesis and the saved decision record',async()=>{
   await meeting().getByText('Specialist perspectives · 3',{exact:true}).click();assert.equal(await meeting().locator('.mc-meeting-contributions section').count(),3);await meeting().locator('.mc-meeting-contributions').evaluate(el=>el.dataset.qaRetained='yes');await delay(3300);assert.equal(await meeting().locator('.mc-meeting-contributions').getAttribute('open'),'');assert.equal(await meeting().locator('.mc-meeting-contributions').getAttribute('data-qa-retained'),'yes');await meeting().getByText('Decision record',{exact:true}).click();assert.match(await meeting().locator('.mc-deliverable').textContent(),/Recommendations:/);await meeting().getByText('Decision record',{exact:true}).click();await meeting().scrollIntoViewIfNeeded();await shot('meeting-review-desktop.png');
  });
  await check('Inline meeting revision validates feedback and preserves it after a failed save',async()=>{
   await meeting().getByRole('button',{name:'Request revision',exact:true}).click();assert.equal(await meeting().getByRole('button',{name:'Send revision request',exact:true}).isDisabled(),true);await meeting().getByLabel('Revision feedback',{exact:true}).fill(revision);
   const handler=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary review failure. Please retry.'})});await page.route(`**/api/meetings/${meetingId}/request-revision`,handler);await meeting().getByRole('button',{name:'Send revision request',exact:true}).click();await page.locator('#mcContent').getByText('Temporary review failure. Please retry.',{exact:true}).waitFor();assert.equal(await meeting().getByLabel('Revision feedback',{exact:true}).inputValue(),revision);await page.unroute(`**/api/meetings/${meetingId}/request-revision`,handler);
   await meeting().getByRole('button',{name:'Send revision request',exact:true}).click();await meeting().getByRole('button',{name:'Run revised meeting',exact:true}).waitFor();assert.equal((await api(`/api/meetings/${meetingId}`)).data.reviewNote,revision);
  });
  await check('The revised result includes owner feedback and rejects approval of the previous decision',async()=>{
   await meeting().getByRole('button',{name:'Run revised meeting',exact:true}).click();await meeting().getByRole('button',{name:'Approve decision',exact:true}).waitFor();const saved=(await api(`/api/meetings/${meetingId}`)).data;assert.notEqual(saved.approvalId,oldApprovalId);assert.match(saved.result.summary,/Jakarta-only/);assert.equal((await api(`/api/approvals/${oldApprovalId}/approve`,'POST',{})).status,409);
   await page.setViewportSize({width:390,height:844});await meeting().scrollIntoViewIfNeeded();await shot('meeting-review-mobile.png');await page.setViewportSize({width:1440,height:960});
  });
  await check('Performance and evaluation show recorded totals, mission completion and saved coworker criteria',async()=>{
   await tab('performance');const tasks=(await api('/api/tasks')).data,projects=(await api('/api/projects')).data,usage=(await api('/api/usage/summary')).data,agents=await activeAgents();const counts=await page.locator('.mc-performance-stats .mc-hero-stat').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.querySelector('span').textContent,Number(row.querySelector('strong').textContent)])));assert.equal(counts['tasks completed'],tasks.filter(task=>task.status==='done').length);assert.equal(counts['model calls'],usage.requests);assert.equal(counts.deliverables,(await api('/api/deliverables')).data.length);
   for(const project of projects){const mine=tasks.filter(task=>task.projectId===project.id),done=mine.filter(task=>task.status==='done').length,pct=mine.length?Math.round(done/mine.length*100):0;assert.equal(await page.locator(`.mc-performance-row[data-project-id="${project.id}"] [role="progressbar"]`).getAttribute('aria-valuenow'),String(pct));}
   const agent=agents.find(agent=>agent.evaluationCriteria?.length),entry=page.locator(`[data-evaluation-agent-id="${agent.id}"]`);await entry.getByText('Evaluation criteria',{exact:true}).click();assert.deepEqual(await entry.locator('li').allTextContents(),agent.evaluationCriteria);await delay(3300);assert.equal(await entry.locator('details').getAttribute('open'),'');await entry.getByText('Evaluation criteria',{exact:true}).click();await page.locator('#mcContent').evaluate(el=>el.scrollTop=0);await shot('evaluation-desktop.png');
  });
  await check('Stand-up covers completed work, the meeting decision and the pending owner approval',async()=>{
   await tab('standup');await page.getByRole('button',{name:'Start Stand-Up',exact:true}).click();await page.getByRole('button',{name:'Open approval →',exact:true}).waitFor();const brief=(await api('/api/standups/latest')).data;assert.equal(brief.summary.completed.length,4);assert.ok(brief.summary.decisions.some(item=>item.ref===`meeting:${meetingId}`));assert.equal(brief.summary.needsAttention.length,1);assert.equal(brief.generation.mode,'deterministic');await shot('standup-desktop.png');
  });
  await check('A stand-up task source focuses its real saved result in a popup without a sidebar',async()=>{
   const brief=(await api('/api/standups/latest')).data,source=brief.summary.completed[0],id=source.ref.split(':')[1],task=(await api('/api/tasks')).data.find(task=>task.id===id);await page.locator('.mc-standup-section').filter({has:page.getByRole('heading',{name:'Completed · 4',exact:true})}).getByRole('button',{name:'Open task →',exact:true}).first().click();await page.locator('#taskDialog').waitFor();await page.locator(`#taskList [data-task-id="${id}"]`).waitFor();assert.equal(await page.evaluate(()=>document.activeElement.dataset.taskId),id);assert.equal((await page.locator(`#taskList [data-task-id="${id}"] > .task-result`).textContent()).replace(/\s+/g,' ').trim(),task.result.replace(/\s+/g,' ').trim());assert.equal(await page.locator('#taskDialog nav,#taskDialog #appSidebar').count(),0);await page.locator('#closeTasks').click();assert.equal(await page.locator('#missionHeading').textContent(),'Morning Stand-up');assert.equal(await page.locator('.mc-standup').isVisible(),true);
  });
  await check('A stand-up source opens Approval Center and approval resolves the matching meeting and deliverable',async()=>{
   await page.getByRole('button',{name:'Open approval →',exact:true}).click();assert.equal(await page.locator('#missionHeading').textContent(),'Approval Center');
   let release;const gate=new Promise(resolve=>release=resolve),handler=async route=>{await gate;await route.continue();};await page.route('**/api/approvals/*/approve',handler);await page.getByRole('button',{name:'Approve',exact:true}).click();await delay(3300);assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).isDisabled(),true);await tab('team');release();await eventually(async()=> (await api(`/api/meetings/${meetingId}`)).data.status==='completed');await delay(150);assert.equal(await page.locator('#missionHeading').textContent(),'Your AI Team');assert.equal(await page.locator('[data-approval-id]').count(),0);await page.unroute('**/api/approvals/*/approve',handler);
   const saved=(await api(`/api/meetings/${meetingId}`)).data;assert.equal((await api(`/api/deliverables/${saved.deliverableId}`)).data.status,'approved');assert.equal((await api('/api/approvals?status=pending')).data.length,0);
   await tab('standup');await page.getByRole('button',{name:'Refresh Stand-Up',exact:true}).click();await eventually(async()=> (await api('/api/standups/latest')).data.summary.needsAttention.length===0);await page.getByText('No pending reviews.',{exact:true}).waitFor();
  });
  await check('The latest stand-up survives reload and a failed refresh preserves the previous brief',async()=>{
   const before=(await api('/api/standups/latest')).data;await page.reload();await page.locator('[data-organa-route="standup"]').click();await page.getByText(before.summary.headline,{exact:true}).waitFor();
   const handler=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Stand-up temporarily unavailable. Retry.'})});await page.route('**/api/standups/generate',handler);await page.getByRole('button',{name:'Refresh Stand-Up',exact:true}).click();await page.locator('#mcContent').getByText('Stand-up temporarily unavailable. Retry.',{exact:true}).waitFor();assert.equal((await api('/api/standups/latest')).data.id,before.id);assert.equal(await page.getByText(before.summary.headline,{exact:true}).isVisible(),true);await page.unroute('**/api/standups/generate',handler);await page.getByRole('button',{name:'Refresh Stand-Up',exact:true}).click();await eventually(async()=> (await api('/api/standups/latest')).data.id!==before.id);
  });
  await check('Slow stand-up stays busy across refresh intervals and cannot overwrite the selected Team view',async()=>{
   let release;const gate=new Promise(resolve=>release=resolve),handler=async route=>{await gate;await route.continue();};await page.route('**/api/standups/generate',handler);await page.getByRole('button',{name:'Refresh Stand-Up',exact:true}).click();await delay(3300);assert.equal(await page.getByRole('button',{name:'Preparing…',exact:true}).isDisabled(),true);
   await tab('team');const response=page.waitForResponse(r=>r.url().endsWith('/api/standups/generate'));release();await response;await delay(100);assert.equal(await page.locator('#missionHeading').textContent(),'Your AI Team');assert.equal(await page.locator('.mc-standup').count(),0);await page.unroute('**/api/standups/generate',handler);await tab('standup');await page.locator('.mc-standup').waitFor();
  });
  await check('Verified fallback is clearly labeled and keeps the source-backed owner brief usable',async()=>{
   const saved=(await api('/api/standups/latest')).data;const handler=route=>route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({...saved,generation:{mode:'deterministic-fallback',degraded:true}})});await page.route('**/api/standups/generate',handler);await page.getByRole('button',{name:'Refresh Stand-Up',exact:true}).click();await page.locator('.mc-standup-notice').waitFor();assert.match(await page.locator('.mc-standup-notice').textContent(),/stored tasks/);await page.unroute('**/api/standups/generate',handler);
  });
  await check('A saved collapsed sidebar adapts to the mobile navigation and keeps Overview and Evaluation accessible',async()=>{
   await page.setViewportSize({width:1440,height:960});await page.locator('#sidebarToggle').click();assert.equal(await page.locator('#sidebarToggle').getAttribute('aria-pressed'),'true');await tab('company');const rail=await page.locator('#appSidebar').boundingBox(),workspace=await page.locator('#missionDialog').boundingBox();assert.ok(workspace.x>=rail.x+rail.width);
   await page.setViewportSize({width:390,height:844});await page.reload();await tab('company');assert.equal(await page.locator('#brand').isVisible(),false);await shot('overview-mobile.png');await tab('performance');await shot('evaluation-mobile.png');await tab('settings');await page.setViewportSize({width:1440,height:960});await page.locator('#sidebarToggle').click();assert.equal(await page.locator('#sidebarToggle').getAttribute('aria-pressed'),'false');
  });
  await check('Every workspace layout stays within phone, tablet and desktop viewports without popup navigation',async()=>{
   for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:width<500?844:960});for(const name of ['company','team','mission','meetings','knowledge','review','standup','goals','performance','settings']){await tab(name);assert.equal(await page.locator('#mcContent').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`${name} overflows at ${width}px`);assert.equal(await page.locator('dialog nav,dialog [data-mc-tab]').count(),0);}}
   await page.setViewportSize({width:390,height:844});await tab('standup');await page.locator('#mcContent').evaluate(el=>el.scrollTop=0);await shot('standup-mobile.png');
  });
  await check('No uncaught browser errors across team, meeting and stand-up workflows',async()=>assert.deepEqual(errors,[]));
  fs.writeFileSync(path.join(output,'workflows-e2e-results.json'),JSON.stringify({passed:checks.length,checks,browser:browser.version(),mode:'deterministic',uncaughtErrors:errors},null,2));console.log(`Completed ${checks.length} workflow browser checks.`);
 }catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
 finally{if(browser)await browser.close();if(runtime)await runtime.cleanup();}
})().catch(error=>{console.error(error);process.exitCode=1;});
