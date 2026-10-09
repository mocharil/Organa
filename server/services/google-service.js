const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {now} = require('./helpers');

// Least privilege. drive.file: only files Organa creates itself. gmail.send: can send mail but cannot read, list or delete any email.
// "openid email profile" only identifies the connected account (shown in Settings and used as the sender's name).
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const BASE_SCOPES = 'openid email profile';
const CAPABILITIES = {drive: DRIVE_SCOPE, gmail: GMAIL_SCOPE};
const SCOPES = `${BASE_SCOPES} ${DRIVE_SCOPE}`;
const STATE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 45000;
const TARGETS = {
  docs: {format: 'docx', sourceType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', googleType: 'application/vnd.google-apps.document', label: 'Google Docs'},
  sheets: {format: 'csv', sourceType: 'text/csv', googleType: 'application/vnd.google-apps.spreadsheet', label: 'Google Sheets'},
};
const fail = (message, status = 400, code = '') => { throw Object.assign(new Error(message), {status, code}); };
const b64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

class GoogleService {
  constructor({config, eventService, workspaceService}) {
    Object.assign(this, {config, eventService, workspaceService});
    this.google = config.google;
    this.file = path.join(config.dataDir, 'google-connection.json');
    this.pending = new Map();
    this.refreshing = null;
  }

  configured() { return Boolean(this.google.clientId && this.google.clientSecret); }

  readConnection() {
    try { const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')); return parsed && parsed.refreshToken ? parsed : null; } catch { return null; }
  }

  writeConnection(connection) {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(connection, null, 2), {mode: 0o600});
    fs.renameSync(tmp, this.file);
  }

  status() {
    const connection = this.readConnection();
    const granted = String(connection?.scope || '');
    return {configured: this.configured(), connected: Boolean(connection), email: connection?.email || null, name: connection?.name || null, drive: granted.includes(DRIVE_SCOPE), gmail: granted.includes(GMAIL_SCOPE), connectedAt: connection?.connectedAt || null, redirectUri: this.google.redirectUri, targets: Object.fromEntries(Object.entries(TARGETS).map(([key, value]) => [key, value.label]))};
  }

  begin({capabilities = ['drive']} = {}) {
    if (!this.configured()) fail('Google is not set up yet. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env and restart (see docs/GOOGLE_SETUP.md).', 409, 'GOOGLE_NOT_CONFIGURED');
    for (const [key, value] of this.pending) if (value.expires < Date.now()) this.pending.delete(key);
    const state = b64url(crypto.randomBytes(24)), verifier = b64url(crypto.randomBytes(32));
    this.pending.set(state, {verifier, expires: Date.now() + STATE_TTL_MS});
    const params = new URLSearchParams({
      client_id: this.google.clientId, redirect_uri: this.google.redirectUri, response_type: 'code', scope: this.scopeFor(capabilities),
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
      code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
    });
    return {url: `${this.google.authUrl}?${params}`};
  }

  scopeFor(capabilities) {
    const wanted = (Array.isArray(capabilities) && capabilities.length ? capabilities : ['drive']).map(String);
    if (wanted.some(item => !CAPABILITIES[item])) fail('Unknown Google capability. Use drive or gmail.', 400);
    return [BASE_SCOPES, ...new Set(wanted.map(item => CAPABILITIES[item]))].join(' ');
  }

  async tokenRequest(form) {
    let response;
    try {
      response = await fetch(this.google.tokenUrl, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: this.google.clientId, client_secret: this.google.clientSecret, ...form}), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
    } catch { fail('Could not reach Google. Check your internet connection and try again.', 424, 'GOOGLE_UNREACHABLE'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error_description || data.error || 'Google rejected the request.'); error.googleError = data.error; error.status = 400; throw error; }
    return data;
  }

  async complete({code, state, error} = {}) {
    if (error) fail(error === 'access_denied' ? 'Google access was not granted. Nothing was connected.' : `Google returned an error: ${String(error).slice(0, 80)}`, 400);
    const entry = this.pending.get(String(state || ''));
    this.pending.delete(String(state || ''));
    if (!entry || entry.expires < Date.now()) fail('This connection attempt expired or was not started here. Start again from Settings.', 400, 'GOOGLE_STATE_INVALID');
    if (!code) fail('Google did not return an authorization code.', 400);
    let tokens;
    try { tokens = await this.tokenRequest({grant_type: 'authorization_code', code: String(code), redirect_uri: this.google.redirectUri, code_verifier: entry.verifier}); }
    catch (cause) { if (cause.status) fail(`Google could not complete the connection: ${cause.message}`, 400); throw cause; }
    const previous = this.readConnection();
    const refreshToken = tokens.refresh_token || previous?.refreshToken;
    if (!refreshToken) fail('Google did not grant offline access. Remove Organa from your Google account permissions and connect again.', 400, 'GOOGLE_NO_REFRESH');
    let email = null, name = null;
    try { const claims = JSON.parse(Buffer.from(String(tokens.id_token).split('.')[1], 'base64').toString('utf8')); email = claims.email || null; name = claims.name || null; } catch { /* email and name are only labels */ }
    this.writeConnection({refreshToken, accessToken: tokens.access_token, expiresAt: Date.now() + (Number(tokens.expires_in) || 3000) * 1000, email, name: name || previous?.name || null, scope: tokens.scope || SCOPES, connectedAt: now()});
    return this.status();
  }

  async accessToken() {
    const connection = this.readConnection();
    if (!connection) fail('Google is not connected. Connect it in Settings first.', 409, 'GOOGLE_NOT_CONNECTED');
    if (connection.accessToken && connection.expiresAt > Date.now() + 60000) return connection.accessToken;
    if (!this.refreshing) {
      this.refreshing = (async () => {
        try {
          const tokens = await this.tokenRequest({grant_type: 'refresh_token', refresh_token: connection.refreshToken});
          this.writeConnection({...connection, accessToken: tokens.access_token, expiresAt: Date.now() + (Number(tokens.expires_in) || 3000) * 1000});
          return tokens.access_token;
        } catch (error) {
          if (error.googleError === 'invalid_grant') { try { fs.unlinkSync(this.file); } catch { /* already gone */ } fail('Google access was revoked or expired. Connect Google again in Settings.', 401, 'GOOGLE_REAUTH');
          }
          throw error;
        } finally { this.refreshing = null; }
      })();
    }
    return this.refreshing;
  }

  async disconnect() {
    const connection = this.readConnection();
    if (connection) {
      try { await fetch(this.google.revokeUrl, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({token: connection.refreshToken}), signal: AbortSignal.timeout(10000)}); } catch { /* revoking is best effort; the local copy is removed regardless */ }
    }
    try { fs.unlinkSync(this.file); } catch { /* not connected */ }
    return this.status();
  }

  // Uploads the exported file and lets Google convert it into a native Doc or Sheet.
  async saveToGoogle(deliverableId, target) {
    const spec = TARGETS[String(target)];
    if (!spec) fail('Choose docs or sheets.', 400);
    if (!this.status().drive && this.readConnection()) fail('Saving to Google Drive is not enabled for this connection. Connect Google again in Settings.', 409, 'GOOGLE_SCOPE_MISSING');
    const exported = this.workspaceService.exportDeliverable(deliverableId, spec.format);
    const title = exported.filename.replace(/\.[a-z]+$/, '').replace(/-/g, ' ').replace(/^./, ch => ch.toUpperCase());
    const token = await this.accessToken();
    const boundary = `organa-${crypto.randomUUID()}`;
    const media = Buffer.isBuffer(exported.body) ? exported.body : Buffer.from(exported.body, 'utf8');
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name: title, mimeType: spec.googleType})}\r\n--${boundary}\r\nContent-Type: ${spec.sourceType}\r\n\r\n`),
      media, Buffer.from(`\r\n--${boundary}--`),
    ]);
    let response;
    try {
      response = await fetch(`${this.google.uploadUrl}?uploadType=multipart&fields=id,name,webViewLink`, {method: 'POST', headers: {authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}`}, body: payload, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
    } catch { fail('Could not reach Google. Check your internet connection and try again.', 424, 'GOOGLE_UNREACHABLE'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason || data.error?.status || '';
      if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used|disabled/i.test(data.error?.message || '')) fail('The Google Drive API is not enabled for your Google Cloud project. Enable it, wait a minute, then try again (see docs/GOOGLE_SETUP.md).', 424, 'GOOGLE_API_DISABLED');
      if (response.status === 401) fail('Google rejected the saved sign-in. Connect Google again in Settings.', 401, 'GOOGLE_REAUTH');
      if (response.status === 403 && /storageQuota|quota/i.test(reason)) fail('Your Google Drive is full.', 424, 'GOOGLE_QUOTA');
      fail(`Google could not save the file (${response.status}). Try again in a moment.`, 424, 'GOOGLE_SAVE_FAILED');
    }
    this.eventService?.append('deliverable.exported', {actor: {type: 'user', id: 'local-user'}, entity: {type: 'deliverable', id: deliverableId}, payload: {target: spec.label}});
    return {id: data.id, name: data.name || title, url: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`, target: spec.label};
  }

  // Sends one RFC 822 message through the Gmail API. The caller has already validated and encoded it.
  async sendMail(raw) {
    if (!this.readConnection()) fail('Google is not connected. Connect it in Settings first.', 409, 'GOOGLE_NOT_CONNECTED');
    if (!this.status().gmail) fail('Sending email is not enabled yet. Open Settings → Google and choose Enable email sending.', 409, 'GOOGLE_SCOPE_MISSING');
    const token = await this.accessToken();
    let response;
    try {
      response = await fetch(this.google.gmailSendUrl, {method: 'POST', headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'}, body: JSON.stringify({raw}), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
    } catch (cause) { const error = new Error('Could not reach Gmail, so it is not known whether the email was sent. Check your Gmail Sent folder before sending again.'); error.status = 424; error.code = 'GMAIL_UNKNOWN'; error.unknownOutcome = true; throw error; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason || data.error?.status || '';
      if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used|disabled/i.test(data.error?.message || '')) fail('The Gmail API is not enabled for your Google Cloud project. Enable it, wait a minute, then try again (see docs/GOOGLE_SETUP.md).', 424, 'GMAIL_API_DISABLED');
      if (response.status === 401) fail('Google rejected the saved sign-in. Connect Google again in Settings.', 401, 'GOOGLE_REAUTH');
      if (response.status === 403) fail('Gmail did not allow sending. Enable email sending again in Settings.', 424, 'GMAIL_FORBIDDEN');
      if (response.status === 429 || /rateLimit|userRateLimit|dailyLimit/i.test(reason)) fail('The Gmail sending limit was reached. Try again later.', 424, 'GMAIL_RATE_LIMIT');
      if (response.status === 400) fail('Gmail rejected the message. Check the recipient addresses and try again.', 424, 'GMAIL_REJECTED');
      fail(`Gmail could not send the email (${response.status}). Nothing was sent; you can try again.`, 424, 'GMAIL_FAILED');
    }
    return {id: data.id || null, threadId: data.threadId || null};
  }

  callbackPage(ok, message) {
    const safe = escapeHtml(message);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Organa · Google</title><style>body{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f7fb;color:#14213d}main{max-width:440px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(20,33,61,.12)}h1{font-size:20px;margin:0 0 8px}a{color:#1267f8;font-weight:600}</style></head><body><main><h1>${ok ? 'Google connected' : 'Google was not connected'}</h1><p>${safe}</p><p><a href="/app">Back to Organa</a></p></main>${ok ? '<script>setTimeout(function(){location.replace("/app")},1200)</script>' : ''}</body></html>`;
  }
}

module.exports = {GoogleService, SCOPES, TARGETS, DRIVE_SCOPE, GMAIL_SCOPE};
