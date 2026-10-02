const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4197;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kantor-ai-test-'));
let server;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(route, {method='GET', body, expected} = {}) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: body === undefined ? undefined : {'content-type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  const raw = await response.text();
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (expected !== undefined) assert.equal(response.status, expected, `${method} ${route}: ${raw}`);
  else assert.ok(response.ok, `${method} ${route} returned ${response.status}: ${raw}`);
  return {status: response.status, body: payload};
}

async function waitUntil(label, fn, timeoutMs=10000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(last)}`);
}

async function waitForServer() {
  await waitUntil('server readiness', async () => {
    try {
      const r = await request('/api/health');
      return r.body?.status === 'ok' ? r.body : null;
    } catch { return null; }
  }, 8000);
}

function byTitle(items, title) { return items.find(item => item.title === title); }

async function main() {
  server = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      ENV_FILE: '/nonexistent',
      KANTOR_STORAGE: 'json',
      KANTOR_DRY_RUN: '1',
      DRY_RUN_DELAY_MS: '15',
      KANTOR_ENABLE_DEMO_RESET: '1',
      GEMINI_API_KEY: '',
      GOOGLE_API_KEY: '',
      GOOGLE_CLOUD_PROJECT: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr='';
  server.stderr.on('data', chunk => { stderr += chunk; });
  server.stdout.on('data', () => {});
  await waitForServer();

  // 1. Provider boundary + local fallback are healthy.
  const health = (await request('/api/health')).body;
  assert.equal(health.provider, 'dry-run');
  assert.equal(health.storage, 'json');
  assert.equal(health.version, '3.8.0-organa');
  const llmSettings = (await request('/api/llm/settings')).body;
  assert.equal(llmSettings.provider, 'dry-run');
  assert.ok(llmSettings.providers.some(p => p.id === 'vertex'));
  assert.ok(llmSettings.providers.some(p => p.id === 'openai'));
  assert.ok(llmSettings.providers.some(p => p.id === 'anthropic'));

  // 2. Company Architect proposes an editable company/team/North Star and only activates on human action.
  const proposal = (await request('/api/company-bootstrap/proposals', {
    method:'POST',
    body:{name:'Spec Test Studio', description:'A small AI-native services company that needs research, marketing and finance support.'},
    expected:201,
  })).body;
  assert.equal(proposal.status, 'draft');
  assert.ok(proposal.proposal.recommendedTeam.length >= 3);
  assert.ok(proposal.proposal.recommendedTeam.some(r => /chief of staff/i.test(r.role)));
  const activated = (await request(`/api/company-bootstrap/proposals/${proposal.id}/activate`, {
    method:'POST',
    body:{companyName:'Spec Test Studio', hardConstraints:['No external publishing without human approval']},
  })).body;
  assert.equal(activated.company.name, 'Spec Test Studio');
  assert.ok(activated.agents.every(a => a.status === 'active'));
  assert.ok(activated.northStar.constraints.some(c => /human approval/i.test(c.text)));

  // 3. Team Builder can create a role without editing code; the role is a draft until explicitly activated.
  const designed = (await request('/api/agents/design', {
    method:'POST', body:{request:'Hire a competitor research specialist who supports the Chief of Staff.'}, expected:201,
  })).body;
  assert.equal(designed.status, 'draft');
  assert.match(designed.role, /research/i);
  const hired = (await request(`/api/agents/${designed.id}/activate`, {method:'POST', body:{}})).body;
  assert.equal(hired.status, 'active');

  // 3b. Templates follow the same proposal/review path rather than auto-installing privileges.
  const templates = (await request('/api/company-bootstrap/templates')).body;
  assert.ok(templates.length >= 5);
  const templateProposal = (await request(`/api/company-bootstrap/templates/${templates[0].id}/proposal`, {
    method:'POST', body:{name:'Template Test Co', goal:'Prepare a new product launch plan.'}, expected:201,
  })).body;
  assert.equal(templateProposal.status, 'draft');
  assert.equal(templateProposal.source.type, 'template');
  assert.ok(templateProposal.proposal.recommendedTeam.length >= 3);

  // 3c. North Star and role prompts are versioned, and the next run records the versions it used.
  const activeNorth = (await request('/api/north-star')).body;
  const northDraft = (await request('/api/north-star/versions', {method:'POST', body:{mission:`${activeNorth.mission} Versioned`,changeNote:'Acceptance test version'}})).body;
  assert.equal(northDraft.status, 'draft');
  assert.notEqual((await request('/api/north-star')).body.version, northDraft.version, 'Draft North Star must not silently replace active policy.');
  const northActive = (await request(`/api/north-star/versions/${northDraft.version}/activate`, {method:'POST',body:{}})).body;
  assert.equal(northActive.status, 'active');
  const editedAgent = (await request(`/api/agents/${hired.id}`, {method:'PATCH',body:{systemPrompt:`${hired.systemPrompt} Use explicit evidence labels.`}})).body;
  assert.ok(editedAgent.promptVersion >= 2);
  const manualTask = (await request('/api/tasks', {method:'POST',body:{title:'Verify prompt version trace',assigneeAgentId:editedAgent.id,brief:'Create a concise evidence-aware research note for the current company goal.',approvalPolicy:'none'},expected:201})).body;
  const completedManual = await waitUntil('version-traced manual task', async()=>{const t=(await request(`/api/tasks/${manualTask.id}`)).body;return t.status==='done'?t:null;},8000);
  assert.equal(completedManual.agentPromptVersionUsed, editedAgent.promptVersion);
  assert.equal(completedManual.northStarVersionUsed, northDraft.version);
  const manualWhy=(await request(`/api/deliverables/${completedManual.deliverableId}/why`)).body;
  assert.equal(manualWhy.agentPromptVersion, editedAgent.promptVersion);
  assert.equal(manualWhy.northStarVersion, northDraft.version);

  // Reset into the bounded Nusa Coffee scenario used by the acceptance demo.
  const demo = (await request('/api/demo/reset', {method:'POST', body:{}})).body;
  assert.equal(demo.company.name, 'Nusa Coffee');
  assert.equal(demo.agents.length, 5);
  assert.ok(demo.agents.some(a => /chief of staff/i.test(a.role)));
  const companyState = (await request('/api/company')).body;
  assert.ok(companyState.northStar.constraints.some(c => /25,?000,?000|25m/i.test(c.text)));

  // 4. One company-level mission produces a bounded dependency-aware task graph.
  const project = (await request('/api/projects/plan', {
    method:'POST',
    body:{goal:'Launch Nusa Coffee in Jakarta with a maximum launch marketing budget of IDR 25,000,000 and prepare an owner-ready execution package.'},
    expected:201,
  })).body;
  assert.equal(project.status, 'draft_plan');
  assert.equal(project.planDraft.tasks.length, 4);
  assert.equal(project.planDraft.meetings.length, 1);
  const planT2 = byTitle(project.planDraft.tasks, 'Draft market and communication strategy');
  const planT3 = byTitle(project.planDraft.tasks, 'Check budget and operating constraints');
  const planT4 = byTitle(project.planDraft.tasks, 'Define launch execution package');
  assert.deepEqual(planT2.dependsOn, ['t1']);
  assert.deepEqual(planT3.dependsOn, ['t1']);
  assert.deepEqual(new Set(planT4.dependsOn), new Set(['t2','t3']));
  assert.equal(planT4.approvalPolicy, 'review_output');

  const activation = (await request(`/api/projects/${project.id}/activate-plan`, {method:'POST', body:{}})).body;
  assert.equal(activation.tasks.length, 4);
  assert.equal(activation.meetings.length, 1);
  const graph = (await request(`/api/projects/${project.id}/graph`)).body;
  assert.equal(graph.edges.length, 4);

  // 5. Specialists execute, dependencies release deterministically, and the final task stops for human review.
  const finalTasks = await waitUntil('mission tasks to reach their expected terminal/review states', async () => {
    const tasks = (await request('/api/tasks')).body.filter(t => t.projectId === project.id);
    const t1=byTitle(tasks,'Build evidence brief'), t2=byTitle(tasks,'Draft market and communication strategy'), t3=byTitle(tasks,'Check budget and operating constraints'), t4=byTitle(tasks,'Define launch execution package');
    if (t1?.status==='done' && t2?.status==='done' && t3?.status==='done' && t4?.status==='review') return {tasks,t1,t2,t3,t4};
    return null;
  }, 12000);
  assert.ok(finalTasks.t1.deliverableId && finalTasks.t2.deliverableId && finalTasks.t3.deliverableId && finalTasks.t4.deliverableId);
  assert.notEqual(finalTasks.t2.assigneeAgentId, finalTasks.t3.assigneeAgentId, 'Marketing and finance should be handled by different specialists in the demo.');

  // Dependency order is backed by append-only events, not just UI labels.
  const chronologicalEvents = (await request('/api/events?limit=500')).body.slice().reverse();
  const indexOf = (type, id) => chronologicalEvents.findIndex(e => e.type===type && e.entity?.id===id);
  const t1Completed = indexOf('task.completed', finalTasks.t1.id);
  const t2Started = indexOf('task.started', finalTasks.t2.id);
  const t3Started = indexOf('task.started', finalTasks.t3.id);
  const t2Completed = indexOf('task.completed', finalTasks.t2.id);
  const t3Completed = indexOf('task.completed', finalTasks.t3.id);
  const t4Started = indexOf('task.started', finalTasks.t4.id);
  assert.ok(t1Completed >= 0 && t2Started > t1Completed && t3Started > t1Completed, 'Dependent strategy/finance work must start only after research completes.');
  assert.ok(t4Started > t2Completed && t4Started > t3Completed, 'Final execution work must start only after both strategy and finance complete.');

  // 6. The scheduled meeting cannot run before its inputs, then produces independent contributions + durable decision record.
  const meeting = (await request('/api/meetings')).body.find(m => m.projectId===project.id);
  assert.ok(meeting);
  assert.ok(meeting.participantAgentIds.length >= 2 && meeting.participantAgentIds.length <= 4);
  const meetingResult = (await request(`/api/meetings/${meeting.id}/start`, {method:'POST', body:{}})).body;
  assert.equal(meetingResult.status, 'review');
  assert.ok(meetingResult.contributions.length >= 2);
  assert.ok(new Set(meetingResult.contributions.map(c => c.agentId)).size >= 2);
  assert.ok(meetingResult.deliverableId);
  assert.ok(meetingResult.approvalId);

  // 7. The Why panel has provenance: goal, evidence, hard constraints, collaborators and assumptions.
  const why = (await request(`/api/deliverables/${meetingResult.deliverableId}/why`)).body;
  assert.ok(why.goals.length >= 1);
  assert.ok(why.evidenceRefs.length >= 2);
  assert.ok(why.constraints.some(c => c.severity === 'hard'));
  assert.ok(why.collaborators.length >= 2);
  assert.ok(why.assumptions.length >= 1);
  assert.ok(why.decisionSummary);

  // 8. Human approval gates close the loop for both task output and meeting decision.
  const pending = (await request('/api/approvals?status=pending')).body;
  const taskApproval = pending.find(a => a.entityType==='task' && a.entityId===finalTasks.t4.id);
  const meetingApproval = pending.find(a => a.entityType==='meeting' && a.entityId===meeting.id);
  assert.ok(taskApproval && meetingApproval);
  const approvedTask = (await request(`/api/approvals/${taskApproval.id}/approve`, {method:'POST', body:{note:'Owner approved.'}})).body;
  assert.equal(approvedTask.status, 'done');
  const approvedMeeting = (await request(`/api/approvals/${meetingApproval.id}/approve`, {method:'POST', body:{note:'Owner approved the decision record.'}})).body;
  assert.equal(approvedMeeting.status, 'completed');
  const projectAfter = (await request(`/api/projects/${project.id}`)).body;
  assert.equal(projectAfter.status, 'completed');

  // 9. Stand-up is generated from stored execution state/events, not invented office chatter.
  const standup = (await request('/api/standups/generate', {method:'POST', body:{}, expected:201})).body;
  assert.ok(standup.snapshot.completed.length >= 4);
  assert.ok(standup.snapshot.decisions.some(d => d.ref === `meeting:${meeting.id}`));
  assert.ok(standup.summary.headline);
  assert.ok(standup.summary.completed.length >= 1);

  // 10. Cloud-facing usage instrumentation and static app surface are present.
  const usage = (await request('/api/usage/summary')).body;
  assert.ok(typeof usage === 'object');
  const home = await fetch(`${BASE}/`);
  const html = await home.text();
  assert.equal(home.status, 200);
  assert.match(html, /Organa/i);
  assert.match(html, /Build your company/i);
  assert.match(html, /organa-demo\.mp4/i);
  assert.match(html, /app\?onboarding=1/i);
  assert.match(html, /organa-design-system\.css/i);
  assert.match(html, /AI Chief of Staff/i);
  assert.doesNotMatch(html, />Pricing</i);
  const appHome = await fetch(`${BASE}/app?onboarding=1`);
  const appHtml = await appHome.text();
  assert.equal(appHome.status, 200);
  assert.match(appHtml, /Mission Control/i);
  assert.match(appHtml, /mission-control\.js/);
  assert.match(appHtml, /organa-design-system\.css/i);

  console.log('PASS: company builder, dynamic hiring, Chief of Staff DAG, dependency execution, multi-agent meeting, provenance, approvals, stand-up and Mission Control API flow');
}

main().catch(error => {
  console.error(error.stack || error);
  if (server && !server.killed) server.kill('SIGTERM');
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, {recursive:true, force:true});
  process.exitCode = 1;
}).finally(async () => {
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), sleep(1000)]);
  }
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, {recursive:true, force:true});
});
