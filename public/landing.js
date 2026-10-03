const header=document.querySelector('.site-header');
const toggle=document.querySelector('.nav-toggle');
if(toggle&&header){
  toggle.addEventListener('click',()=>{
    const expanded=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',String(!expanded));
    header.classList.toggle('open',!expanded);
  });
  document.querySelectorAll('.site-nav a,.nav-cta a,.nav-cta button').forEach(control=>{
    control.addEventListener('click',()=>{
      header.classList.remove('open');
      toggle.setAttribute('aria-expanded','false');
    });
  });
}


// Elegant floating header: full-width at the top, compact centered pill on scroll.
(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const threshold = 72;
  let ticking = false;

  const updateHeader = () => {
    const shouldCompact = window.scrollY > threshold && !header.classList.contains('open');
    header.classList.toggle('is-compact', shouldCompact);
    ticking = false;
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateHeader);
  };

  updateHeader();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });

  const navToggle = document.querySelector('.nav-toggle');
  navToggle?.addEventListener('click', () => window.requestAnimationFrame(updateHeader));
  document.querySelectorAll('.site-nav a,.nav-cta a,.nav-cta button').forEach(control => {
    control.addEventListener('click', () => window.requestAnimationFrame(updateHeader));
  });
})();

const videoDialog=document.getElementById('demoVideoDialog');
const demoVideo=document.getElementById('organaDemoVideo');
function openDemoVideo(){
  if(!videoDialog)return;
  if(!videoDialog.open)videoDialog.showModal();
  if(demoVideo){
    demoVideo.currentTime=0;
    const play=demoVideo.play();
    if(play?.catch)play.catch(()=>{});
  }
}
function closeDemoVideo(){
  if(demoVideo)demoVideo.pause();
  if(videoDialog?.open)videoDialog.close();
}
document.querySelectorAll('[data-video-open]').forEach(button=>button.addEventListener('click',openDemoVideo));
document.querySelectorAll('[data-video-close]').forEach(button=>button.addEventListener('click',closeDemoVideo));
videoDialog?.addEventListener('click',event=>{if(event.target===videoDialog)closeDemoVideo();});
videoDialog?.addEventListener('close',()=>demoVideo?.pause());

// Live branching Organa organization flow animation.
(() => {
  const panel = document.getElementById('orgFlowMap');
  if (!panel) return;

  const founder = panel.querySelector('.founder-card');
  const chief = panel.querySelector('.chief-card');
  const divisions = [...panel.querySelectorAll('.org-flow-division')];
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const cycleMs = reduceMotion ? 14000 : 8200;

  function resetAll() {
    panel.classList.remove('animate-top', 'animate-chief', 'animate-rail', 'animate-bottom');
    founder?.classList.remove('active');
    chief?.classList.remove('active');
    divisions.forEach((division) => {
      division.classList.remove('active');
      division.querySelectorAll('.org-flow-agent').forEach((agent) => agent.classList.remove('reveal', 'active'));
    });
  }

  function runCycle() {
    resetAll();
    void panel.offsetWidth;

    panel.classList.add('animate-top');
    founder?.classList.add('active');

    const base1 = reduceMotion ? 1100 : 650;
    const base2 = reduceMotion ? 1900 : 1250;
    const start0 = reduceMotion ? 2600 : 1800;
    const divStep = reduceMotion ? 520 : 330;
    const chipDelay = reduceMotion ? 260 : 220;
    const activeWindow = reduceMotion ? 1500 : 1200;
    const clearAt = reduceMotion ? 10300 : 6200;

    setTimeout(() => {
      panel.classList.add('animate-chief');
      chief?.classList.add('active');
    }, base1);

    setTimeout(() => {
      panel.classList.add('animate-rail', 'animate-bottom');
    }, base2);

    divisions.forEach((division, i) => {
      const start = start0 + i * divStep;
      const agents = [...division.querySelectorAll('.org-flow-agent')];
      setTimeout(() => division.classList.add('active'), start);
      agents.forEach((agent, j) => {
        setTimeout(() => agent.classList.add('reveal'), start + 150 + j * chipDelay);
        setTimeout(() => agent.classList.add('active'), start + 240 + j * chipDelay);
        setTimeout(() => agent.classList.remove('active'), start + 820 + j * chipDelay);
      });
      setTimeout(() => division.classList.remove('active'), start + activeWindow);
    });

    setTimeout(() => {
      founder?.classList.remove('active');
      chief?.classList.remove('active');
    }, clearAt);
  }

  runCycle();
  setInterval(runCycle, cycleMs);
})();

// Organa organization flow: founder → Chief of Staff → divisions → specialist agents.
(() => {
  const panel = document.getElementById('organaOrganizationFlow');
  if (!panel) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const founder = panel.querySelector('.org-flow-founder');
  const founderLink = panel.querySelector('.org-flow-founder-link');
  const chief = panel.querySelector('.org-flow-chief');
  const spine = panel.querySelector('.org-flow-spine');
  const rail = panel.querySelector('.org-flow-rail');
  const pulses = [...panel.querySelectorAll('.org-flow-pulse')];
  const divisions = [...panel.querySelectorAll('.org-flow-division')];
  let timers = [];
  let cycleTimer = null;
  let running = false;

  const later = (fn, delay) => {
    const id = window.setTimeout(fn, delay);
    timers.push(id);
    return id;
  };

  const reset = () => {
    timers.forEach(clearTimeout);
    timers = [];
    founder?.classList.remove('is-active');
    chief?.classList.remove('is-active');
    founderLink?.classList.remove('is-running');
    spine?.classList.remove('is-running');
    rail?.classList.remove('is-running');
    pulses.forEach(p => p.classList.remove('is-running'));
    divisions.forEach(div => {
      div.classList.remove('is-active');
      div.querySelector('.org-flow-branch')?.classList.remove('is-running');
      div.querySelectorAll('.org-flow-agent').forEach(agent => agent.classList.remove('is-revealed','is-active'));
    });
  };

  const showStatic = () => {
    founder?.classList.add('is-active');
    chief?.classList.add('is-active');
    founderLink?.classList.add('is-running');
    spine?.classList.add('is-running');
    rail?.classList.add('is-running');
    divisions.forEach(div => {
      div.querySelector('.org-flow-branch')?.classList.add('is-running');
      div.querySelectorAll('.org-flow-agent').forEach(agent => agent.classList.add('is-revealed'));
    });
  };

  const runCycle = () => {
    if (!running || reduceMotion) return;
    reset();
    // Force animation restart after class removal.
    void panel.offsetWidth;
    founder?.classList.add('is-active');
    founderLink?.classList.add('is-running');

    later(() => chief?.classList.add('is-active'), 540);
    later(() => spine?.classList.add('is-running'), 850);
    later(() => {
      rail?.classList.add('is-running');
      pulses.forEach(p => p.classList.add('is-running'));
    }, 1180);

    divisions.forEach((div, index) => {
      const branch = div.querySelector('.org-flow-branch');
      const agents = [...div.querySelectorAll('.org-flow-agent')];
      const start = 1650 + index * 290;
      later(() => {
        branch?.classList.add('is-running');
        div.classList.add('is-active');
      }, start);
      agents.forEach((agent, agentIndex) => {
        later(() => agent.classList.add('is-revealed','is-active'), start + 180 + agentIndex * 220);
        later(() => agent.classList.remove('is-active'), start + 760 + agentIndex * 220);
      });
      later(() => div.classList.remove('is-active'), start + 1180);
    });

    later(() => {
      founder?.classList.remove('is-active');
      chief?.classList.remove('is-active');
    }, 5900);
  };

  if (reduceMotion) {
    showStatic();
    return;
  }

  const start = () => {
    if (running) return;
    running = true;
    runCycle();
    cycleTimer = window.setInterval(runCycle, 7900);
  };
  const stop = () => {
    running = false;
    if (cycleTimer) clearInterval(cycleTimer);
    cycleTimer = null;
    reset();
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? start() : stop());
    }, { threshold: .18 });
    observer.observe(panel);
  } else {
    start();
  }
})();

// Native equivalent of the supplied Framer Motion title roll interaction.
(() => {
  document.querySelectorAll('.use-case-roll[data-roll-text]').forEach(title => {
    const value = title.dataset.rollText || title.textContent || '';
    title.textContent = '';
    [...value].forEach(char => {
      const wrap = document.createElement('span');
      wrap.className = 'roll-char';
      const track = document.createElement('span');
      track.className = 'roll-track';
      const one = document.createElement('span');
      const two = document.createElement('span');
      const visibleChar = char === ' ' ? '\u00A0' : char;
      one.textContent = visibleChar;
      two.textContent = visibleChar;
      track.append(one,two);
      wrap.append(track);
      title.append(wrap);
    });
  });
})();
