const assert = require('node:assert/strict');
const test = require('node:test');
const {startServer} = require('./helpers/server.cjs');
const {specialist} = require('../server/prompts');

const call = async (base, method, route, body) => {
  const response = await fetch(base + route, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  return {status: response.status, data: await response.json().catch(() => ({}))};
};
const until = async (fn, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timed out waiting for state.');
};

test('The specialist prompt includes research notes and sources only when research exists', () => {
  const base = {agent: {role: 'Analyst'}, northStar: {}, task: {title: 'T'}, inputDeliverables: []};
  const plain = specialist(base).messages[0].content;
  assert.ok(!plain.includes('WEB RESEARCH'));
  const withResearch = specialist({...base, research: {text: 'Coffee prices rose 8% in 2026.', sources: [{title: 'example.org', uri: 'https://example.org/a'}]}});
  assert.match(withResearch.messages[0].content, /WEB RESEARCH/);
  assert.match(withResearch.messages[0].content, /\[1\] example\.org https:\/\/example\.org\/a/);
  assert.match(withResearch.system, /cite the sources/);
});

test('Tasks with web research attach sources as evidence; tasks without it do not', async () => {
  const runtime = await startServer({extraEnv: {DRY_RUN_DELAY_MS: '5'}});
  try {
    const {base} = runtime;
    const company = await call(base, 'POST', '/api/company-bootstrap/proposals', {name: 'Research Test', description: 'A small test company', goal: 'Understand the market', stage: 'Early', audience: 'Everyone', constraints: 'Stay within budget', clientRequestId: 'wr-1'});
    assert.equal(company.status, 201);
    await call(base, 'POST', `/api/company-bootstrap/proposals/${company.data.id}/activate`, {});
    const roster = (await call(base, 'GET', '/api/agents')).data.roster.filter(agent => !/chief of staff/i.test(agent.role));
    const make = async (title, webResearch) => {
      const created = await call(base, 'POST', '/api/tasks', {title, brief: 'Summarise the market with current figures for the coming quarter.', assigneeAgentId: roster[0].id, approvalPolicy: 'review_output', webResearch, clientRequestId: `wr-${title}`});
      assert.equal(created.status, 201);
      assert.equal(created.data.webResearch, webResearch);
      const done = await until(async () => { const task = (await call(base, 'GET', `/api/tasks/${created.data.id}`)).data; assert.notEqual(task.status, 'failed', task.error); return task.status === 'review' ? task : null; });
      return (await call(base, 'GET', '/api/deliverables')).data.find(item => item.taskIds.includes(done.id));
    };
    const researched = await make('With research', true);
    assert.ok(researched.why.evidenceRefs.some(ref => ref.includes('https://example.invalid/research')), 'The research sources are recorded as evidence.');
    assert.ok(!researched.why.uncertainties.some(item => /unavailable/i.test(item)));
    const plain = await make('Without research', false);
    assert.ok(!plain.why.evidenceRefs.some(ref => ref.includes('example.invalid')));

    // Same request id with a different research flag is a different request, not a silent reuse.
    const clash = await call(base, 'POST', '/api/tasks', {title: 'With research', brief: 'Summarise the market with current figures for the coming quarter.', assigneeAgentId: roster[0].id, approvalPolicy: 'review_output', webResearch: false, clientRequestId: 'wr-With research'});
    assert.equal(clash.status, 409);

    // A mission with web research passes the flag to every task it creates.
    const project = await call(base, 'POST', '/api/projects/plan', {goal: 'Prepare a short market brief for next quarter.', webResearch: true, clientRequestId: 'wr-mission'});
    assert.equal(project.status, 201);
    assert.equal(project.data.webResearch, true);
    assert.equal((await call(base, 'POST', `/api/projects/${project.data.id}/activate-plan`, {})).status, 200);
    const tasks = (await call(base, 'GET', '/api/tasks')).data.filter(task => task.projectId === project.data.id);
    assert.ok(tasks.length >= 1 && tasks.every(task => task.webResearch === true));
  } finally { await runtime.cleanup(); }
});
