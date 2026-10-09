const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {startServer} = require('./helpers/server.cjs');
const {JsonStateStore} = require('../server/repositories/json-state-store');
const {createDefaultState} = require('../server/data/default-state');
const {shiftDates} = require('../server/services/workspace-service');

const call = async (base, method, route, body) => {
  const response = await fetch(base + route, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: response.status, data, headers: response.headers};
};

test('State store keeps rolling backups, prunes only automatic ones and rejects unsafe names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organa-store-'));
  try {
    const store = new JsonStateStore({dataDir: dir, fileName: 'state.json', createDefaultState, backupIntervalMs: 0, backupKeep: 2});
    const state = store.load();
    state.marker = 'one';
    store.save(state);
    assert.equal(store.listBackups().length >= 1, true, 'A save snapshots the previous file.');
    const manual = store.backup('manual');
    for (let n = 0; n < 5; n += 1) { state.marker = `m${n}`; store.save(state); }
    const autos = store.listBackups().filter(item => item.label === 'auto');
    assert.ok(autos.length <= 2, 'Automatic backups are capped.');
    assert.ok(store.listBackups().some(item => item.name === manual), 'Manual backups are never pruned.');
    assert.throws(() => store.readBackup('../state.json'), /Invalid backup name/);
    assert.throws(() => store.readBackup('state-nope.json'), /not found/);
    fs.writeFileSync(path.join(store.backupDir, 'state-bad-20260101-000000.json'), JSON.stringify({hello: 'world'}));
    assert.throws(() => store.readBackup('state-bad-20260101-000000.json'), /not a valid Organa workspace/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('Date shifting moves ISO timestamps only', () => {
  const out = shiftDates({a: '2026-01-01T00:00:00.000Z', b: 'plain', c: ['2026-01-01T00:00:00Z'], d: '2026-10-31'}, 1000);
  assert.equal(out.a, '2026-01-01T00:00:01.000Z');
  assert.equal(out.b, 'plain');
  assert.equal(out.c[0], '2026-01-01T00:00:01.000Z');
  assert.equal(out.d, '2026-10-31');
});

test('Workspaces, demo data, backups and export work end to end without touching existing data', async () => {
  const runtime = await startServer({extraEnv: {DRY_RUN_DELAY_MS: '10'}});
  try {
    const {base} = runtime;
    // A user workspace that must survive everything below.
    const proposal = await call(base, 'POST', '/api/company-bootstrap/proposals', {name: 'My Studio', description: 'A one person design studio', goal: 'Land three retainer clients this quarter', stage: 'Early', audience: 'Startups', constraints: 'Never spend more than 5,000,000 IDR per month', clientRequestId: 'ws-1'});
    assert.equal(proposal.status, 201);
    assert.equal((await call(base, 'POST', `/api/company-bootstrap/proposals/${proposal.data.id}/activate`, {})).status, 200);
    const mine = (await call(base, 'GET', '/api/workspaces')).data;
    const baseline = mine.length;
    const myId = mine.find(item => item.active).id;
    assert.equal(mine.find(item => item.active).name, 'My Studio');
    const myAgents = (await call(base, 'GET', '/api/agents')).data.roster.length;

    const demo = await call(base, 'POST', '/api/workspaces/demo', {});
    assert.equal(demo.status, 200);
    assert.equal(demo.data.created, true);
    const listed = demo.data.workspaces;
    assert.equal(listed.length, baseline + 1);
    const demoWs = listed.find(item => item.demo);
    assert.equal(demoWs.active, true);
    assert.ok(demoWs.counts.agents >= 3 && demoWs.counts.deliverables >= 2, 'The demo ships with finished work.');
    assert.ok(demoWs.counts.needsReview >= 1, 'The demo has work waiting for the owner.');
    assert.equal((await call(base, 'POST', '/api/workspaces/demo', {})).data.created, false, 'Loading twice reuses the same demo.');
    assert.equal((await call(base, 'GET', '/api/workspaces')).data.length, baseline + 1);

    // Demo content is reachable and scoped to the demo company.
    const deliverables = (await call(base, 'GET', '/api/deliverables')).data;
    assert.ok(deliverables.length >= 2);
    assert.ok(deliverables.every(item => item.companyId === demoWs.id));
    const exported = await call(base, 'GET', `/api/deliverables/${deliverables[0].id}/export`);
    assert.equal(exported.status, 200);
    assert.match(String(exported.headers.get('content-disposition')), /attachment; filename="[a-z0-9-]+\.md"/);
    assert.match(exported.data, /^# /);
    assert.match(exported.data, /Exported from Organa/);
    assert.equal((await call(base, 'GET', '/api/deliverables/not-real/export')).status, 404);
    const docx = await fetch(base + `/api/deliverables/${deliverables[0].id}/export?format=docx`);
    assert.equal(docx.status, 200);
    assert.match(docx.headers.get('content-type'), /wordprocessingml/);
    const docxBytes = Buffer.from(await docx.arrayBuffer());
    assert.equal(docxBytes.subarray(0, 2).toString(), 'PK', 'DOCX is a zip package.');
    const csv = await fetch(base + `/api/deliverables/${deliverables[0].id}/export?format=csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.equal((await call(base, 'GET', `/api/deliverables/${deliverables[0].id}/export?format=pdf`)).status, 400);

    // Your own workspace is intact and switching is reversible.
    assert.equal((await call(base, 'POST', `/api/workspaces/${myId}/activate`, {})).status, 200);
    assert.equal((await call(base, 'GET', '/api/agents')).data.roster.length, myAgents);
    assert.equal((await call(base, 'GET', '/api/deliverables')).data.every(item => item.companyId === myId), true);
    assert.equal((await call(base, 'POST', '/api/workspaces/nope/activate', {})).status, 404);

    // Backups exist, can be created, restored, and bad names are rejected.
    const backups = (await call(base, 'GET', '/api/backups')).data;
    assert.ok(backups.some(item => item.label === 'predemo'), 'A backup is saved before demo data is added.');
    const manual = await call(base, 'POST', '/api/backups', {});
    assert.equal(manual.status, 201);
    assert.equal((await call(base, 'POST', '/api/backups/..%2Fstate.json/restore', {})).status, 400);
    assert.equal((await call(base, 'POST', '/api/backups/state-missing-1.json/restore', {})).status, 404);

    // Removing the demo leaves the real workspace, then restoring the pre-removal backup brings it back.
    const removed = await call(base, 'DELETE', '/api/workspaces/demo');
    assert.equal(removed.status, 200);
    assert.equal(removed.data.workspaces.length, baseline);
    assert.ok(removed.data.workspaces.some(item => item.id === myId));
    assert.equal((await call(base, 'DELETE', '/api/workspaces/demo')).status, 404);
    const restore = await call(base, 'POST', `/api/backups/${encodeURIComponent(manual.data.name)}/restore`, {});
    assert.equal(restore.status, 200);
    assert.equal(restore.data.workspaces.length, baseline + 1, 'Restore brings the demo workspace back.');
    assert.ok((await call(base, 'GET', '/api/backups')).data.some(item => item.label === 'prerestore'), 'Restoring saves the current state first.');
  } finally { await runtime.stop?.(); await runtime.cleanup?.(); }
});
