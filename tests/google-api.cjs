const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {startServer} = require('./helpers/server.cjs');

const call = async (base, method, route, body) => {
  const response = await fetch(base + route, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return {status: response.status, data};
};
const b64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// A local stand-in for Google's OAuth and Drive upload endpoints.
async function fakeGoogle() {
  const log = {tokenForms: [], uploads: [], revoked: [], refreshCount: 0};
  const mode = {uploadError: null, invalidGrant: false, challenge: null};
  let issued = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const json = (status, data) => { res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(data)); };
      if (req.url.startsWith('/token')) {
        const form = Object.fromEntries(new URLSearchParams(body.toString()));
        log.tokenForms.push(form);
        if (form.grant_type === 'authorization_code') {
          const expected = b64url(crypto.createHash('sha256').update(form.code_verifier || '').digest());
          if (form.code !== 'good-code' || expected !== mode.challenge) return json(400, {error: 'invalid_grant', error_description: 'bad code or verifier'});
          const idToken = `x.${b64url(Buffer.from(JSON.stringify({email: 'owner@example.com'})))}.y`;
          return json(200, {access_token: `access-${++issued}`, refresh_token: 'refresh-secret-value', expires_in: 1, id_token: idToken, scope: 'openid email https://www.googleapis.com/auth/drive.file'});
        }
        log.refreshCount += 1;
        if (mode.invalidGrant) return json(400, {error: 'invalid_grant'});
        return json(200, {access_token: `access-${++issued}`, expires_in: 1});
      }
      if (req.url.startsWith('/revoke')) { log.revoked.push(new URLSearchParams(body.toString()).get('token')); return json(200, {}); }
      if (req.url.startsWith('/upload')) {
        if (mode.uploadError) return json(mode.uploadError.status, mode.uploadError.body);
        const text = body.toString('latin1');
        const meta = JSON.parse(text.slice(text.indexOf('{'), text.indexOf('}') + 1));
        const mediaType = (text.match(/Content-Type: ([^\r\n]+)\r\n\r\n/g) || []).pop().replace('Content-Type: ', '').trim();
        log.uploads.push({auth: req.headers.authorization, meta, mediaType, startsWithPK: text.includes('PK\u0003\u0004'), size: body.length});
        return json(200, {id: `file-${log.uploads.length}`, name: meta.name, webViewLink: `https://docs.google.com/document/d/file-${log.uploads.length}/edit`});
      }
      json(404, {});
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {base, log, mode, close: () => new Promise(resolve => server.close(resolve))};
}

test('Google Docs and Sheets export works end to end with least-privilege OAuth', async () => {
  const google = await fakeGoogle();
  const runtime = await startServer({extraEnv: {
    DRY_RUN_DELAY_MS: '5', GOOGLE_OAUTH_CLIENT_ID: 'client-id-123', GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-xyz',
    ORGANA_GOOGLE_AUTH_URL: `${google.base}/auth`, ORGANA_GOOGLE_TOKEN_URL: `${google.base}/token`, ORGANA_GOOGLE_REVOKE_URL: `${google.base}/revoke`, ORGANA_GOOGLE_UPLOAD_URL: `${google.base}/upload`,
  }});
  try {
    const {base} = runtime;
    const status0 = (await call(base, 'GET', '/api/google/status')).data;
    assert.equal(status0.configured, true);
    assert.equal(status0.connected, false);
    assert.ok(!JSON.stringify(status0).includes('client-secret-xyz'), 'The client secret is never exposed.');

    await call(base, 'POST', '/api/workspaces/demo', {});
    const deliverable = (await call(base, 'GET', '/api/deliverables')).data.find(item => /Budget/.test(item.title)) || (await call(base, 'GET', '/api/deliverables')).data[0];
    const notConnected = await call(base, 'POST', `/api/deliverables/${deliverable.id}/save-to-google`, {target: 'docs'});
    assert.equal(notConnected.status, 409);
    assert.match(notConnected.data.error, /Connect it in Settings/);

    // Authorization request: PKCE, state, and only the drive.file scope.
    const connect = (await call(base, 'POST', '/api/google/connect', {})).data;
    const authUrl = new URL(connect.url);
    assert.equal(authUrl.origin, google.base);
    assert.equal(authUrl.searchParams.get('client_id'), 'client-id-123');
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authUrl.searchParams.get('access_type'), 'offline');
    const scopes = authUrl.searchParams.get('scope').split(' ');
    assert.ok(scopes.includes('https://www.googleapis.com/auth/drive.file'));
    assert.ok(!scopes.some(scope => /\/auth\/drive$|gmail|spreadsheets$|documents$/.test(scope)), 'No broad Drive, Gmail, Docs or Sheets scope is requested.');
    google.mode.challenge = authUrl.searchParams.get('code_challenge');
    const state = authUrl.searchParams.get('state');

    // A forged or unknown state is rejected and connects nothing.
    const forged = await fetch(`${base}/api/google/callback?code=good-code&state=forged`);
    assert.match(await forged.text(), /was not connected/);
    assert.equal((await call(base, 'GET', '/api/google/status')).data.connected, false);
    // A user who clicks Cancel at Google.
    const denied = await fetch(`${base}/api/google/callback?error=access_denied&state=${state}`);
    assert.match(await denied.text(), /was not connected/);

    // Real flow (the state was consumed above, so start a fresh attempt).
    const second = new URL((await call(base, 'POST', '/api/google/connect', {})).data.url);
    google.mode.challenge = second.searchParams.get('code_challenge');
    const okPage = await (await fetch(`${base}/api/google/callback?code=good-code&state=${second.searchParams.get('state')}`)).text();
    assert.match(okPage, /Google connected/);
    assert.match(okPage, /owner@example\.com/);
    const replay = await fetch(`${base}/api/google/callback?code=good-code&state=${second.searchParams.get('state')}`);
    assert.match(await replay.text(), /was not connected/, 'A state value works only once.');
    const status1 = (await call(base, 'GET', '/api/google/status')).data;
    assert.equal(status1.connected, true);
    assert.equal(status1.email, 'owner@example.com');
    const exchange = google.log.tokenForms.find(form => form.grant_type === 'authorization_code');
    assert.ok(exchange.code_verifier && exchange.client_secret === 'client-secret-xyz');

    // Tokens live in their own file, never in the workspace state or its backups.
    const tokenFile = path.join(runtime.dataDir, 'google-connection.json');
    assert.ok(fs.existsSync(tokenFile));
    assert.ok(!fs.readFileSync(path.join(runtime.dataDir, 'state.json'), 'utf8').includes('refresh-secret-value'));
    await call(base, 'POST', '/api/backups', {});
    for (const file of fs.readdirSync(path.join(runtime.dataDir, 'backups'))) assert.ok(!fs.readFileSync(path.join(runtime.dataDir, 'backups', file), 'utf8').includes('refresh-secret-value'));

    // Save to Docs: a .docx is uploaded and converted to a native Google Doc.
    const docs = await call(base, 'POST', `/api/deliverables/${deliverable.id}/save-to-google`, {target: 'docs'});
    assert.equal(docs.status, 200);
    assert.match(docs.data.url, /^https:\/\/docs\.google\.com\//);
    const docUpload = google.log.uploads.at(-1);
    assert.equal(docUpload.meta.mimeType, 'application/vnd.google-apps.document');
    assert.match(docUpload.mediaType, /wordprocessingml/);
    assert.ok(docUpload.startsWithPK, 'The uploaded file is a real .docx package.');
    assert.match(docUpload.auth, /^Bearer access-/);

    // Save to Sheets: CSV converted to a native Google Sheet. The short-lived access token is refreshed automatically.
    const refreshesBefore = google.log.refreshCount;
    const sheets = await call(base, 'POST', `/api/deliverables/${deliverable.id}/save-to-google`, {target: 'sheets'});
    assert.equal(sheets.status, 200);
    const sheetUpload = google.log.uploads.at(-1);
    assert.equal(sheetUpload.meta.mimeType, 'application/vnd.google-apps.spreadsheet');
    assert.match(sheetUpload.mediaType, /text\/csv/);
    assert.ok(google.log.refreshCount > refreshesBefore, 'An expired access token is refreshed.');
    assert.equal((await call(base, 'POST', `/api/deliverables/${deliverable.id}/save-to-google`, {target: 'slides'})).status, 400);
    assert.equal((await call(base, 'POST', '/api/deliverables/not-real/save-to-google', {target: 'docs'})).status, 404);

    // Helpful message when the Drive API is not enabled in the user's Cloud project.
    google.mode.uploadError = {status: 403, body: {error: {message: 'Google Drive API has not been used in project 1 before or it is disabled.', errors: [{reason: 'accessNotConfigured'}]}}};
    const disabled = await call(base, 'POST', `/api/deliverables/${deliverable.id}/save-to-google`, {target: 'docs'});
    assert.equal(disabled.status, 424);
    assert.match(disabled.data.error, /Drive API is not enabled/);
    google.mode.uploadError = null;

    // Revoked access: the saved sign-in is dropped and the owner is asked to reconnect.
    google.mode.invalidGrant = true;
    const revoked = await call(base, 'POST', `/api/deliverables/${deliverable.id}/save-to-google`, {target: 'docs'});
    assert.equal(revoked.status, 401);
    assert.match(revoked.data.error, /Connect Google again/);
    assert.equal((await call(base, 'GET', '/api/google/status')).data.connected, false);
    google.mode.invalidGrant = false;

    // Disconnect revokes at Google and removes the local copy.
    const again = new URL((await call(base, 'POST', '/api/google/connect', {})).data.url);
    google.mode.challenge = again.searchParams.get('code_challenge');
    await fetch(`${base}/api/google/callback?code=good-code&state=${again.searchParams.get('state')}`);
    assert.equal((await call(base, 'GET', '/api/google/status')).data.connected, true);
    const disconnected = await call(base, 'POST', '/api/google/disconnect', {});
    assert.equal(disconnected.data.connected, false);
    assert.deepEqual(google.log.revoked, ['refresh-secret-value']);
    assert.ok(!fs.existsSync(tokenFile));
  } finally { await runtime.cleanup(); await google.close(); }
});

test('Without Google credentials the connect request explains what to set up', async () => {
  const runtime = await startServer({extraEnv: {DRY_RUN_DELAY_MS: '5', GOOGLE_OAUTH_CLIENT_ID: '', GOOGLE_OAUTH_CLIENT_SECRET: ''}});
  try {
    const status = (await call(runtime.base, 'GET', '/api/google/status')).data;
    assert.equal(status.configured, false);
    const connect = await call(runtime.base, 'POST', '/api/google/connect', {});
    assert.equal(connect.status, 409);
    assert.match(connect.data.error, /GOOGLE_OAUTH_CLIENT_ID/);
  } finally { await runtime.cleanup(); }
});
