const {emailDraftSchema} = require('../ai/schemas');
const prompts = require('../prompts');
const {id, now, clean, activeNorthStar} = require('./helpers');
const {reuseRequest} = require('./request-identity');

const MAX_RECIPIENTS = 10;
const DAILY_LIMIT = 30;
const MAX_SUBJECT = 200;
const MAX_BODY = 20000;
const EDITABLE = new Set(['draft', 'failed']);
// Strict on purpose: no display names, no quotes or whitespace, so a recipient can never carry extra headers.
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PLACEHOLDER = /\[[^\]\r\n]{2,60}\]/;
const fail = (message, status = 400, code = '') => { throw Object.assign(new Error(message), {status, code}); };

function parseAddresses(value, label) {
  if (value === undefined || value === null || value === '') return [];
  const parts = (Array.isArray(value) ? value : String(value).split(/[\s,;]+/)).map(item => String(item).trim()).filter(Boolean);
  const unique = [];
  for (const part of parts) {
    if (part.length > 254 || !ADDRESS.test(part)) fail(`"${part.slice(0, 80)}" is not a valid email address (${label}). Use plain addresses such as name@company.com.`, 400, 'EMAIL_INVALID_ADDRESS');
    if (!unique.some(existing => existing.toLowerCase() === part.toLowerCase())) unique.push(part);
  }
  return unique;
}

const LINE_BREAKS = new RegExp('[' + String.fromCharCode(13, 10, 0x2028, 0x2029) + ']+', 'g');
const cleanSubject = value => String(value ?? '').replace(LINE_BREAKS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SUBJECT);
const cleanBody = value => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, MAX_BODY).replace(/\s+$/, '');
const b64 = text => Buffer.from(text, 'utf8').toString('base64');
const b64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// RFC 2047 encoded words of at most 45 bytes each, never splitting a character.
function encodeSubject(subject) {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  const words = [];
  let current = '';
  for (const char of subject) {
    if (Buffer.byteLength(current + char, 'utf8') > 45) { words.push(current); current = ''; }
    current += char;
  }
  if (current) words.push(current);
  return words.map(word => `=?UTF-8?B?${b64(word)}?=`).join('\r\n ');
}

function buildMessage({from, to, cc, subject, body}) {
  const wrapped = b64(String(body).replace(/\n/g, '\r\n')).replace(/.{1,76}/g, line => `${line}\r\n`);
  const headers = [from ? `From: ${from}` : null, `To: ${to.join(', ')}`, cc.length ? `Cc: ${cc.join(', ')}` : null, `Subject: ${encodeSubject(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'].filter(Boolean);
  return `${headers.join('\r\n')}\r\n\r\n${wrapped}`;
}

class EmailService {
  constructor({stateManager, provider, eventService, usageService, deliverableService, googleService, config = {}}) {
    Object.assign(this, {stateManager, provider, eventService, usageService, deliverableService, googleService});
    this.maxRecipients = Number(config.emailMaxRecipients) || MAX_RECIPIENTS;
    this.dailyLimit = Number(config.emailDailyLimit) || DAILY_LIMIT;
    this.requests = new Map();
    this.sending = new Set();
  }

  all() { const state = this.stateManager.get(); state.emails ||= []; return state.emails; }
  list({status} = {}) {
    const companyId = this.stateManager.get().activeCompanyId;
    return this.all().filter(email => email.companyId === companyId && (!status || email.status === status)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  get(emailId) { const companyId = this.stateManager.get().activeCompanyId; return this.all().find(email => email.companyId === companyId && email.id === emailId) || null; }
  require(emailId) { const email = this.get(emailId); if (!email) fail('Email not found.', 404); return email; }

  // The AI writes the words. The owner chooses recipients, reviews, edits and presses Send.
  async draft(input = {}) {
    const instruction = clean(input.instruction, 4000);
    if (instruction.length < 5) fail('Describe what the email should say (at least a few words).', 400);
    const to = parseAddresses(input.to, 'To'), cc = parseAddresses(input.cc, 'Cc');
    const deliverableId = clean(input.deliverableId, 100) || null;
    const tone = clean(input.tone, 80);
    const payload = {instruction, to, cc, deliverableId, tone};
    return reuseRequest({stateManager: this.stateManager, collection: 'emails', pending: this.requests, input, payload, create: metadata => this.createDraft({instruction, to, cc, deliverableId, tone}, metadata)});
  }

  async createDraft({instruction, to, cc, deliverableId, tone}, metadata = {}) {
    const state = this.stateManager.get();
    const company = (state.companies || []).find(item => item.id === state.activeCompanyId);
    if (!company) fail('Create or open an organization before drafting an email.', 409);
    let deliverable = null;
    if (deliverableId) {
      const found = this.deliverableService.get(deliverableId);
      if (!found) fail('That document no longer exists.', 404);
      const version = (found.versions || []).find(item => item.id === found.currentVersionId) || (found.versions || []).at(-1) || {};
      deliverable = {title: found.title, content: String(version.content || '').slice(0, 8000), decisionSummary: found.why?.decisionSummary || ''};
    }
    const northStar = activeNorthStar(state);
    const senderName = this.googleService?.status().name || '';
    const prompt = prompts.emailDraft({
      company: {name: company.name, description: company.description, industry: company.industry, audience: company.audience},
      northStar: northStar ? {mission: northStar.mission, principles: northStar.principles, constraints: northStar.constraints} : null,
      instruction, deliverable, senderName, recipients: [...to, ...cc], tone,
    });
    const response = await this.provider.generate({...prompt, responseSchema: emailDraftSchema, metadata: {action: 'email_draft'}, context: {instruction, senderName}, maxOutputTokens: 2500});
    if (this.stateManager.get() !== state || state.activeCompanyId !== company.id) fail('The organization changed while the email was being drafted. Draft it again.', 409);
    this.usageService.record(response, {purpose: 'email_draft'});
    const data = response.data || {};
    const subject = cleanSubject(data.subject), body = cleanBody(data.body);
    if (!subject || !body) fail('The AI returned an empty email. Please try again with a little more detail.', 502, 'EMAIL_EMPTY');
    const createdAt = now();
    const list = value => (Array.isArray(value) ? value.map(item => clean(String(item), 400)).filter(Boolean).slice(0, 8) : []);
    const email = {
      ...metadata, id: id('eml'), companyId: company.id, status: 'draft', to, cc, subject, body, instruction,
      deliverableId, tone, concerns: list(data.concerns), constraintChecks: list(data.constraintChecks), assumptions: list(data.assumptions),
      createdBy: {type: 'user', id: 'local-user'}, draftedBy: response.provider === 'dry-run' ? 'dry-run' : `${response.provider}:${response.model}`,
      version: 1, error: null, outcomeUnknown: false, sentAt: null, gmailMessageId: null, from: null, createdAt, updatedAt: createdAt,
    };
    this.all().push(email);
    this.eventService.append('email.drafted', {actor: {type: 'user', id: 'local-user'}, entity: {type: 'email', id: email.id}, payload: {subject: email.subject, hasSource: Boolean(deliverableId)}});
    try { await this.stateManager.persist(); }
    catch (error) { state.emails = this.all().filter(item => item.id !== email.id); throw error; }
    return email;
  }

  async update(emailId, input = {}) {
    const email = this.require(emailId);
    if (!EDITABLE.has(email.status)) fail(email.status === 'sent' ? 'A sent email cannot be edited.' : 'This email cannot be edited right now.', 409);
    if (Number(input.version) !== email.version) fail('This email changed. Refresh and try again.', 409);
    const next = {};
    if (input.to !== undefined) next.to = parseAddresses(input.to, 'To');
    if (input.cc !== undefined) next.cc = parseAddresses(input.cc, 'Cc');
    if (input.subject !== undefined) next.subject = cleanSubject(input.subject);
    if (input.body !== undefined) next.body = cleanBody(input.body);
    const recipients = (next.to ?? email.to).length + (next.cc ?? email.cc).length;
    if (recipients > this.maxRecipients) fail(`An email can have at most ${this.maxRecipients} recipients.`, 400, 'EMAIL_TOO_MANY');
    const before = {...email};
    Object.assign(email, next, {version: email.version + 1, updatedAt: now(), status: email.status === 'failed' ? 'draft' : email.status, error: null, outcomeUnknown: false});
    try { await this.stateManager.persist(); } catch (error) { Object.assign(email, before); throw error; }
    return email;
  }

  async discard(emailId) {
    const email = this.require(emailId);
    if (!EDITABLE.has(email.status)) fail('Only unsent emails can be discarded.', 409);
    const before = {...email};
    Object.assign(email, {status: 'discarded', version: email.version + 1, updatedAt: now()});
    try { await this.stateManager.persist(); } catch (error) { Object.assign(email, before); throw error; }
    return email;
  }

  sentToday() {
    const since = Date.now() - 24 * 3600 * 1000;
    return this.all().filter(email => email.status === 'sent' && Date.parse(email.sentAt) >= since).length;
  }

  async send(emailId, input = {}) {
    const email = this.require(emailId);
    if (this.sending.has(email.id) || email.status === 'sending') fail('This email is already being sent.', 409);
    if (!EDITABLE.has(email.status)) fail(email.status === 'sent' ? 'This email was already sent.' : 'This email cannot be sent.', 409);
    if (Number(input.version) !== email.version) fail('This email changed. Refresh and review it before sending.', 409);
    if (email.outcomeUnknown && input.confirmResend !== true) fail('The last attempt may have been delivered. Check your Gmail Sent folder; if it is not there, confirm to send again.', 409, 'EMAIL_CONFIRM_RESEND');
    const to = parseAddresses(email.to, 'To'), cc = parseAddresses(email.cc, 'Cc');
    if (!to.length) fail('Add at least one recipient in the To field.', 400, 'EMAIL_NO_RECIPIENT');
    if (to.length + cc.length > this.maxRecipients) fail(`An email can have at most ${this.maxRecipients} recipients.`, 400, 'EMAIL_TOO_MANY');
    const subject = cleanSubject(email.subject), body = cleanBody(email.body);
    if (!subject) fail('Add a subject.', 400, 'EMAIL_NO_SUBJECT');
    if (!body) fail('The email body is empty.', 400, 'EMAIL_NO_BODY');
    if (input.allowPlaceholders !== true && (PLACEHOLDER.test(subject) || PLACEHOLDER.test(body))) fail('The email still contains text in [square brackets]. Replace it, or send anyway if the brackets are intended.', 422, 'EMAIL_PLACEHOLDER');
    if (this.sentToday() >= this.dailyLimit) fail(`Daily limit of ${this.dailyLimit} emails reached. This protects your Gmail account from looking like spam.`, 429, 'EMAIL_DAILY_LIMIT');
    const connection = this.googleService.status();
    if (!connection.connected) fail('Google is not connected. Connect it in Settings first.', 409, 'GOOGLE_NOT_CONNECTED');
    if (!connection.gmail) fail('Sending email is not enabled yet. Open Settings → Google and choose Enable email sending.', 409, 'GOOGLE_SCOPE_MISSING');

    this.sending.add(email.id);
    try {
      const before = {...email};
      Object.assign(email, {status: 'sending', to, cc, subject, body, error: null, updatedAt: now()});
      try { await this.stateManager.persist(); } catch (error) { Object.assign(email, before); throw error; }
      try {
        const raw = b64url(Buffer.from(buildMessage({from: connection.email, to, cc, subject, body}), 'utf8'));
        const result = await this.googleService.sendMail(raw);
        Object.assign(email, {status: 'sent', from: connection.email, gmailMessageId: result.id, sentAt: now(), version: email.version + 1, updatedAt: now(), error: null, outcomeUnknown: false});
        this.eventService.append('email.sent', {actor: {type: 'user', id: 'local-user'}, entity: {type: 'email', id: email.id}, payload: {recipients: to.length + cc.length}});
        await this.stateManager.persist().catch(() => {});
        return email;
      } catch (error) {
        Object.assign(email, {status: 'failed', error: String(error.message || 'Sending failed.').slice(0, 400), outcomeUnknown: Boolean(error.unknownOutcome), version: email.version + 1, updatedAt: now()});
        this.eventService.append('email.failed', {actor: {type: 'system', id: 'organa'}, entity: {type: 'email', id: email.id}, payload: {code: error.code || 'EMAIL_FAILED'}});
        await this.stateManager.persist().catch(() => {});
        throw error;
      }
    } finally { this.sending.delete(email.id); }
  }

  // After a crash or restart an email can be stuck in "sending". We cannot know whether Gmail accepted it, so ask the owner to check.
  async recoverInterrupted() {
    let changed = false;
    for (const email of this.all()) {
      if (email.status !== 'sending') continue;
      Object.assign(email, {status: 'failed', outcomeUnknown: true, error: 'Organa stopped while this email was being sent. Check your Gmail Sent folder before sending it again.', version: (email.version || 0) + 1, updatedAt: now()});
      changed = true;
    }
    if (changed) await this.stateManager.persist();
  }
}

module.exports = {EmailService, parseAddresses, buildMessage, encodeSubject, MAX_RECIPIENTS};
