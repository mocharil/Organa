(() => {
  'use strict';
  const routes = {
    overview: 'company',
    office: null,
    missions: 'mission',
    team: 'team',
    meetings: 'meetings',
    knowledge: 'review',
    goals: 'company',
    performance: 'team',
    settings: 'settings'
  };
  const mission = document.getElementById('missionDialog');
  const missionButton = document.getElementById('bMission');
  const routeButtons = [...document.querySelectorAll('[data-organa-route]')];

  function setActive(route) {
    routeButtons.forEach(button => button.classList.toggle('active', button.dataset.organaRoute === route));
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

  document.getElementById('organaNotifications')?.addEventListener('click', () => openMissionTab('review', 'knowledge'));
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
