(() => {
  'use strict';
  // Workspace switcher, demo workspace, backups, and per-deliverable extras (constraint guard, download, copy).
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const btn = (text, cls = 'mc-secondary') => { const b = el('button', text, cls); b.type = 'button'; return b; };

  async function call(method, path, body) {
    const response = await fetch(path, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || `Server error ${response.status}`);
    return data;
  }
  const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'}); };

  // ---- Header switcher ----------------------------------------------------------------------------
  async function mountSwitcher() {
    const row = document.querySelector('.workspace-title-row');
    if (!row) return;
    let list;
    try { list = await call('GET', '/api/workspaces'); } catch { return; }
    row.querySelector('.workspace-switch')?.remove();
    row.querySelector('.workspace-demo-tag')?.remove();
    const active = list.find(item => item.active);
    if (active?.demo) row.querySelector('strong')?.after(el('span', 'DEMO', 'workspace-demo-tag'));
    if (list.length < 2) return;
    const select = el('select', null, 'workspace-switch');
    select.setAttribute('aria-label', 'Switch workspace');
    for (const item of list) { const option = el('option', `${item.name}${item.demo ? ' (demo)' : ''}`); option.value = item.id; select.append(option); }
    select.value = active?.id || '';
    select.onchange = async () => {
      select.disabled = true;
      try { await call('POST', `/api/workspaces/${encodeURIComponent(select.value)}/activate`, {}); location.reload(); }
      catch (error) { select.disabled = false; select.value = active?.id || ''; document.dispatchEvent(new CustomEvent('organa:status', {detail: error.message})); }
    };
    row.append(select);
  }

  // ---- Settings cards -----------------------------------------------------------------------------
  function mountSettings(content, helpers = {}) {
    const setStatus = helpers.setStatus || (() => {});
    const workspaces = el('section', null, 'mc-card full');
    workspaces.append(el('h3', 'Workspaces'), el('p', 'Each workspace is a separate organization with its own team, goals and work. Switching never deletes anything.', 'mc-muted'));
    const wsList = el('div', null, 'mc-list');
    workspaces.append(wsList);
    const backups = el('section', null, 'mc-card full');
    backups.append(el('h3', 'Backups'), el('p', 'Organa saves a safety copy of your workspace automatically (at most every 10 minutes while you work) and before loading or removing demo data. Restoring first saves your current state too.', 'mc-muted'));
    const bkActions = el('div', null, 'mc-actions'), bkList = el('div', null, 'mc-list');
    const snap = btn('Back up now', 'mc-primary');
    bkActions.append(snap);
    backups.append(bkActions, bkList);
    content.append(workspaces, backups);

    const failure = error => { setStatus(error.message); };
    async function refreshWorkspaces() {
      let list;
      try { list = await call('GET', '/api/workspaces'); } catch (error) { wsList.replaceChildren(el('p', error.message, 'mc-muted')); return; }
      wsList.replaceChildren();
      for (const item of list) {
        const row = el('div', null, 'mc-event');
        const title = el('strong', item.name + (item.demo ? ' · demo' : ''));
        const meta = el('span', `${item.counts.agents} coworkers · ${item.counts.tasks} tasks · ${item.counts.needsReview} awaiting review · ${item.counts.deliverables} documents`, 'mc-muted');
        const copy = el('div'); copy.append(title, el('br'), meta);
        row.append(copy);
        if (item.active) row.append(el('span', 'ACTIVE', 'mc-badge done'));
        else {
          const go = btn('Switch');
          go.onclick = async () => { go.disabled = true; try { await call('POST', `/api/workspaces/${encodeURIComponent(item.id)}/activate`, {}); location.reload(); } catch (error) { go.disabled = false; failure(error); } };
          row.append(go);
        }
        wsList.append(row);
      }
      const hasDemo = list.some(item => item.demo);
      const tools = el('div', null, 'mc-actions');
      const demo = btn(hasDemo ? 'Open the demo workspace' : 'Add the Nusa Coffee demo workspace');
      demo.onclick = async () => { demo.disabled = true; setStatus('Preparing the demo workspace…'); try { await call('POST', '/api/workspaces/demo', {}); location.reload(); } catch (error) { demo.disabled = false; failure(error); } };
      tools.append(demo);
      if (hasDemo && list.length > 1) {
        const remove = btn('Remove the demo workspace');
        remove.onclick = async () => { if (!confirm('Remove the demo workspace? Your own workspaces are not affected, and a backup is saved first.')) return; remove.disabled = true; try { await call('DELETE', '/api/workspaces/demo'); location.reload(); } catch (error) { remove.disabled = false; failure(error); } };
        tools.append(remove);
      }
      wsList.append(tools);
    }
    async function refreshBackups() {
      let list;
      try { list = await call('GET', '/api/backups'); } catch (error) { bkList.replaceChildren(el('p', error.message, 'mc-muted')); return; }
      bkList.replaceChildren();
      if (!list.length) bkList.append(el('p', 'No backups yet. The first one is created the next time your work is saved.', 'mc-muted'));
      for (const item of list.slice(0, 12)) {
        const row = el('div', null, 'mc-event');
        const labels = {auto: 'Automatic', manual: 'Manual', predemo: 'Before demo change', prerestore: 'Before a restore', switch: 'Before switching'};
        const copy = el('div'); copy.append(el('strong', labels[item.label] || item.label), el('br'), el('span', `${when(item.createdAt)} · ${Math.max(1, Math.round(item.size / 1024))} KB`, 'mc-muted'));
        const restore = btn('Restore');
        restore.onclick = async () => {
          if (!confirm('Restore this backup? Your current state is saved as a new backup first, and AI settings are kept.')) return;
          restore.disabled = true;
          try { await call('POST', `/api/backups/${encodeURIComponent(item.name)}/restore`, {}); location.reload(); } catch (error) { restore.disabled = false; failure(error); }
        };
        row.append(copy, restore);
        bkList.append(row);
      }
    }
    snap.onclick = async () => { snap.disabled = true; try { await call('POST', '/api/backups', {}); setStatus('Backup saved.'); await refreshBackups(); } catch (error) { failure(error); } finally { snap.disabled = false; } };
    refreshWorkspaces(); refreshBackups();
    mountGoogle(content, setStatus);
  }

  // ---- Google Docs / Sheets ------------------------------------------------------------------------
  let googleCache = null;
  function googleStatus() {
    if (googleCache && Date.now() - googleCache.at < 20000) return googleCache.promise;
    const promise = call('GET', '/api/google/status').catch(() => null);
    googleCache = {at: Date.now(), promise};
    return promise;
  }
  function mountGoogle(content, setStatus) {
    const card = el('section', null, 'mc-card full');
    card.append(el('h3', 'Google Docs and Sheets'));
    const body = el('div'); card.append(body); content.append(card);
    async function draw() {
      googleCache = null;
      const status = await googleStatus();
      body.replaceChildren();
      if (!status) { body.append(el('p', 'Google status is unavailable right now.', 'mc-muted')); return; }
      const actions = el('div', null, 'mc-actions');
      if (status.connected) {
        body.append(el('p', `Connected${status.email ? ` as ${status.email}` : ''}. Every finished document now has Save to Google Docs and Save to Google Sheets. Organa can only open the files it creates itself.`, 'mc-muted'));
        const off = btn('Disconnect Google');
        off.onclick = async () => { off.disabled = true; try { await call('POST', '/api/google/disconnect', {}); await draw(); } catch (error) { off.disabled = false; setStatus(error.message); } };
        actions.append(off);
      } else if (status.configured) {
        body.append(el('p', 'Connect your Google account to save results as real Google Docs and Sheets in your own Drive. Organa asks only for access to the files it creates, never your other files or email.', 'mc-muted'));
        const on = btn('Connect Google', 'mc-primary');
        on.onclick = async () => { on.disabled = true; try { const out = await call('POST', '/api/google/connect', {}); location.assign(out.url); } catch (error) { on.disabled = false; setStatus(error.message); } };
        actions.append(on);
      } else {
        body.append(el('p', 'One-time setup needed: create a Google OAuth client and add its ID and secret to .env, then restart. Step by step: docs/GOOGLE_SETUP.md. Until then, Download .docx and .csv still work and open in Google Docs and Sheets.', 'mc-muted'));
        const code = el('code', `GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
Redirect URI to register: ${status.redirectUri}`); body.append(code);
      }
      body.append(actions);
    }
    draw();
  }

  // ---- Deliverable extras -------------------------------------------------------------------------
  function deliverableExtras(deliverable) {
    const wrap = el('div', null, 'organa-deliverable-extras');
    const checks = (deliverable.why?.constraintChecks || []).filter(item => String(item || '').trim());
    if (checks.length) {
      const guard = el('details', null, 'organa-guard');
      guard.append(el('summary', `Constraint guard · ${checks.length} check${checks.length === 1 ? '' : 's'} recorded`));
      const ul = el('ul'); checks.forEach(item => ul.append(el('li', item))); guard.append(ul);
      wrap.append(guard);
    } else wrap.append(el('span', 'No constraint check recorded', 'organa-guard-none'));
    const tools = el('div', null, 'mc-actions');
    const downloads = [['docx', 'Download .docx', 'Word or Google Docs'], ['csv', 'Download .csv', 'Excel or Google Sheets'], ['md', 'Download .md', 'Markdown']].map(([format, text, hint]) => {
      const link = el('a', text, 'mc-secondary organa-download');
      link.href = `/api/deliverables/${encodeURIComponent(deliverable.id)}/export?format=${format}`;
      link.title = hint;
      link.setAttribute('download', '');
      return link;
    });
    const copy = btn('Copy text');
    copy.onclick = async () => {
      const version = deliverable.versions?.find(item => item.id === deliverable.currentVersionId) || deliverable.versions?.at(-1);
      try { await navigator.clipboard.writeText(`${deliverable.title}\n\n${version?.content || ''}`); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy text'; }, 1500); }
      catch { copy.textContent = 'Copy failed'; }
    };
    const mail = btn('Draft an email');
    mail.title = 'Write an email based on this document';
    mail.onclick = () => { if (window.OrganaEmails) window.OrganaEmails.prefill = {deliverableId: deliverable.id, title: deliverable.title}; window.OrganaWorkspace?.open('emails'); };
    tools.append(...downloads, copy, mail);
    wrap.append(tools);
    // "Save to Google" buttons appear only once Google is connected.
    googleStatus().then(status => {
      if (!status?.connected) return;
      const row = el('div', null, 'mc-actions'), note = el('span', '', 'mc-muted organa-google-note');
      for (const [target, text] of [['docs', 'Save to Google Docs'], ['sheets', 'Save to Google Sheets']]) {
        const save = btn(text, 'mc-secondary');
        save.onclick = async () => {
          save.disabled = true; note.textContent = 'Saving to your Google Drive…';
          try {
            const out = await call('POST', `/api/deliverables/${encodeURIComponent(deliverable.id)}/save-to-google`, {target});
            note.textContent = '';
            const link = el('a', `Open "${out.name}" in ${out.target}`); link.href = out.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
            note.replaceChildren(link);
          } catch (error) { note.textContent = error.message; if (/connect google again/i.test(error.message)) googleCache = null; }
          finally { save.disabled = false; }
        };
        row.append(save);
      }
      row.append(note);
      wrap.append(row);
    });
    return wrap;
  }

  // ---- Web research toggle (remembered per browser) ------------------------------------------------
  const RESEARCH_KEY = 'organaWebResearch';
  const readPref = () => { try { return localStorage.getItem(RESEARCH_KEY) === '1'; } catch { return false; } };
  function bindResearchCheckbox(input) {
    input.checked = readPref();
    input.addEventListener('change', () => { try { localStorage.setItem(RESEARCH_KEY, input.checked ? '1' : '0'); } catch { /* preference only */ } });
    return input;
  }
  function researchToggle() {
    const label = el('label', null, 'organa-research-toggle');
    const input = el('input'); input.type = 'checkbox';
    bindResearchCheckbox(input);
    label.append(input, el('span', ' Use web research: searches the live web and cites sources (adds about 10-20 seconds per task)'));
    return {label, get checked() { return input.checked; }};
  }

  window.OrganaWorkspaces = {mountSettings, deliverableExtras, mountSwitcher, researchToggle, bindResearchCheckbox};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSwitcher); else mountSwitcher();
})();
