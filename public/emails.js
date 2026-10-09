(() => {
  'use strict';
  // Emails: the AI drafts, the owner chooses recipients, edits, and sends from their own Gmail. Nothing is ever sent automatically.
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const btn = (text, cls = 'mc-secondary') => { const b = el('button', text, cls); b.type = 'button'; return b; };
  const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'}); };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  async function call(method, path, body) {
    const response = await fetch(path, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(typeof data.error === 'string' ? data.error : data.error?.message || `Server error ${response.status}`); error.code = data.code || ''; error.status = response.status; throw error; }
    return data;
  }

  function field(label, control, hint) {
    const wrap = el('label', null, 'organa-mail-field');
    wrap.append(el('span', label, 'organa-mail-label'), control);
    if (hint) wrap.append(el('small', hint, 'mc-muted'));
    return wrap;
  }
  const input = (value = '', placeholder = '') => { const i = el('input'); i.type = 'text'; i.value = value; i.placeholder = placeholder; i.autocomplete = 'off'; i.spellcheck = false; return i; };
  const textarea = (value = '', rows = 4, placeholder = '') => { const t = el('textarea'); t.rows = rows; t.value = value; t.placeholder = placeholder; return t; };

  // Opens Gmail's compose window pre-filled. Works without any connection; the owner presses Send in Gmail.
  function composeLink(email) {
    const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}\n\n[text shortened; copy the full body from Organa]` : text);
    const params = new URLSearchParams({view: 'cm', fs: '1', to: (email.to || []).join(','), su: email.subject || '', body: clip(email.body || '', 1800)});
    if ((email.cc || []).length) params.set('cc', email.cc.join(','));
    return `https://mail.google.com/mail/?${params}`;
  }

  function statusBadge(status) {
    const map = {draft: ['DRAFT', 'warn'], failed: ['NOT SENT', 'blocked'], sent: ['SENT', 'done'], sending: ['SENDING', 'active'], discarded: ['DISCARDED', '']};
    const [text, cls] = map[status] || [String(status).toUpperCase(), ''];
    return el('span', text, `mc-badge ${cls}`.trim());
  }

  function render(content, ctx = {}) {
    const setStatus = ctx.setStatus || (() => {});
    const reload = ctx.reload || (() => {});
    const documents = ctx.state?.deliverables || [];
    const emails = ctx.state?.emails || [];
    let google = null;

    // ---- Connection banner ------------------------------------------------------------------------
    const banner = el('section', null, 'mc-card full organa-mail-banner');
    banner.hidden = true;
    content.append(banner);
    call('GET', '/api/google/status').then(status => {
      google = status;
      banner.replaceChildren();
      if (status.connected && status.gmail) {
        banner.hidden = false; banner.classList.add('ok');
        banner.append(el('p', `Sending as ${status.email || 'your Google account'}. You review every email and press Send yourself.`, 'mc-muted'));
        return;
      }
      banner.hidden = false;
      banner.append(el('strong', 'Sending is not enabled yet'));
      if (!status.configured) {
        banner.append(el('p', 'You can already draft emails and open them in Gmail to send. To send from here, finish the one-time Google setup (docs/GOOGLE_SETUP.md), then choose Enable email sending in Settings.', 'mc-muted'));
        return;
      }
      banner.append(el('p', 'Drafting works now, and "Open in Gmail" needs no setup. To send from Organa, allow the send-only Gmail permission. Organa cannot read, search or delete your email.', 'mc-muted'));
      const enable = btn('Enable email sending', 'mc-primary');
      enable.onclick = async () => {
        enable.disabled = true;
        try { const out = await call('POST', '/api/google/connect', {capabilities: status.drive ? ['drive', 'gmail'] : ['gmail']}); location.assign(out.url); }
        catch (error) { enable.disabled = false; setStatus(error.message); }
      };
      banner.append(enable);
    }).catch(() => {});

    // ---- New email form -----------------------------------------------------------------------------
    const create = el('section', null, 'mc-card full');
    create.append(el('h3', 'Write an email'), el('p', 'Say what the email should do. The AI writes a draft using your company context and hard constraints. You choose who receives it.', 'mc-muted'));
    const form = el('form', null, 'mc-form organa-mail-form');
    const what = textarea('', 4, 'Example: Thank Budi for the call and ask whether we can book a 15 minute follow-up next week to review the launch plan.');
    what.required = true; what.maxLength = 4000;
    const to = input('', 'name@company.com, other@company.com'); const cc = input('', 'Optional');
    const source = el('select'); const none = el('option', 'No source document'); none.value = ''; source.append(none);
    for (const doc of documents.slice(0, 40)) { const option = el('option', doc.title.slice(0, 90)); option.value = doc.id; source.append(option); }
    const tone = el('select');
    for (const [value, label] of [['', 'Warm and professional'], ['formal', 'Formal'], ['friendly and relaxed', 'Friendly'], ['short and direct', 'Short and direct']]) { const option = el('option', label); option.value = value; tone.append(option); }
    const prefill = window.OrganaEmails.prefill;
    if (prefill?.deliverableId) { source.value = prefill.deliverableId; if (!what.value) what.value = `Write a short email that shares the key points of "${prefill.title || 'this document'}".`; window.OrganaEmails.prefill = null; }
    const drafting = el('p', '', 'mc-muted'); drafting.setAttribute('role', 'status');
    const submit = btn('Draft with AI', 'mc-primary'); submit.type = 'submit';
    form.append(field('What should the email say?', what), field('To (you choose the recipients)', to, 'Plain addresses, separated by commas. Up to 10 recipients in total.'), field('Cc', cc), field('Based on a document', source), field('Tone', tone), submit, drafting);
    form.onsubmit = async event => {
      event.preventDefault();
      if (!what.value.trim()) return;
      submit.disabled = true; drafting.textContent = 'Drafting the email. This usually takes 10-20 seconds…';
      try {
        await call('POST', '/api/emails/draft', {instruction: what.value.trim(), to: to.value, cc: cc.value, deliverableId: source.value || undefined, tone: tone.value || undefined, clientRequestId: uid()});
        setStatus('Draft ready. Review it below before sending.');
        await reload();
      } catch (error) { drafting.textContent = error.message; submit.disabled = false; }
    };
    create.append(form);
    content.append(create);

    // ---- Drafts waiting for the owner ---------------------------------------------------------------
    const open = emails.filter(item => item.status === 'draft' || item.status === 'failed' || item.status === 'sending');
    const sent = emails.filter(item => item.status === 'sent');
    const pending = el('section', null, 'mc-card full');
    pending.append(el('h3', `Drafts to review · ${open.length}`));
    if (!open.length) pending.append(el('p', 'No drafts waiting. Write one above.', 'mc-muted'));
    for (const email of open) pending.append(editor(email));
    content.append(pending);

    // ---- Sent ---------------------------------------------------------------------------------------
    const history = el('section', null, 'mc-card full');
    history.append(el('h3', `Sent · ${sent.length}`));
    if (!sent.length) history.append(el('p', 'Emails you send from Organa are listed here.', 'mc-muted'));
    for (const email of sent.slice(0, 20)) {
      const row = el('div', null, 'mc-event');
      const copy = el('div'); copy.append(el('strong', email.subject), el('br'), el('span', `To ${email.to.join(', ')}${email.cc?.length ? ` · Cc ${email.cc.join(', ')}` : ''} · ${when(email.sentAt)}`, 'mc-muted'));
      row.append(copy);
      if (email.gmailMessageId) { const link = el('a', 'Open in Gmail'); link.href = `https://mail.google.com/mail/u/0/#sent/${encodeURIComponent(email.gmailMessageId)}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link); }
      history.append(row);
    }
    content.append(history);

    // ---- One editable draft ---------------------------------------------------------------------------
    function editor(email) {
      const card = el('article', null, 'organa-mail-card');
      const head = el('div', null, 'organa-mail-head');
      head.append(statusBadge(email.status), el('span', `Drafted ${when(email.createdAt)}${email.draftedBy && email.draftedBy !== 'dry-run' ? '' : ' · demo draft'}`, 'mc-muted'));
      card.append(head);
      if (email.error) card.append(el('p', email.error, 'organa-mail-error'));
      if (email.concerns?.length) { const box = el('div', null, 'organa-mail-concerns'); box.append(el('strong', 'Check before sending')); const ul = el('ul'); email.concerns.forEach(item => ul.append(el('li', item))); box.append(ul); card.append(box); }
      const to = input(email.to.join(', '), 'name@company.com'), cc = input((email.cc || []).join(', '), 'Optional'), subject = input(email.subject);
      subject.maxLength = 200;
      const body = textarea(email.body, 11); body.maxLength = 20000;
      card.append(field('To', to), field('Cc', cc), field('Subject', subject), field('Message', body));
      if (email.constraintChecks?.length || email.assumptions?.length) {
        const why = el('details', null, 'organa-guard');
        why.append(el('summary', 'How the AI checked this'));
        const ul = el('ul');
        (email.constraintChecks || []).forEach(item => ul.append(el('li', `Checked: ${item}`)));
        (email.assumptions || []).forEach(item => ul.append(el('li', `Assumed: ${item}`)));
        why.append(ul); card.append(why);
      }
      const note = el('p', '', 'mc-muted'); note.setAttribute('role', 'status');
      const actions = el('div', null, 'mc-actions');
      const save = btn('Save changes'), send = btn('Send via Gmail', 'mc-primary'), copy = btn('Copy'), discard = btn('Discard');
      const gmail = el('a', 'Open in Gmail', 'mc-secondary organa-download'); gmail.target = '_blank'; gmail.rel = 'noopener noreferrer'; gmail.title = 'Opens Gmail with this draft; no connection needed';
      const refreshLink = () => { gmail.href = composeLink({to: to.value.split(/[\s,;]+/).filter(Boolean), cc: cc.value.split(/[\s,;]+/).filter(Boolean), subject: subject.value, body: body.value}); };
      for (const control of [to, cc, subject, body]) control.addEventListener('input', refreshLink);
      refreshLink();
      let version = email.version;
      const persist = async () => { const updated = await call('PATCH', `/api/emails/${encodeURIComponent(email.id)}`, {version, to: to.value, cc: cc.value, subject: subject.value, body: body.value}); version = updated.version; return updated; };
      const busy = value => { for (const b of [save, send, discard, copy]) b.disabled = value; };
      save.onclick = async () => { busy(true); try { await persist(); note.textContent = 'Saved.'; } catch (error) { note.textContent = error.message; } finally { busy(false); } };
      copy.onclick = async () => { try { await navigator.clipboard.writeText(`To: ${to.value}\nSubject: ${subject.value}\n\n${body.value}`); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); } catch { copy.textContent = 'Copy failed'; } };
      discard.onclick = async () => { if (!confirm('Discard this draft? It will not be sent.')) return; busy(true); try { await call('POST', `/api/emails/${encodeURIComponent(email.id)}/discard`, {}); await reload(); } catch (error) { note.textContent = error.message; busy(false); } };
      send.onclick = async () => {
        if (!google?.gmail) { note.textContent = 'Sending is not enabled yet. Use "Enable email sending" at the top, or "Open in Gmail".'; return; }
        const recipients = [...to.value.split(/[\s,;]+/), ...cc.value.split(/[\s,;]+/)].filter(Boolean);
        if (!recipients.length) { note.textContent = 'Add at least one recipient in To.'; return; }
        if (!confirm(`Send this email now?\n\nFrom: ${google.email || 'your Google account'}\nTo: ${to.value}${cc.value.trim() ? `\nCc: ${cc.value}` : ''}\nSubject: ${subject.value}\n\nThis cannot be undone.`)) return;
        busy(true); note.textContent = 'Sending…';
        try {
          await persist();
          let extra = {};
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try { await call('POST', `/api/emails/${encodeURIComponent(email.id)}/send`, {version, ...extra}); setStatus('Email sent.'); await reload(); return; }
            catch (error) {
              if (error.code === 'EMAIL_PLACEHOLDER' && confirm('The email still contains text in [square brackets]. Send anyway?')) { extra = {...extra, allowPlaceholders: true}; continue; }
              if (error.code === 'EMAIL_CONFIRM_RESEND' && confirm('The last attempt may already have been delivered. Check your Gmail Sent folder first. Send it again?')) { extra = {...extra, confirmResend: true}; continue; }
              throw error;
            }
          }
        } catch (error) {
          // Keep the editor (and the text) in place. A failed attempt bumps the version on the server, so pick up the new one.
          note.textContent = error.message;
          try { version = (await call('GET', `/api/emails/${encodeURIComponent(email.id)}`)).version; } catch { /* the next save will report any conflict */ }
        } finally { busy(false); }
      };
      actions.append(send, save, gmail, copy, discard);
      card.append(actions, note);
      return card;
    }
  }

  window.OrganaEmails = {render, prefill: null, composeLink};
})();
