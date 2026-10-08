(() => {
  'use strict';

  const STORAGE_KEY = 'organa:onboarding:v1';
  const isChief = role => /chief of staff/i.test(role || '');
  const initials = name => String(name || 'AI').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const element = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined && text !== null) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  const action = (text, className, handler) => {
    const button = element('button', text, className || 'mc-secondary');
    button.type = 'button';
    if (handler) button.addEventListener('click', handler);
    return button;
  };
  const uniqueLines = text => [...new Set(String(text || '').split('\n').map(line => line.trim()).filter(Boolean))];

  class OrganaOnboarding {
    constructor(options) {
      this.options = options;
      this.content = options.content;
      this.state = {
        path: null, templateId: null, draft: {name: '', context: '', goal: '', constraints: ''},
        proposal: null, review: null, showSetup: false, requestId: null, requestSignature: null, proposalSignature: null,
        busy: null, loading: false, error: '', errors: {}, templatesError: '', healthError: '',
        proposalVerified: false, completion: null,
      };
      this.storageAvailable = true;
      this.restore();
      if (options.goal && options.goal !== this.state.draft.goal) {
        this.state.path = 'scratch';
        this.state.draft.goal = options.goal.slice(0, 2000);
        this.state.showSetup = true;
      }
      this.updateResumeButton();
    }

    restore() {
      try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
        if (!saved || saved.version !== 1) return;
        this.state.path = ['scratch', 'template'].includes(saved.path) ? saved.path : null;
        this.state.templateId = typeof saved.templateId === 'string' ? saved.templateId : null;
        for (const key of Object.keys(this.state.draft)) {
          if (typeof saved.draft?.[key] === 'string') this.state.draft[key] = saved.draft[key];
        }
        if (typeof saved.proposal?.id === 'string' && Array.isArray(saved.proposal?.proposal?.recommendedTeam) && saved.proposal.proposal.recommendedTeam.length) this.state.proposal = saved.proposal;
        if (saved.review && ['companyName','mission','vision','hardConstraints'].every(key => typeof saved.review[key] === 'string') && Array.isArray(saved.review.team) && saved.review.team.every(role => typeof role?.tempId === 'string' && typeof role.displayNameSuggestion === 'string' && typeof role.role === 'string' && typeof role.enabled === 'boolean')) this.state.review = saved.review;
        this.state.showSetup = Boolean(saved.showSetup);
        this.state.requestId = typeof saved.requestId === 'string' ? saved.requestId : null;
        this.state.requestSignature = typeof saved.requestSignature === 'string' ? saved.requestSignature : null;
        this.state.proposalSignature = typeof saved.proposalSignature === 'string' ? saved.proposalSignature : null;
      } catch { /* An unavailable or obsolete cache must never prevent setup. */ }
    }

    save() {
      const {path, templateId, draft, proposal, review, showSetup, requestId, requestSignature, proposalSignature} = this.state;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({version: 1, path, templateId, draft, proposal, review, showSetup, requestId, requestSignature, proposalSignature}));
      } catch { this.storageAvailable = false; }
      this.updateResumeButton();
    }

    hasDraft() {
      return !this.state.completion && Boolean(this.state.path || this.state.proposal || Object.values(this.state.draft).some(value => value.trim()));
    }

    restartCompleted() {
      if (!this.state.completion) return;
      Object.assign(this.state, {path: null, templateId: null, draft: {name: '', context: '', goal: '', constraints: ''}, proposal: null, review: null, showSetup: false, requestId: null, requestSignature: null, proposalSignature: null, error: '', errors: {}, proposalVerified: false, completion: null});
      this.clear();
    }

    updateResumeButton() {
      const resume = document.getElementById('organaResumeOnboarding');
      if (resume) resume.hidden = !this.hasDraft() || Boolean(this.state.completion);
    }

    clear() {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      const resume = document.getElementById('organaResumeOnboarding');
      if (resume) resume.hidden = true;
    }

    async load() {
      if (this.state.loading) return;
      this.state.loading = true;
      const routes = ['/api/health', '/api/company-bootstrap/templates', '/api/llm/settings'];
      const results = await Promise.allSettled(routes.map(route => this.options.api('GET', route)));
      if (results[1].status === 'fulfilled' && (!Array.isArray(results[1].value) || results[1].value.some(template => typeof template?.id !== 'string' || typeof template.name !== 'string'))) {
        results[1] = {status: 'rejected', reason: new Error('Invalid template list')};
      }
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') this.options.workspaceState[['health', 'templates', 'llmSettings'][index]] = result.value;
      });
      this.state.healthError = results[0].status === 'rejected' ? 'We could not confirm the workspace connection.' : '';
      this.state.templatesError = results[1].status === 'rejected' ? 'Team templates could not be loaded. Retry, or build from your own goal.' : '';
      if (this.state.proposal && !this.state.proposalVerified && !this.state.busy) {
        try {
          const latest = await this.options.api('GET', `/api/company-bootstrap/proposals/${encodeURIComponent(this.state.proposal.id)}`);
          this.state.proposal = latest;
          this.state.proposalVerified = true;
          if (latest.status === 'activated') {
            this.state.completion = await this.options.api('POST', `/api/company-bootstrap/proposals/${encodeURIComponent(latest.id)}/activate`, {});
          }
        } catch (error) {
          this.state.error = error.status === 404
            ? 'This saved draft is no longer on the server. Return to setup to recreate it; your brief and review edits are still here.'
            : 'We could not reconnect to your saved draft. Retry the connection to continue. Your edits are still saved.';
        }
      }
      this.state.loading = false;
      this.save();
      this.render({preserveFocus: true});
    }

    makeField({key, label, value = '', kind = 'input', required = false, maxLength = 1000, placeholder = '', hint = '', onInput}) {
      const wrap = element('label', null, 'ob-field');
      const title = element('span', null, 'ob-field-title');
      title.append(element('span', label));
      if (!required) title.append(element('small', 'Optional', 'ob-optional'));
      const input = element(kind);
      input.id = `ob-${key}`;
      input.setAttribute('aria-label', label);
      input.value = value;
      input.maxLength = maxLength;
      input.required = required;
      input.placeholder = placeholder;
      if (kind === 'textarea') input.rows = 3;
      else input.type = 'text';
      const help = element('span', hint, 'ob-field-hint');
      help.id = `${input.id}-hint`;
      const error = element('span', this.state.errors[key] || '', 'ob-field-error');
      error.id = `${input.id}-error`;
      error.hidden = !this.state.errors[key];
      input.setAttribute('aria-describedby', `${help.id} ${error.id}`);
      input.setAttribute('aria-invalid', this.state.errors[key] ? 'true' : 'false');
      input.addEventListener('input', () => {
        input.setCustomValidity('');
        delete this.state.errors[key];
        error.hidden = true;
        input.setAttribute('aria-invalid', 'false');
        onInput?.(input.value);
        this.save();
      });
      wrap.append(title, input, help, error);
      return {wrap, input};
    }

    stepper() {
      const state = this.state;
      const current = state.completion ? 4 : state.busy === 'activate' ? 3 : state.proposal && !state.showSetup ? 2 : state.path ? 1 : 0;
      const list = element('ol', null, 'ob-steps mc-onboarding-steps');
      list.setAttribute('aria-label', 'Organization setup progress');
      ['Start', 'Configure', 'Review', 'Activate'].forEach((label, index) => {
        const step = element('li', null, `ob-step ${index < current ? 'done' : index === current ? 'active' : ''}`);
        if (index === current) step.setAttribute('aria-current', 'step');
        step.append(element('span', index < current ? '✓' : String(index + 1), 'ob-step-number'), element('strong', label));
        list.append(step);
      });
      return list;
    }

    render({preserveFocus = false} = {}) {
      if (!this.options.isOpen()) return;
      const active = preserveFocus ? document.activeElement : null;
      const focusId = active?.id;
      const selection = typeof active?.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
      const scrollTop = preserveFocus ? this.content.scrollTop : 0;
      this.content.replaceChildren();
      this.content.setAttribute('aria-busy', this.state.busy || this.state.loading ? 'true' : 'false');
      const shell = element('div', null, 'ob-shell mc-onboarding-shell');
      const top = element('div', null, 'ob-top');
      const saved = this.storageAvailable ? 'Draft saved in this tab' : 'Keep this tab open to preserve your draft';
      top.append(element('span', 'CREATE YOUR WORKSPACE', 'ob-eyebrow'), element('span', saved, 'ob-saved'));
      shell.append(top, this.stepper());
      const reviewing = this.state.proposal && !this.state.showSetup;
      const heading = this.state.completion ? 'Your organization is ready.' : reviewing ? 'Make this team yours.' : this.state.path === 'scratch' ? 'What does success look like?' : this.state.path === 'template' ? 'A head start for your next big idea.' : 'Your goal. A coordinated team.';
      const intro = this.state.completion ? 'Your North Star and AI coworkers are active. Give them a mission, then follow their work in your live office.' : reviewing ? 'Review your North Star, choose your coworkers, and approve the team when you are ready.' : this.state.path === 'scratch' ? 'Give Organa one clear outcome. You will review the team and its direction before anything starts.' : this.state.path === 'template' ? 'Choose a focused team, then tailor its outcome and guardrails to your business.' : 'Bring specialist AI coworkers together around one outcome. You set the direction and stay in control.';
      const hero = element('header', null, 'ob-heading');
      const h2 = element('h2', heading);
      h2.id = 'ob-heading';
      h2.tabIndex = -1;
      hero.append(h2, element('p', intro));
      shell.append(hero);
      if (this.state.error) shell.append(this.errorPanel());
      if (this.state.busy) shell.append(this.busyPanel());
      else if (this.state.completion) this.renderSuccess(shell);
      else if (!this.state.path) this.renderChoices(shell);
      else if (reviewing) this.renderReview(shell);
      else this.renderSetup(shell);
      this.content.append(shell);
      this.content.scrollTop = scrollTop;
      if (focusId) {
        const target = document.getElementById(focusId);
        target?.focus({preventScroll: true});
        if (selection && target?.setSelectionRange) target.setSelectionRange(...selection);
      }
    }

    focusHeading() {
      this.content.scrollTop = 0;
      document.getElementById('ob-heading')?.focus({preventScroll: true});
    }

    errorPanel() {
      const panel = element('div', null, 'ob-error mc-onboarding-error');
      panel.setAttribute('role', 'alert');
      panel.append(element('strong', 'Let’s get you back on track.'), element('p', this.state.error));
      if (!this.state.proposalVerified && this.state.proposal) {
        const retry = action('Retry connection', 'mc-secondary', async () => {
          this.state.error = '';
          await this.load();
        });
        retry.disabled = this.state.loading;
        panel.append(retry);
      }
      if (['AI_PROVIDER_NOT_READY', 'AI_PROVIDER_UNAVAILABLE'].includes(this.state.errorCode)) {
        panel.append(action('Open AI settings', 'mc-secondary', () => {
          this.save();
          this.options.onSettings();
        }));
      }
      return panel;
    }

    busyPanel() {
      const panel = element('section', null, 'ob-busy mc-onboarding-busy');
      const orbit = element('div', null, 'mc-mini-orbit');
      orbit.setAttribute('aria-hidden', 'true');
      orbit.append(element('span'), element('span'), element('span'));
      const copy = element('div');
      copy.append(element('h3', this.state.busy === 'activate' ? 'Bringing your organization online…' : 'Putting the right team around your goal…'), element('p', 'Your brief and edits stay in place. If the connection drops, you can retry safely from this step.'));
      const stages = element('div', null, 'ob-busy-stages');
      (this.state.busy === 'activate' ? ['Save North Star', 'Activate coworkers', 'Prepare workspace'] : ['Define direction', 'Match specialists', 'Prepare your review']).forEach(label => stages.append(element('span', label)));
      copy.append(stages);
      panel.append(orbit, copy);
      return panel;
    }

    teamPreview() {
      const preview = element('div', null, 'ob-orbit');
      preview.setAttribute('role', 'img');
      preview.setAttribute('aria-label', 'Your North Star connects specialist AI coworkers under human direction');
      const center = element('div', null, 'ob-orbit-center');
      const logo = element('img');
      logo.src = 'organa-logo-icon.png';
      logo.alt = '';
      center.append(logo, element('strong', 'Your North Star'), element('span', 'One shared direction'));
      preview.append(element('div', null, 'ob-orbit-ring'), center);
      [['chief-of-staff', 'Coordination'], ['marketing', 'Growth'], ['engineering', 'Execution']].forEach(([icon, text], index) => {
        const node = element('span', null, `ob-orbit-node ob-node-${index}`);
        const image = element('img');
        image.src = `assets/icons/organa-departments/${icon}.svg`;
        image.alt = '';
        node.append(image, element('small', text));
        preview.append(node);
      });
      return preview;
    }

    rail() {
      const rail = element('aside', null, 'ob-rail');
      rail.append(this.teamPreview(), element('h3', 'A team with a shared purpose.'), element('p', 'The Chief of Staff connects your goal to specialist work. The 3D office makes progress, collaboration, and work waiting for review easy to see.'));
      const list = element('ul', null, 'ob-benefits');
      ['One North Star for every coworker', 'Editable team, names, and guardrails', 'Human approval for consequential work'].forEach(text => list.append(element('li', text)));
      rail.append(list);
      return rail;
    }

    renderChoices(shell) {
      const layout = element('div', null, 'ob-layout');
      const choices = element('div', null, 'ob-choices mc-onboarding-path-grid');
      const paths = [
        ['scratch', 'Build from scratch', 'Start with a goal. Organa proposes the right specialists and a North Star for your review.', 'For a unique business or project', 'Build around my goal', 'product'],
        ['template', 'Use a template', 'Choose a focused starter team, then customize its people, direction, and constraints.', 'For a quicker start', 'Explore starter teams', 'chief-of-staff'],
      ];
      paths.forEach(([path, title, description, tag, cta, icon]) => {
        const button = action('', `ob-choice mc-onboarding-path-option mc-path-${path}`, () => {
          this.state.path = path;
          this.state.showSetup = true;
          this.state.error = '';
          this.save();
          this.render();
          this.focusHeading();
        });
        const image = element('img', null, 'ob-choice-icon');
        image.src = `assets/icons/organa-departments/${icon}.svg`;
        image.alt = '';
        button.append(image, element('small', tag, 'ob-choice-tag'), element('strong', title), element('span', description, 'ob-choice-description'), element('span', `${cta} →`, 'ob-choice-cta'));
        choices.append(button);
      });
      const main = element('div', null, 'ob-main');
      main.append(choices, element('p', 'Both paths start with an editable draft. Your existing workspace stays available.', 'ob-path-note'));
      layout.append(main, this.rail());
      shell.append(layout);
    }

    runtimeNotice() {
      const runtime = this.options.workspaceState.llmSettings?.runtime || this.options.workspaceState.health?.ai;
      if (!runtime || runtime.usingLiveAi) return null;
      const notice = element('aside', null, 'ob-runtime');
      const copy = element('div');
      copy.append(element('strong', 'You’re exploring in demo mode'), element('span', 'You can complete setup with a sample team. Connect live AI when you’re ready for generated recommendations.'));
      notice.append(element('span', 'DEMO', 'ob-runtime-tag'), copy, action('AI settings', 'mc-ghost', () => {
        this.save();
        this.options.onSettings();
      }));
      return notice;
    }

    renderSetup(shell) {
      const pathBar = element('div', null, 'ob-path-bar');
      pathBar.append(element('span', this.state.path === 'template' ? 'Starting with a team template' : 'Starting from your goal', 'ob-path-label'), action('Change starting point', 'mc-ghost', () => {
        this.state.path = null;
        this.state.error = '';
        this.save();
        this.render();
        this.focusHeading();
      }));
      shell.append(pathBar);
      const layout = element('div', null, 'ob-layout');
      const main = element('div', null, 'ob-main');
      if (this.state.path === 'template') main.append(this.templatePicker());
      else {
        const notice = this.runtimeNotice();
        if (notice) main.append(notice);
      }
      if (this.state.healthError) {
        const notice = element('div', null, 'ob-connection');
        notice.append(element('p', this.state.healthError), action('Retry connection', 'mc-secondary', () => this.load()));
        main.append(notice);
      }
      const form = element('form', null, 'ob-card ob-setup-form');
      form.append(element('h3', this.state.path === 'template' ? 'Make it fit your business.' : 'Start with one clear outcome.'));
      const fields = element('div', null, 'ob-fields');
      const specs = [
        {key: 'name', label: 'Company or project name', maxLength: 120, placeholder: 'e.g. Nusa Coffee', hint: 'Leave blank and use the name in your draft.'},
        ...(this.state.path === 'scratch' ? [{key: 'context', label: 'What are you building?', kind: 'textarea', maxLength: 2000, placeholder: 'A sustainable Indonesian coffee brand preparing its first launch.', hint: 'A little context helps the team fit your business.'}] : []),
        {key: 'goal', label: 'What should this team achieve?', kind: 'textarea', required: this.state.path === 'scratch', maxLength: 2000, placeholder: 'Prepare a launch plan for next month, with positioning, channels, a budget, and clear next actions.', hint: this.state.path === 'template' ? 'Leave blank to use the template’s first outcome.' : 'Include the deliverable, timing, and what a good result looks like.'},
        {key: 'constraints', label: 'Hard constraints', kind: 'textarea', maxLength: 6000, placeholder: 'Marketing spend cannot exceed IDR 25 million\nExternal publishing requires my approval', hint: 'One per line. Up to 12 constraints, 500 characters each.'},
      ];
      specs.forEach(spec => {
        const field = this.makeField({...spec, key: `setup-${spec.key}`, value: this.state.draft[spec.key], onInput: value => {
          this.state.draft[spec.key] = value;
          this.syncSetupSubmit();
        }});
        field.wrap.dataset.field = spec.key;
        fields.append(field.wrap);
      });
      form.append(fields);
      if (this.state.path === 'scratch') {
        const examples = element('div', null, 'ob-examples');
        examples.append(element('span', 'Try an outcome:'));
        [['Launch a product', 'Prepare an execution-ready launch plan for a new product in Indonesia next month.'], ['Research a market', 'Assess the Indonesian SME market and produce an evidence-backed opportunity brief.'], ['Plan growth', 'Create a 90-day growth plan with channel priorities, measurable targets, and budget guardrails.']].forEach(([label, goal]) => {
          examples.append(action(label, 'mc-example-chip', () => {
            this.state.draft.goal = goal;
            const input = document.getElementById('ob-setup-goal');
            input.value = goal;
            input.dispatchEvent(new Event('input', {bubbles: true}));
            input.focus({preventScroll: true});
          }));
        });
        form.append(examples);
      }
      const footer = element('div', null, 'ob-form-footer');
      const submit = action(this.state.path === 'template' ? 'Create editable draft' : 'Design my AI team', 'mc-primary');
      submit.type = 'submit';
      submit.id = 'ob-create-draft';
      footer.append(element('span', 'You review and approve before activation.', 'ob-footer-note'), submit);
      form.append(footer);
      if (this.state.proposal) form.append(action('Return to my reviewed draft', 'mc-ghost ob-return-review', () => {
        this.state.showSetup = false;
        this.state.error = '';
        this.save();
        this.render();
        this.focusHeading();
      }));
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (form.reportValidity()) this.createDraft();
      });
      main.append(form);
      layout.append(main, this.rail());
      shell.append(layout);
      // The form is not in the document yet when renderSetup runs.
      submit.disabled = this.state.path === 'template' ? !this.validTemplate() : !this.state.draft.goal.trim();
    }

    validTemplate() {
      return (this.options.workspaceState.templates || []).some(template => template.id === this.state.templateId);
    }

    syncSetupSubmit() {
      const submit = document.getElementById('ob-create-draft');
      if (submit) submit.disabled = this.state.path === 'template' ? !this.validTemplate() : !this.state.draft.goal.trim();
    }

    templatePicker() {
      const section = element('section', null, 'ob-card ob-template-picker');
      section.append(element('h3', 'Choose your starting team.'), element('p', 'Every team includes a Chief of Staff to keep specialist work aligned.', 'ob-card-copy'));
      if (this.state.templatesError || !(this.options.workspaceState.templates || []).length) {
        const empty = element('div', null, 'ob-template-empty');
        empty.append(element('p', this.state.templatesError || (this.state.loading ? 'Loading starter teams…' : 'No starter teams are available right now.')));
        const retry = action('Retry templates', 'mc-secondary', () => this.load());
        retry.disabled = this.state.loading;
        empty.append(retry);
        section.append(empty);
        return section;
      }
      const grid = element('div', null, 'ob-template-grid');
      grid.setAttribute('role', 'radiogroup');
      grid.setAttribute('aria-label', 'Starter team template');
      const icons = {startup: 'product', marketing: 'marketing', support: 'operations', research: 'chief-of-staff', commerce: 'sales'};
      this.options.workspaceState.templates.forEach((template, index) => {
        const label = element('label', null, 'ob-template');
        label.classList.toggle('selected', template.id === this.state.templateId);
        const radio = element('input');
        radio.type = 'radio';
        radio.name = 'ob-template';
        radio.value = template.id;
        radio.checked = template.id === this.state.templateId;
        radio.setAttribute('aria-label', template.name);
        const icon = element('img', null, 'ob-template-icon');
        icon.src = `assets/icons/organa-departments/${icons[template.category] || 'product'}.svg`;
        icon.alt = '';
        const copy = element('span', null, 'ob-template-copy');
        copy.append(element('strong', template.name), element('span', template.description), element('small', `${template.teamSize} AI coworkers`));
        label.append(radio, icon, copy);
        radio.addEventListener('change', () => {
          this.state.templateId = template.id;
          this.state.error = '';
          grid.querySelectorAll('.ob-template').forEach(item => item.classList.toggle('selected', item.querySelector('input').checked));
          this.save();
          this.syncSetupSubmit();
        });
        grid.append(label);
      });
      section.append(grid);
      return section;
    }

    checkConstraints(text, key) {
      const lines = uniqueLines(text);
      if (lines.length > 12) this.state.errors[key] = 'Use at most 12 hard constraints.';
      else if (lines.some(line => line.length > 500)) this.state.errors[key] = 'Keep each constraint to 500 characters or fewer.';
    }

    async createDraft() {
      if (this.state.busy) return;
      if (this.state.path === 'template' && !this.validTemplate()) return;
      if (this.state.path === 'scratch' && !this.state.draft.goal.trim()) return;
      this.state.errors = {};
      this.checkConstraints(this.state.draft.constraints, 'setup-constraints');
      if (Object.keys(this.state.errors).length) { this.render(); this.focusInvalid(); return; }
      const draft = Object.fromEntries(Object.entries(this.state.draft).map(([key, value]) => [key, value.trim()]));
      const signature = JSON.stringify({path: this.state.path, templateId: this.state.path === 'template' ? this.state.templateId : null, draft});
      if (this.state.proposal && this.state.proposalVerified && this.state.proposalSignature === signature) {
        this.state.showSetup = false;
        this.save();
        this.render();
        this.focusHeading();
        return;
      }
      if (this.state.requestSignature !== signature || !this.state.requestId) {
        this.state.requestId = globalThis.crypto?.randomUUID?.() || `setup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this.state.requestSignature = signature;
      }
      this.state.error = '';
      this.state.busy = 'design';
      this.save();
      this.render();
      this.focusHeading();
      this.options.onDesign?.();
      this.options.setStatus('Preparing your organization draft…');
      const route = this.state.path === 'template' ? `/api/company-bootstrap/templates/${encodeURIComponent(this.state.templateId)}/proposal` : '/api/company-bootstrap/proposals';
      try {
        const result = await this.options.api('POST', route, {name: draft.name, description: draft.context, goal: draft.goal, constraints: draft.constraints, clientRequestId: this.state.requestId}, {timeoutMs: 70000});
        if (!result?.id || !result?.proposal?.recommendedTeam?.length) throw new Error('The draft response was incomplete. Please try again.');
        this.state.proposal = result;
        this.state.proposalSignature = signature;
        this.state.proposalVerified = true;
        this.state.review = null;
        this.state.showSetup = false;
        this.state.completion = null;
        this.options.setStatus('Draft ready. Review the North Star and team before activation.');
      } catch (error) {
        this.state.error = error.message || 'The draft could not be created. Please try again.';
        this.state.errorCode = error.code || '';
        this.options.setStatus(this.state.error);
      } finally {
        this.state.busy = null;
        this.save();
        this.render();
        this.focusHeading();
      }
    }

    initializeReview() {
      if (this.state.review) return;
      const proposal = this.state.proposal.proposal;
      this.state.review = {
        companyName: proposal.companyProfile?.name || '', mission: proposal.northStarDraft?.mission || '',
        vision: proposal.northStarDraft?.vision || '', hardConstraints: (proposal.northStarDraft?.hardConstraints || []).join('\n'),
        team: proposal.recommendedTeam.map(role => ({tempId: role.tempId, enabled: true, displayNameSuggestion: role.displayNameSuggestion || '', role: role.role || ''})),
      };
      this.save();
    }

    renderReview(shell) {
      this.initializeReview();
      const proposal = this.state.proposal.proposal;
      const review = this.state.review;
      const form = element('form', null, 'ob-review-form');
      const layout = element('div', null, 'ob-layout');
      const main = element('div', null, 'ob-main');
      const north = element('section', null, 'ob-card');
      const source = this.state.proposal.source?.type === 'template' ? this.options.workspaceState.templates?.find(item => item.id === this.state.proposal.source.templateId)?.name || 'Starter team template' : 'Built around your goal';
      north.append(element('span', source, 'ob-section-label'), element('h3', 'Your company North Star'));
      const fields = element('div', null, 'ob-fields ob-review-fields');
      [
        {key: 'companyName', label: 'Company name', required: true, maxLength: 120},
        {key: 'mission', label: 'Mission', required: true, kind: 'textarea', hint: 'What the team exists to do.'},
        {key: 'vision', label: 'Vision', kind: 'textarea', hint: 'The future you want to create.'},
        {key: 'hardConstraints', label: 'Hard constraints, one per line', kind: 'textarea', maxLength: 6000, hint: 'Every coworker will work within these guardrails.'},
      ].forEach(spec => {
        const field = this.makeField({...spec, key: `review-${spec.key}`, value: review[spec.key], onInput: value => { review[spec.key] = value; }});
        field.wrap.dataset.field = spec.key;
        fields.append(field.wrap);
      });
      north.append(fields);
      const firstGoal = proposal.initialGoals?.[0];
      if (firstGoal) {
        const outcome = element('div', null, 'ob-first-goal');
        outcome.append(element('strong', 'First team outcome'), element('p', firstGoal.description || firstGoal.title), element('small', 'Change this outcome in setup before activating.'));
        north.append(outcome);
      }
      main.append(north);
      const team = element('section', null, 'ob-card ob-team-card');
      const teamHead = element('div', null, 'ob-team-heading');
      const count = element('span', `${review.team.filter(role => role.enabled).length} selected`, 'ob-team-count');
      teamHead.append(element('h3', 'Meet your AI coworkers'), count);
      team.append(teamHead, element('p', 'Keep the specialists you need. Your Chief of Staff coordinates the team.', 'ob-card-copy'));
      const rows = element('div', null, 'ob-team mc-onboarding-team');
      proposal.recommendedTeam.forEach((role, index) => {
        const edit = review.team.find(item => item.tempId === role.tempId);
        if (!edit) return;
        const chief = isChief(role.role);
        const row = element('div', null, 'ob-team-row mc-onboarding-team-row');
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', `${role.displayNameSuggestion || 'AI coworker'} · ${role.role}`);
        row.classList.toggle('excluded', !edit.enabled);
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = edit.enabled;
        checkbox.disabled = chief;
        checkbox.dataset.tempId = role.tempId;
        checkbox.setAttribute('aria-label', `Include ${role.role}`);
        if (chief) checkbox.title = 'The Chief of Staff is required to coordinate your team.';
        const identity = element('div', null, 'ob-identity');
        const name = element('strong', edit.displayNameSuggestion || 'AI coworker');
        const meta = element('div');
        meta.append(name, element('span', role.division || 'General'), element('small', chief ? 'Required · team coordinator' : role.purpose || role.whyNeeded || 'Specialist coworker'));
        identity.append(element('span', initials(edit.displayNameSuggestion), `mc-avatar ob-avatar ob-avatar-${index % 4}`), meta);
        const edits = element('div', null, 'ob-team-fields');
        const nameField = this.makeField({key: `team-name-${index}`, label: 'Coworker name', value: edit.displayNameSuggestion, maxLength: 80, required: true, onInput: value => { edit.displayNameSuggestion = value; name.textContent = value || 'AI coworker'; }});
        nameField.input.dataset.nameFor = role.tempId;
        const roleField = this.makeField({key: `team-role-${index}`, label: 'Role title', value: edit.role, maxLength: 120, required: true, onInput: value => { edit.role = value; }});
        roleField.input.dataset.roleFor = role.tempId;
        roleField.input.readOnly = chief;
        if (chief) roleField.input.title = 'The coordinator role is required. You can rename this coworker.';
        nameField.input.disabled = !edit.enabled;
        roleField.input.disabled = !edit.enabled;
        checkbox.addEventListener('change', () => {
          edit.enabled = checkbox.checked;
          row.classList.toggle('excluded', !edit.enabled);
          nameField.input.disabled = !edit.enabled;
          roleField.input.disabled = !edit.enabled;
          count.textContent = `${review.team.filter(item => item.enabled).length} selected`;
          const summaryCount = document.getElementById('ob-summary-count');
          if (summaryCount) summaryCount.textContent = String(review.team.filter(item => item.enabled).length);
          this.save();
        });
        edits.append(nameField.wrap, roleField.wrap);
        row.append(checkbox, identity, edits);
        rows.append(row);
      });
      team.append(rows);
      main.append(team);
      if (proposal.assumptions?.length || proposal.questions?.length) {
        const details = element('details', null, 'ob-card ob-assumptions');
        details.append(element('summary', 'Assumptions and open questions'));
        const list = element('ul');
        [...(proposal.assumptions || []), ...(proposal.questions || [])].forEach(text => list.append(element('li', text)));
        details.append(list);
        main.append(details);
      }
      const rail = element('aside', null, 'ob-rail ob-review-rail');
      rail.append(this.teamPreview());
      const summary = element('div', null, 'ob-review-summary');
      const countNumber = element('strong', String(review.team.filter(item => item.enabled).length));
      countNumber.id = 'ob-summary-count';
      summary.append(countNumber, element('span', 'AI coworkers, one direction'), element('p', 'Activation saves your North Star and brings this reviewed team online. Start work by giving it a mission.'));
      rail.append(summary, element('p', 'You retain approval over consequential actions.', 'ob-trust-note'));
      layout.append(main, rail);
      form.append(layout);
      const footer = element('div', null, 'ob-actions mc-onboarding-final-actions');
      const back = action('Back to setup', 'mc-secondary', () => {
        this.state.showSetup = true;
        this.state.error = '';
        this.state.errors = {};
        this.save();
        this.render();
        this.focusHeading();
      });
      const activate = action('Approve & start organization', 'mc-primary');
      activate.type = 'submit';
      activate.disabled = !this.state.proposalVerified || this.state.loading;
      footer.append(element('span', 'Your team. Your approval.', 'ob-footer-note'), back, activate);
      form.append(footer);
      form.addEventListener('submit', event => {
        event.preventDefault();
        this.activate(form);
      });
      shell.append(form);
    }

    focusInvalid() {
      const key = Object.keys(this.state.errors)[0];
      const input = document.getElementById(`ob-${key}`);
      input?.focus();
    }

    validateReview() {
      const review = this.state.review;
      this.state.errors = {};
      if (!review.companyName.trim()) this.state.errors['review-companyName'] = 'Enter a company name.';
      if (!review.mission.trim()) this.state.errors['review-mission'] = 'Give your team a mission.';
      this.checkConstraints(review.hardConstraints, 'review-hardConstraints');
      const names = new Set();
      review.team.forEach((role, index) => {
        if (!role.enabled) return;
        const name = role.displayNameSuggestion.trim().toLowerCase();
        if (!name) this.state.errors[`team-name-${index}`] = 'Enter a coworker name.';
        else if (names.has(name)) this.state.errors[`team-name-${index}`] = 'Give this coworker a unique name.';
        names.add(name);
        if (!role.role.trim()) this.state.errors[`team-role-${index}`] = 'Enter a role title.';
      });
      if (review.team.filter(role => role.enabled && isChief(role.role)).length !== 1) this.state.error = 'Keep exactly one Chief of Staff to coordinate the team.';
      else this.state.error = '';
      return !Object.keys(this.state.errors).length && !this.state.error;
    }

    async activate(form) {
      if (this.state.busy || !this.state.proposalVerified) return;
      if (!this.validateReview()) { this.render(); this.focusInvalid(); return; }
      if (!form.reportValidity()) return;
      const review = this.state.review;
      this.state.busy = 'activate';
      this.state.error = '';
      this.save();
      this.render();
      this.focusHeading();
      this.options.setStatus('Activating your reviewed organization…');
      try {
        const result = await this.options.api('POST', `/api/company-bootstrap/proposals/${encodeURIComponent(this.state.proposal.id)}/activate`, {
          companyName: review.companyName.trim(), mission: review.mission.trim(), vision: review.vision.trim(),
          hardConstraints: uniqueLines(review.hardConstraints),
          team: review.team.map(role => ({...role, displayNameSuggestion: role.displayNameSuggestion.trim(), role: role.role.trim()})),
        }, {timeoutMs: 70000});
        if (!result?.company?.id || !Array.isArray(result.agents)) throw new Error('We could not confirm activation. Retry to safely check the same organization.');
        this.state.completion = result;
        this.state.proposal.status = 'activated';
        this.options.setStatus(`${result.company.name} is ready. Enter your office to start working with the team.`);
      } catch (error) {
        this.state.error = error.message || 'Activation could not be confirmed. Please try again.';
        this.state.errorCode = error.code || '';
        if (error.status === 404) {
          this.state.proposalVerified = false;
          this.state.error = 'This draft is no longer on the server. Return to setup to recreate your team from your saved brief.';
        }
        this.options.setStatus(this.state.error);
      } finally {
        this.state.busy = null;
        this.save();
        this.render();
        this.focusHeading();
      }
    }

    renderSuccess(shell) {
      const {company, northStar, agents, goals} = this.state.completion;
      const card = element('section', null, 'ob-success ob-card');
      const icon = element('div', '✓', 'ob-success-icon');
      icon.setAttribute('aria-hidden', 'true');
      card.append(icon, element('span', 'WORKSPACE ACTIVATED', 'ob-eyebrow'), element('h3', company.name), element('p', northStar?.mission || '', 'ob-success-mission'));
      const stats = element('div', null, 'ob-success-stats');
      [[agents.length, 'AI coworkers'], ['1', 'shared North Star'], ['You', 'final authority']].forEach(([number, label]) => {
        const stat = element('div');
        stat.append(element('strong', String(number)), element('span', label));
        stats.append(stat);
      });
      const team = element('div', null, 'ob-success-team');
      agents.forEach(agent => team.append(element('span', `${agent.displayName} · ${agent.role}`)));
      card.append(stats, team);
      if (goals?.[0]) card.append(element('p', `First outcome: ${goals[0].description || goals[0].title}`, 'ob-success-goal'));
      const actions = element('div', null, 'ob-success-actions');
      actions.append(action('Enter my office →', 'mc-primary', () => {
        this.clear();
        this.options.clearRoute();
        location.assign('/app');
      }), action('Create my first mission', 'mc-secondary', () => {
        this.clear();
        this.options.onExit('mission');
      }));
      card.insertBefore(actions, team);
      card.append(element('small', 'The office reflects real task progress. Work starts when you create a mission.', 'ob-footer-note'));
      shell.append(card);
    }
  }

  window.OrganaOnboarding = OrganaOnboarding;
})();
