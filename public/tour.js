(() => {
  'use strict';
  // First-run guided tour. Shown once automatically; can be skipped at any time and replayed from the sidebar.
  const DONE_KEY = 'organaTourDone';
  const steps = [
    {title: 'Welcome to Organa', body: 'Organa is an AI company you run. You give it a goal, your AI coworkers do the work, and you approve what matters. This one-minute tour shows where to click first.'},
    {target: '[data-organa-route="settings"]', title: '1. Connect the AI', body: 'Start here. Open Settings and make sure a live AI provider (Gemini) is connected. The chip at the bottom of the sidebar shows the status.'},
    {target: '[data-organa-route="missions"]', title: '2. Give the team a mission', body: 'Open Missions and describe the outcome you want. The Chief of Staff turns it into a plan with owners and dependencies. Nothing starts until you review it.'},
    {target: '[data-organa-route="tasks"]', title: '3. Follow the work', body: 'Tasks lists every piece of work and its status. You can also hand one task straight to a single coworker.'},
    {target: '[data-organa-route="approvals"]', title: '4. Approve or ask for changes', body: 'Finished drafts and meeting decisions wait here. Approve, ask for a revision, or answer a question. Important actions never happen without you.'},
    {target: '[data-organa-route="office"]', title: 'The live Office', body: 'The 3D Office shows your coworkers at their desks, in meetings, or waiting for your review. Click a coworker to see their task or send an instruction.'},
    {target: '[data-organa-route="team"]', title: 'Your AI team', body: 'See roles, edit a coworker, or ask for a new hire. New coworkers start as drafts that you review first.'},
    {target: '[data-organa-route="standup"]', title: 'Daily Stand-up', body: 'A short briefing on what the team did, what is blocked, and what needs you.'},
    {target: '#organaSimpleMenu', title: 'Too many pages?', body: 'Switch to the simple menu to hide the advanced pages. You can switch back at any time.'},
    {title: 'You are ready', body: 'Open Overview for a "Getting started" checklist that tracks your next step. You can replay this tour from "Take the tour" in the sidebar.'},
  ];
  const read = () => { try { return localStorage.getItem(DONE_KEY); } catch { return null; } };
  const write = value => { try { localStorage.setItem(DONE_KEY, value); } catch {} };
  let index = 0, active = false, spot, card, full, returnFocus;

  const visible = node => { if (!node) return false; const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden'; };
  const make = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };

  function end(mark) {
    if (!active) return;
    active = false;
    if (mark) write('1');
    spot?.remove(); card?.remove(); full?.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    returnFocus?.focus?.();
  }

  function place() {
    if (!active || !card) return;
    const step = steps[index];
    const target = step.target ? document.querySelector(step.target) : null;
    // Steps whose target is hidden (simple menu, collapsed sidebar, phone layout) fall back to a centered card.
    if (visible(target)) {
      const r = target.getBoundingClientRect(), pad = 6;
      full.hidden = true; spot.hidden = false;
      Object.assign(spot.style, {top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`});
      const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16;
      let left = r.right + gap, top = r.top + r.height / 2 - ch / 2;
      if (left + cw > innerWidth - 16) { left = Math.max(16, Math.min(r.left, innerWidth - cw - 16)); top = r.top - ch - gap; if (top < 16) top = r.bottom + gap; }
      card.style.left = `${Math.max(16, left)}px`;
      card.style.top = `${Math.max(16, Math.min(top, innerHeight - ch - 16))}px`;
    } else {
      spot.hidden = true; full.hidden = false;
      card.style.left = `${Math.max(16, (innerWidth - card.offsetWidth) / 2)}px`;
      card.style.top = `${Math.max(16, (innerHeight - card.offsetHeight) / 2)}px`;
    }
  }

  function render() {
    const step = steps[index], last = index === steps.length - 1;
    card.replaceChildren();
    card.append(make('div', 'organa-tour-progress', `Step ${index + 1} of ${steps.length}`), make('h2', null, step.title), make('p', null, step.body));
    const actions = make('div', 'organa-tour-actions');
    const skip = make('button', 'organa-tour-btn link', last ? 'Close' : 'Skip tour'); skip.type = 'button'; skip.onclick = () => end(true);
    const back = make('button', 'organa-tour-btn', 'Back'); back.type = 'button'; back.disabled = index === 0; back.onclick = () => { index -= 1; render(); };
    const next = make('button', 'organa-tour-btn primary', last ? 'Finish' : 'Next'); next.type = 'button'; next.onclick = () => { if (last) end(true); else { index += 1; render(); } };
    actions.append(skip, make('span', 'spacer'), back, next);
    card.append(actions);
    card.setAttribute('aria-label', `${step.title}, step ${index + 1} of ${steps.length}`);
    place();
    next.focus();
  }

  function onKey(event) {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); end(true); }
    else if (event.key === 'Tab') { // keep focus inside the tour card
      const items = [...card.querySelectorAll('button:not([disabled])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  function start() {
    if (active) return;
    active = true; index = 0; returnFocus = document.activeElement;
    full = make('div', 'organa-tour-full'); spot = make('div', 'organa-tour-spot'); spot.hidden = true;
    card = make('div', 'organa-tour-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    document.body.append(full, spot, card);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    render();
  }

  function whenReady(callback) {
    const tick = () => document.body.classList.contains('organa-loading') ? setTimeout(tick, 400) : setTimeout(callback, 600);
    tick();
  }

  document.getElementById('organaTakeTour')?.addEventListener('click', () => {
    const mission = document.getElementById('missionDialog');
    if (mission?.open) mission.close();
    start();
  });
  window.OrganaTour = {start};
  // Auto-start once, but never over the onboarding wizard or in automated browsers (tests can call OrganaTour.start()).
  if (read() !== '1' && !navigator.webdriver && !new URLSearchParams(location.search).has('onboarding')) whenReady(() => { if (read() !== '1') start(); });
})();
