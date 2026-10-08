(() => {
  'use strict';
  const routes = {
    overview: 'company',
    office: null,
    missions: 'mission',
    team: 'team',
    meetings: 'meetings',
    knowledge: 'knowledge',
    approvals: 'review',
    standup: 'standup',
    goals: 'goals',
    performance: 'performance',
    settings: 'settings'
  };
  const mission = document.getElementById('missionDialog');
  const taskDialog = document.getElementById('taskDialog');
  const sidebar = document.getElementById('appSidebar');
  const mobileMenu = document.getElementById('organaMobileMenu');
  let taskReturnRoute = 'office';
  function closeMenu() { sidebar?.classList.remove('mobile-menu-open'); mobileMenu?.setAttribute('aria-expanded', 'false'); }
  mobileMenu?.addEventListener('click', () => { const open = sidebar.classList.toggle('mobile-menu-open'); mobileMenu.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && sidebar?.classList.contains('mobile-menu-open')) { event.preventDefault(); event.stopImmediatePropagation(); closeMenu(); mobileMenu.focus(); } }, true);
  document.addEventListener('click', event => { if (!sidebar?.contains(event.target)) closeMenu(); });
  taskDialog?.addEventListener('close', () => { if (document.querySelector('[data-organa-route="tasks"]')?.getAttribute('aria-current')) setActive(mission?.open ? taskReturnRoute : 'office'); });
  const routeButtons = [...document.querySelectorAll('[data-organa-route]')];

  function setActive(route) {
    routeButtons.forEach(button => {
      const active = button.dataset.organaRoute === route;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  const aiStatus = document.getElementById('organaAiStatus');
  function renderAiStatus(settings) {
    if (!aiStatus) return;
    const runtime = settings?.runtime || {};
    const provider = (settings?.providers || []).find(item => item.id === settings?.provider);
    if (runtime.status === 'error') {
      aiStatus.dataset.mode = 'error';
      aiStatus.textContent = 'AI setup needs attention';
      aiStatus.title = runtime.lastError?.message || 'The selected AI provider could not complete a request. Open Settings to review authentication.';
      return;
    }
    if (runtime.usingLiveAi) {
      aiStatus.dataset.mode = 'live';
      aiStatus.textContent = `AI · ${provider?.label || runtime.selectedProviderLabel || settings.provider || 'configured'}`;
      aiStatus.title = `Live provider selected${settings?.model ? ` · ${settings.model}` : ''}. Authentication is verified on model requests.`;
      return;
    }
    aiStatus.dataset.mode = 'deterministic';
    aiStatus.textContent = runtime.liveProviderConfigured ? 'AI · deterministic mode' : 'AI not connected · demo mode';
    aiStatus.title = runtime.liveProviderConfigured
      ? 'A live provider is configured, but deterministic mode is selected. Open Settings to switch.'
      : 'No live AI provider is configured. Organa remains usable in deterministic demo mode.';
  }
  async function refreshAiStatus() {
    try {
      const response = await fetch('/api/llm/settings', {cache:'no-store'});
      if (!response.ok) return;
      renderAiStatus(await response.json());
    } catch { /* workspace remains usable if status cannot be loaded */ }
  }

  function openMissionTab(tab, route) {
    setActive(route);
    window.OrganaWorkspace?.open(tab);
  }

  aiStatus?.addEventListener('click', () => openMissionTab('settings', 'settings'));
  refreshAiStatus();
  document.addEventListener('organa:ai-settings-changed', refreshAiStatus);
  document.addEventListener('organa:ai-provider-error', () => refreshAiStatus());

  routeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const route = button.dataset.organaRoute;
      closeMenu();
      if (route === 'tasks') { taskReturnRoute = document.querySelector('[data-organa-route][aria-current="page"]')?.dataset.organaRoute || 'office'; window.officeTasks?.open(); setActive('tasks'); return; }
      const tab = routes[route];
      if (route === 'office') {
        if (mission?.open) mission.close();
        document.getElementById('taskDialog')?.open && document.getElementById('taskDialog').close();
        setActive('office');
        return;
      }
      if (tab) openMissionTab(tab, route);
    });
  });

  document.getElementById('organaNotifications')?.addEventListener('click', () => openMissionTab('review', 'approvals'));
  mission?.addEventListener('close', () => { if (!mission.open) setActive('office'); });
  routeButtons.forEach(button => button.setAttribute('aria-label', button.textContent.trim()));
  setActive('office');
})();

// Branded progressive loading copy. The 3D scene owns when the splash closes.
(() => {
  const title = document.getElementById('organaBootTitle');
  const step = document.getElementById('organaBootStep');
  if (!title || !step || !document.body.classList.contains('organa-loading')) return;
  const stages = [
    ['Understanding your organization', 'Connecting goals, context, and AI coworkers.'],
    ['Designing the workspace', 'Preparing the rooms and collaboration surfaces your team uses.'],
    ['Selecting AI specialists', 'Matching responsibilities, status, and active work.'],
    ['Preparing your team', 'Bringing the organization online with human control intact.']
  ];
  let index = 0;
  const timer = setInterval(() => {
    if (!document.body.classList.contains('organa-loading')) {
      clearInterval(timer);
      return;
    }
    index = Math.min(index + 1, stages.length - 1);
    title.textContent = stages[index][0];
    step.textContent = stages[index][1];
  }, 650);
})();


// Desktop sidebar fold / unfold for a wider 3D office view.
(() => {
  const body = document.body;
  const toggle = document.getElementById('sidebarToggle');
  if (!body || !toggle) return;
  const key = 'organaSidebarCollapsed';

  const apply = collapsed => {
    body.classList.toggle('sidebar-collapsed', collapsed);
    toggle.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    toggle.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  };

  try {
    apply(localStorage.getItem(key) === '1');
  } catch {
    apply(false);
  }

  toggle.addEventListener('click', () => {
    const next = !body.classList.contains('sidebar-collapsed');
    apply(next);
    try { localStorage.setItem(key, next ? '1' : '0'); } catch {}
  });
})();
