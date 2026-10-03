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
  const missionButton = document.getElementById('bMission');
  const routeButtons = [...document.querySelectorAll('[data-organa-route]')];

  function setActive(route) {
    routeButtons.forEach(button => button.classList.toggle('active', button.dataset.organaRoute === route));
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
    missionButton?.click();
    const choose = () => {
      const tabButton = document.querySelector(`[data-mc-tab="${tab}"]`);
      if (tabButton) tabButton.click();
      setActive(route);
    };
    setTimeout(choose, 40);
  }

  aiStatus?.addEventListener('click', () => openMissionTab('settings', 'settings'));
  refreshAiStatus();
  document.addEventListener('organa:ai-settings-changed', refreshAiStatus);
  document.addEventListener('organa:ai-provider-error', () => refreshAiStatus());

  routeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const route = button.dataset.organaRoute;
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
  mission?.addEventListener('close', () => setActive('office'));
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
