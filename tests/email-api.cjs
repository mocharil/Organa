const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {startServer} = require('./helpers/server.cjs');
const {parseAddresses, buildMessage, encodeSubject} = require('../server/services/email-service');

const call = async (base, method, route, body) => {
  const response = await fetch(base + route, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: response.status, data};
};
const b64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decodeRaw = raw => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function decodeSubject(header) {
  return header.replace(/\r\n /g, ' ').split(' ').map(word => { const m = word.match(/^=\?UTF-8\?B\?(.+)\?=$/); return m ? Buffer.from(m[1], 'base64').toString('utf8') : word; }).join('').replace(/^$/, header);
}

async function fakeGoogle() {
  const log = {gmail: [], revoked: []};
  const mode = {challenge: null, scope: '', gmailStatus: 200, gmailBody: null, gmailDrop: false, gmailDelayMs: 0};
  let issued = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const json = (status, data) => { res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(data)); };
      if (req.url.startsWith('/token')) {
        const form = Object.fromEntries(new URLSearchParams(body.toString()));
        if (form.grant_type === 'authorization_code') {
          const expected = b64url(crypto.createHash('sha256').update(form.code_verifier || '').digest());
          if (form.code !== 'good-code' || expected !== mode.challenge) return json(400, {error: 'invalid_grant'});
          const idToken = `x.${b64url(Buffer.from(JSON.stringify({email: 'owner@example.com', name: 'Aril Owner'})))}.y`;
          return json(200, {access_token: `access-${++issued}`, refresh_token: 'refresh-secret-value', expires_in: 3600, id_token: idToken, scope: mode.scope});
        }
        return json(200, {access_token: `access-${++issued}`, expires_in: 3600});
      }
      if (req.url.startsWith('/revoke')) return json(200, {});
      if (req.url.startsWith('/gmail')) {
        if (mode.gmailDelayMs) await new Promise(resolve => setTimeout(resolve, mode.gmailDelayMs));
        if (mode.gmailDrop) { req.socket.destroy(); return; }
        if (mode.gmailStatus !== 200) return json(mode.gmailStatus, mode.gmailBody || {error: {message: 'nope', errors: [{reason: 'forbidden'}]}});
        const raw = JSON.parse(body.toString()).raw;
        log.gmail.push({auth: req.headers.authorization, message: decodeRaw(raw)});
        return json(200, {id: `msg-${log.gmail.length}`, threadId: `thr-${log.gmail.length}`});
      }
      json(404, {});
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {base: `http://127.0.0.1:${server.address().port}`, log, mode, close: () => new Promise(resolve => server.close(resolve))};
}
const googleEnv = google => ({
  DRY_RUN_DELAY_MS: '5', GOOGLE_OAUTH_CLIENT_ID: 'client-id-123', GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-xyz',
  ORGANA_GOOGLE_AUTH_URL: `${google.base}/auth`, ORGANA_GOOGLE_TOKEN_URL: `${google.base}/token`, ORGANA_GOOGLE_REVOKE_URL: `${google.base}/revoke`,
  ORGANA_GOOGLE_UPLOAD_URL: `${google.base}/upload`, ORGANA_GOOGLE_GMAIL_URL: `${google.base}/gmail/send`,
});
async function connect(base, google, capabilities) {
  const url = new URL((await call(base, 'POST', '/api/google/connect', capabilities ? {capabilities} : {})).data.url);
  google.mode.challenge = url.searchParams.get('code_challenge');
  google.mode.scope = url.searchParams.get('scope');
  const page = await (await fetch(`${base}/api/google/callback?code=good-code&state=${url.searchParams.get('state')}`)).text();
  assert.match(page, /Google connected/);
  return url;
}

test('Address parsing blocks header injection and display-name tricks', () => {
  assert.deepEqual(parseAddresses('a@b.com, c@d.org;A@B.com', 'To'), ['a@b.com', 'c@d.org']);
  for (const bad of ['x@y.com\r\nBcc: evil@z.com', 'Boss <a@b.com>', 'a@b', 'a b@c.com', '"x"@y.com', 'a@b.com>,<c@d.com']) assert.throws(() => parseAddresses(bad, 'To'), /not a valid email address/);
});

test('Messages are encoded safely for non-ASCII subjects and bodies', () => {
  const subject = 'Tindak lanjut: sampel kopi untuk kemitraan baru kita — Rp 15 juta ☕';
  assert.equal(decodeSubject(encodeSubject(subject)), subject);
  const message = buildMessage({from: 'me@x.com', to: ['a@b.com'], cc: ['c@d.com'], subject, body: 'Halo Budi,\nTerima kasih. é ☕'});
  const [head, bodyPart] = message.split('\r\n\r\n');
  assert.match(head, /^From: me@x\.com\r\nTo: a@b\.com\r\nCc: c@d\.com\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(head, /Content-Transfer-Encoding: base64/);
  assert.equal(Buffer.from(bodyPart.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Halo Budi,\r\nTerima kasih. é ☕');
  assert.ok(!/\r\n(Bcc|To): .*evil/i.test(message));
});

test('Emails: AI drafts, the owner reviews and sends through Gmail with strict safeguards', async () => {
  const google = await fakeGoogle();
  const runtime = await startServer({extraEnv: {...googleEnv(google), ORGANA_EMAIL_DAILY_LIMIT: '4'}});
  try {
    const {base} = runtime;
    await call(base, 'POST', '/api/workspaces/demo', {});
    const sources = (await call(base, 'GET', '/api/deliverables')).data;

    // Drafting
    assert.equal((await call(base, 'POST', '/api/emails/draft', {instruction: 'hi'})).status, 400);
    assert.equal((await call(base, 'POST', '/api/emails/draft', {instruction: 'Follow up about the launch plan', to: 'x@y.com\r\nBcc: evil@z.com'})).status, 400);
    const drafted = await call(base, 'POST', '/api/emails/draft', {instruction: 'Follow up with Budi about the launch plan', to: 'budi@example.com', cc: 'rani@example.com', deliverableId: sources[0].id, clientRequestId: 'em-1'});
    assert.equal(drafted.status, 201);
    const email = drafted.data;
    assert.equal(email.status, 'draft');
    assert.deepEqual(email.to, ['budi@example.com']);
    assert.ok(email.subject && email.body);
    assert.equal(email.deliverableId, sources[0].id);
    assert.ok(Array.isArray(email.constraintChecks));
    const again = await call(base, 'POST', '/api/emails/draft', {instruction: 'Follow up with Budi about the launch plan', to: 'budi@example.com', cc: 'rani@example.com', deliverableId: sources[0].id, clientRequestId: 'em-1'});
    assert.equal(again.data.id, email.id, 'The same request identity returns the same draft.');
    assert.equal((await call(base, 'POST', '/api/emails/draft', {instruction: 'A totally different email', clientRequestId: 'em-1'})).status, 409);
    assert.equal((await call(base, 'POST', '/api/emails/draft', {instruction: 'Write about this', deliverableId: 'del_missing'})).status, 404);

    // Editing
    let current = (await call(base, 'PATCH', `/api/emails/${email.id}`, {version: email.version, subject: 'Launch plan\r\nBcc: evil@z.com', body: 'Hi Budi,\nHere is the plan.\n\nThanks'})).data;
    assert.equal(current.subject, 'Launch plan Bcc: evil@z.com', 'Line breaks in the subject are flattened, so no header can be injected.');
    assert.equal((await call(base, 'PATCH', `/api/emails/${email.id}`, {version: email.version, subject: 'stale'})).status, 409);
    const many = Array.from({length: 11}, (_, n) => `p${n}@example.com`).join(',');
    assert.equal((await call(base, 'PATCH', `/api/emails/${email.id}`, {version: current.version, to: many})).data.code, 'EMAIL_TOO_MANY');
    current = (await call(base, 'PATCH', `/api/emails/${email.id}`, {version: current.version, subject: 'Launch plan for Nusa Coffee'})).data;

    // Not connected yet
    const early = await call(base, 'POST', `/api/emails/${email.id}/send`, {version: current.version});
    assert.equal(early.status, 409);
    assert.equal(early.data.code, 'GOOGLE_NOT_CONNECTED');

    // Drive-only connection is not enough to send mail; asking for Gmail requests only gmail.send.
    const driveUrl = await connect(base, google);
    assert.ok(!driveUrl.searchParams.get('scope').includes('gmail'));
    let status = (await call(base, 'GET', '/api/google/status')).data;
    assert.equal(status.drive, true); assert.equal(status.gmail, false);
    const noScope = await call(base, 'POST', `/api/emails/${email.id}/send`, {version: current.version});
    assert.equal(noScope.data.code, 'GOOGLE_SCOPE_MISSING');
    const gmailUrl = await connect(base, google, ['gmail']);
    const scopes = gmailUrl.searchParams.get('scope').split(' ');
    assert.ok(scopes.includes('https://www.googleapis.com/auth/gmail.send'));
    assert.ok(!scopes.some(scope => /gmail\.(readonly|modify|compose|metadata)|mail\.google\.com/.test(scope)), 'Only the send-only Gmail permission is requested.');
    assert.equal((await call(base, 'POST', '/api/google/connect', {capabilities: ['gmail-full']})).status, 400);
    status = (await call(base, 'GET', '/api/google/status')).data;
    assert.equal(status.gmail, true); assert.equal(status.name, 'Aril Owner');

    // Safeguards before sending
    const noRecipient = (await call(base, 'POST', '/api/emails/draft', {instruction: 'A note with no recipient yet'})).data;
    assert.equal((await call(base, 'POST', `/api/emails/${noRecipient.id}/send`, {version: noRecipient.version})).data.code, 'EMAIL_NO_RECIPIENT');
    const placeholder = (await call(base, 'PATCH', `/api/emails/${email.id}`, {version: current.version, body: 'Dear [Name],\nHere is the plan.'})).data;
    const blocked = await call(base, 'POST', `/api/emails/${email.id}/send`, {version: placeholder.version});
    assert.equal(blocked.status, 422);
    assert.equal(google.log.gmail.length, 0, 'Nothing was sent so far.');
    current = (await call(base, 'PATCH', `/api/emails/${email.id}`, {version: placeholder.version, body: 'Hi Budi,\nHere is the plan.\n\nThanks'})).data;
    assert.equal((await call(base, 'POST', `/api/emails/${email.id}/send`, {version: current.version - 1})).status, 409, 'A stale review cannot be sent.');

    // Sending: two simultaneous clicks produce exactly one message.
    google.mode.gmailDelayMs = 150;
    const [first, second] = await Promise.all([call(base, 'POST', `/api/emails/${email.id}/send`, {version: current.version}), call(base, 'POST', `/api/emails/${email.id}/send`, {version: current.version})]);
    google.mode.gmailDelayMs = 0;
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    assert.equal(google.log.gmail.length, 1);
    const sent = (await call(base, 'GET', `/api/emails/${email.id}`)).data;
    assert.equal(sent.status, 'sent');
    assert.equal(sent.gmailMessageId, 'msg-1');
    assert.equal(sent.from, 'owner@example.com');
    const wire = google.log.gmail[0];
    assert.match(wire.auth, /^Bearer access-/);
    assert.match(wire.message, /^From: owner@example\.com\r\nTo: budi@example\.com\r\nCc: rani@example\.com\r\nSubject: Launch plan for Nusa Coffee\r\n/);
    assert.equal(Buffer.from(wire.message.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Hi Budi,\r\nHere is the plan.\r\n\r\nThanks');
    assert.ok(!/\r\nBcc:/i.test(wire.message));
    assert.equal((await call(base, 'POST', `/api/emails/${email.id}/send`, {version: sent.version})).status, 409);
    assert.equal((await call(base, 'PATCH', `/api/emails/${email.id}`, {version: sent.version, body: 'changed'})).status, 409, 'Sent emails are read-only.');
    assert.equal((await call(base, 'POST', `/api/emails/${email.id}/discard`, {})).status, 409);

    // Gmail refuses: nothing is sent, the draft stays editable and can be retried.
    const second_ = (await call(base, 'POST', '/api/emails/draft', {instruction: 'Thank Rani for the meeting yesterday', to: 'rani@example.com'})).data;
    google.mode.gmailStatus = 403;
    const refused = await call(base, 'POST', `/api/emails/${second_.id}/send`, {version: second_.version});
    assert.equal(refused.status, 424);
    assert.match(refused.data.error, /Enable email sending/);
    google.mode.gmailStatus = 200;
    let retry = (await call(base, 'GET', `/api/emails/${second_.id}`)).data;
    assert.equal(retry.status, 'failed'); assert.equal(retry.outcomeUnknown, false);
    assert.equal((await call(base, 'POST', `/api/emails/${second_.id}/send`, {version: retry.version})).status, 200, 'A failed email can be sent again.');

    // Connection drops mid-send: the outcome is unknown, so the owner must confirm before a resend.
    const third = (await call(base, 'POST', '/api/emails/draft', {instruction: 'Send the final invoice reminder to Dewi', to: 'dewi@example.com'})).data;
    google.mode.gmailDrop = true;
    const dropped = await call(base, 'POST', `/api/emails/${third.id}/send`, {version: third.version});
    assert.equal(dropped.status, 424);
    assert.match(dropped.data.error, /Sent folder/);
    google.mode.gmailDrop = false;
    retry = (await call(base, 'GET', `/api/emails/${third.id}`)).data;
    assert.equal(retry.outcomeUnknown, true);
    const noConfirm = await call(base, 'POST', `/api/emails/${third.id}/send`, {version: retry.version});
    assert.equal(noConfirm.data.code, 'EMAIL_CONFIRM_RESEND');
    assert.equal((await call(base, 'POST', `/api/emails/${third.id}/send`, {version: retry.version, confirmResend: true})).status, 200);

    // Daily limit (4 in this test): sent so far = 3.
    const fourth = (await call(base, 'POST', '/api/emails/draft', {instruction: 'Short thanks to the whole supplier group', to: 'one@example.com'})).data;
    assert.equal((await call(base, 'POST', `/api/emails/${fourth.id}/send`, {version: fourth.version})).status, 200);
    const fifth = (await call(base, 'POST', '/api/emails/draft', {instruction: 'One more note to a supplier', to: 'two@example.com'})).data;
    const limited = await call(base, 'POST', `/api/emails/${fifth.id}/send`, {version: fifth.version});
    assert.equal(limited.status, 429);
    assert.equal(limited.data.code, 'EMAIL_DAILY_LIMIT');

    // Discard, listing and workspace scoping.
    assert.equal((await call(base, 'POST', `/api/emails/${fifth.id}/discard`, {})).data.status, 'discarded');
    const listed = (await call(base, 'GET', '/api/emails')).data;
    assert.ok(listed.length >= 5);
    assert.equal((await call(base, 'GET', '/api/emails?status=sent')).data.every(item => item.status === 'sent'), true);
    const workspaces = (await call(base, 'GET', '/api/workspaces')).data;
    const other = workspaces.find(item => !item.active);
    await call(base, 'POST', `/api/workspaces/${other.id}/activate`, {});
    assert.equal((await call(base, 'GET', '/api/emails')).data.length, 0, 'Emails belong to their workspace.');
    assert.equal((await call(base, 'GET', `/api/emails/${email.id}`)).status, 404);
  } finally { await runtime.cleanup(); await google.close(); }
});

test('An email interrupted mid-send is flagged after a restart instead of being silently resent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organa-email-'));
  let runtime;
  try {
    runtime = await startServer({dataDir: dir, extraEnv: {DRY_RUN_DELAY_MS: '5'}});
    const draft = (await call(runtime.base, 'POST', '/api/emails/draft', {instruction: 'Introduce our new service to Dewi', to: 'dewi@example.com'})).data;
    await runtime.stop();
    const file = path.join(dir, 'state.json');
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.emails.find(item => item.id === draft.id).status = 'sending';
    fs.writeFileSync(file, JSON.stringify(state));
    runtime = await startServer({dataDir: dir, extraEnv: {DRY_RUN_DELAY_MS: '5'}});
    const recovered = (await call(runtime.base, 'GET', `/api/emails/${draft.id}`)).data;
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.outcomeUnknown, true);
    assert.match(recovered.error, /Sent folder/);
  } finally { await runtime?.stop(); fs.rmSync(dir, {recursive: true, force: true}); }
});
