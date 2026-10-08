const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const {startServer} = require('./helpers/server.cjs');
const {BootstrapService} = require('../server/services/bootstrap-service');
const {StateManager} = require('../server/services/state-manager');
const {EventService} = require('../server/services/event-service');
const {DryRunProvider} = require('../server/ai/dry-run-provider');
const {createDefaultState} = require('../server/data/default-state');

async function serviceFixture(provider) {
  let failSave = false;
  const stateManager = new StateManager({load: async () => createDefaultState(), save: async () => { if (failSave) throw new Error('Simulated storage failure'); }});
  await stateManager.init();
  const service = new BootstrapService({stateManager, provider: provider || new DryRunProvider({dryRunDelayMs: 10}), eventService: new EventService(stateManager), usageService: {record() {}}, config: {}});
  return {service, stateManager, setSaveFailure: value => { failSave = value; }};
}

const post = async (base, route, body) => {
  const response = await fetch(base + route, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  return {status: response.status, body: await response.json()};
};

function assertHierarchy(agents) {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const chiefs = agents.filter(agent => /chief of staff/i.test(agent.role));
  assert.equal(chiefs.length, 1);
  assert.equal(chiefs[0].managerAgentId, null);
  for (const agent of agents.filter(item => item !== chiefs[0])) {
    assert.ok(byId.has(agent.managerAgentId), 'Every specialist reports to a selected coworker.');
    const seen = new Set([agent.id]);
    let cursor = byId.get(agent.managerAgentId);
    while (cursor) {
      assert.ok(!seen.has(cursor.id), 'Reporting lines must not contain a cycle.');
      seen.add(cursor.id);
      cursor = byId.get(cursor.managerAgentId);
    }
    assert.ok(seen.has(chiefs[0].id), 'Every specialist reaches the Chief of Staff.');
  }
}

(async () => {
  await test('API rejects empty or malformed setup before generating a draft', async () => {
    const {service} = await serviceFixture({generate() { throw new Error('Must not reach the model'); }});
    for (const input of [null, [], {}, {goal: '   '}, {name: 42, goal: 'Launch'}, {goal: 'Launch', constraints: [{}]}]) {
      await assert.rejects(() => service.propose(input), error => error.status === 400);
    }
    await assert.rejects(() => service.fromTemplate('missing', {}), error => error.status === 404);
  });

  await test('Scratch preserves the exact requested outcome and constraints in demo mode', async () => {
    const {service} = await serviceFixture();
    const goal = 'Research Indonesian invoice automation and prepare a decision brief in 14 days.';
    const constraint = 'Research budget must not exceed IDR 8,000,000';
    const draft = await service.propose({name: 'Named by the owner', goal, constraints: constraint});
    assert.equal(draft.proposal.companyProfile.name, 'Named by the owner');
    assert.equal(draft.proposal.initialGoals[0].description, goal);
    assert.ok(draft.proposal.northStarDraft.hardConstraints.includes(constraint));
    const result = await service.activate(draft.id);
    assert.equal(result.goals[0].description, goal);
    assert.ok(result.northStar.constraints.some(item => item.text === constraint));
    assertHierarchy(result.agents);
  });

  await test('Every starter template stays a draft until approval and supports defaults or customization', async () => {
    const {service, stateManager} = await serviceFixture();
    for (const template of service.listTemplates()) {
      const originalCompany = stateManager.companyId();
      const defaultDraft = await service.fromTemplate(template.id, {name: '   ', goal: '   '});
      assert.equal(defaultDraft.status, 'draft');
      assert.equal(defaultDraft.proposal.companyProfile.name, 'New Organization');
      assert.ok(defaultDraft.proposal.initialGoals[0].description.trim());
      assert.equal(stateManager.companyId(), originalCompany);
      const customized = await service.fromTemplate(template.id, {name: 'Custom team', goal: 'Deliver a 30-day execution plan.', constraints: ['No purchases above IDR 1,000,000']});
      assert.equal(customized.proposal.initialGoals[0].description, 'Deliver a 30-day execution plan.');
      assert.ok(customized.proposal.northStarDraft.hardConstraints.includes('No purchases above IDR 1,000,000'));
      assertHierarchy((await service.activate(customized.id)).agents);
    }
  });

  await test('Concurrent generation retries return one draft and make only one model call', async () => {
    const provider = new DryRunProvider({dryRunDelayMs: 30});
    let calls = 0;
    const original = provider.generate.bind(provider);
    provider.generate = async input => { calls++; return original(input); };
    const {service, stateManager} = await serviceFixture(provider);
    const input = {name: 'Safe retries', goal: 'Prepare a market research brief.', clientRequestId: 'same-request'};
    const drafts = await Promise.all([service.propose(input), service.propose(input), service.propose(input)]);
    assert.equal(new Set(drafts.map(draft => draft.id)).size, 1);
    assert.equal(calls, 1);
    assert.equal(stateManager.get().bootstrapProposals.length, 1);
    await assert.rejects(() => service.propose({...input, goal: 'Different work'}), error => error.status === 409);
  });

  await test('Activation requires an identified team and exactly one coordinator', async () => {
    const {service, stateManager} = await serviceFixture();
    const draft = await service.fromTemplate('tpl_startup_launch');
    const originalCount = stateManager.get().companies.length;
    const chief = draft.proposal.recommendedTeam.find(role => /chief of staff/i.test(role.role));
    const cases = [
      {companyName: ' '}, {companyName: null}, {mission: ' '},
      {team: draft.proposal.recommendedTeam.map(role => ({tempId: role.tempId, enabled: false}))},
      {team: [{tempId: chief.tempId, enabled: false}]},
      {team: [{tempId: 'unknown'}]}, {team: [{tempId: chief.tempId}, {tempId: chief.tempId}]},
      {team: [{tempId: chief.tempId, enabled: 'false'}]},
      {team: [{tempId: chief.tempId, displayNameSuggestion: '   '}]},
      {team: [{tempId: draft.proposal.recommendedTeam[1].tempId, role: 'Chief of Staff'}]},
      {team: draft.proposal.recommendedTeam.map(role => ({tempId: role.tempId, displayNameSuggestion: 'Same name'}))},
    ];
    for (const overrides of cases) {
      await assert.rejects(() => service.activate(draft.id, overrides), error => error.status === 400);
      assert.equal(draft.status, 'draft');
      assert.equal(stateManager.get().companies.length, originalCount);
    }
  });

  await test('Reviewed names, titles, constraints and cleared optional vision reach the active company', async () => {
    const {service} = await serviceFixture();
    const draft = await service.fromTemplate('tpl_startup_launch', {goal: 'Deliver our first launch plan.'});
    const role = draft.proposal.recommendedTeam[1];
    const excluded = draft.proposal.recommendedTeam.at(-1);
    const result = await service.activate(draft.id, {
      companyName: 'Reviewed Organa', mission: 'A mission chosen by the owner', vision: '', hardConstraints: ['Reviewed constraint'],
      team: [{tempId: role.tempId, displayNameSuggestion: 'Edited Maya', role: 'Evidence Lead', requestedToolIds: ['unapproved_tool'], purpose: 'Unauthorized purpose'}, {tempId: excluded.tempId, enabled: false}],
    });
    assert.equal(result.company.name, 'Reviewed Organa');
    assert.equal(result.northStar.mission, 'A mission chosen by the owner');
    assert.equal(result.northStar.vision, '');
    assert.ok(result.northStar.constraints.some(item => item.text === 'Reviewed constraint'));
    assert.equal(result.agents.length, draft.proposal.recommendedTeam.length - 1);
    const edited = result.agents.find(agent => agent.displayName === 'Edited Maya');
    assert.equal(edited.role, 'Evidence Lead');
    assert.ok(!edited.toolPolicyIds.includes('unapproved_tool'));
    assert.notEqual(edited.purpose, 'Unauthorized purpose');
    assertHierarchy(result.agents);
    const again = await service.activate(draft.id);
    assert.equal(again.company.id, result.company.id);
  });

  await test('Malformed model reporting lines, duplicate IDs and a capped team cannot break activation', async () => {
    const data = {companyProfile: {name: 'Generated'}, northStarDraft: {mission: 'Research'}, recommendedTeam: [
      {tempId: 'a', displayNameSuggestion: 'Maya', role: 'Research Lead', reportsToTempId: 'b'},
      {tempId: 'b', displayNameSuggestion: 'Maya', role: 'Analyst', reportsToTempId: 'a'},
      {tempId: 'a', role: 'Writer', reportsToTempId: 'missing'},
      ...Array.from({length: 6}, (_, index) => ({tempId: `extra_${index}`, role: 'Specialist', reportsToTempId: 'removed'})),
      {tempId: 'chief', displayNameSuggestion: 'Ari', role: 'AI Chief of Staff', reportsToTempId: 'a'},
    ]};
    const {service} = await serviceFixture({generate: async () => ({data})});
    const draft = await service.propose({goal: 'Prepare a structured recommendation.'});
    assert.ok(draft.proposal.recommendedTeam.length <= 7);
    const result = await service.activate(draft.id);
    assert.equal(new Set(result.agents.map(agent => agent.id)).size, result.agents.length);
    assert.equal(new Set(result.agents.map(agent => agent.displayName.toLowerCase())).size, result.agents.length);
    assertHierarchy(result.agents);
  });

  await test('A missing generated coordinator is inserted without dropping it or leaving orphan managers', async () => {
    const {service} = await serviceFixture({generate: async () => ({data: {recommendedTeam: Array.from({length: 10}, (_, index) => ({tempId: `r${index}`, role: 'Researcher', reportsToTempId: 'r9'}))}})});
    const draft = await service.propose({goal: 'Create an evidence brief.'});
    assertHierarchy((await service.activate(draft.id)).agents);
  });

  await test('A removed manager reassigns its selected reports to the coordinator', async () => {
    const {service} = await serviceFixture({generate: async () => ({data: {recommendedTeam: [
      {tempId: 'c', displayNameSuggestion: 'Ari', role: 'AI Chief of Staff'},
      {tempId: 'lead', displayNameSuggestion: 'Lead', role: 'Research Lead', reportsToTempId: 'c'},
      {tempId: 'report', displayNameSuggestion: 'Report', role: 'Analyst', reportsToTempId: 'lead'},
    ]}})});
    const draft = await service.propose({goal: 'Prepare a decision brief.'});
    const result = await service.activate(draft.id, {team: [{tempId: 'lead', enabled: false}]});
    assert.equal(result.agents.length, 2);
    assertHierarchy(result.agents);
  });

  await test('Constraint limits report errors instead of silently truncating user instructions', async () => {
    const {service} = await serviceFixture();
    await assert.rejects(() => service.fromTemplate('tpl_research', {constraints: Array.from({length: 13}, (_, index) => `Rule ${index}`)}), error => error.status === 400);
    await assert.rejects(() => service.propose({goal: 'Research', constraints: 'x'.repeat(501)}), error => error.status === 400);
    const draft = await service.propose({goal: 'Research', constraints: ['Budget guardrail', 'Budget guardrail']});
    assert.equal(draft.proposal.northStarDraft.hardConstraints.filter(text => text === 'Budget guardrail').length, 1);
  });

  await test('Storage errors leave a retryable draft and do not leave a phantom organization', async () => {
    const fixture = await serviceFixture();
    const before = JSON.stringify(fixture.stateManager.get().companies);
    fixture.setSaveFailure(true);
    await assert.rejects(() => fixture.service.fromTemplate('tpl_research', {clientRequestId: 'retry-save'}), /Simulated storage failure/);
    assert.equal(fixture.stateManager.get().bootstrapProposals.length, 0);
    fixture.setSaveFailure(false);
    const draft = await fixture.service.fromTemplate('tpl_research', {clientRequestId: 'retry-save'});
    fixture.setSaveFailure(true);
    await assert.rejects(() => fixture.service.activate(draft.id), /Simulated storage failure/);
    assert.equal(JSON.stringify(fixture.stateManager.get().companies), before);
    assert.equal(draft.status, 'draft');
    fixture.setSaveFailure(false);
    assertHierarchy((await fixture.service.activate(draft.id)).agents);
  });

  await test('Real HTTP activation is idempotent, persistent and usable for the first mission after restart', async () => {
    let runtime = await startServer();
    const directory = runtime.dataDir;
    try {
      const originalCompanies = (await (await fetch(runtime.base + '/api/companies')).json()).length;
      const input = {name: 'HTTP onboarding', goal: 'Prepare an evidence-backed product launch plan.', constraints: 'Budget below IDR 8,000,000', clientRequestId: 'durable-browser-retry'};
      const draft = (await post(runtime.base, '/api/company-bootstrap/proposals', input)).body;
      const route = `/api/company-bootstrap/proposals/${draft.id}/activate`;
      const attempts = await Promise.all([post(runtime.base, route, {companyName: 'HTTP reviewed'}), post(runtime.base, route, {companyName: 'HTTP reviewed'})]);
      assert.ok(attempts.every(result => result.status === 200));
      assert.equal(attempts[0].body.company.id, attempts[1].body.company.id);
      assert.equal((await (await fetch(runtime.base + '/api/companies')).json()).length, originalCompanies + 1);
      assert.equal((await (await fetch(runtime.base + '/api/events?type=company.activated')).json()).length, 1);
      await runtime.stop();
      runtime = await startServer({dataDir: directory});
      const recovered = await post(runtime.base, route, {});
      assert.equal(recovered.body.company.id, attempts[0].body.company.id);
      assert.equal((await post(runtime.base, '/api/company-bootstrap/proposals', input)).body.id, draft.id);
      const active = await (await fetch(runtime.base + '/api/company')).json();
      assert.equal(active.company.name, 'HTTP reviewed');
      assert.ok(active.northStar.constraints.some(item => item.text === 'Budget below IDR 8,000,000'));
      const mission = await post(runtime.base, '/api/projects/plan', {goal: input.goal});
      assert.equal(mission.status, 201);
      assert.ok(mission.body.planDraft.tasks.length > 0);
      assertHierarchy((await (await fetch(runtime.base + '/api/agents')).json()).agents);
    } finally {
      await runtime.stop();
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
