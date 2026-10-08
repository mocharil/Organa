const crypto = require('node:crypto');
const {companyProposalSchema} = require('../ai/schemas');
const prompts = require('../prompts');
const {id, now, avatarFor} = require('./helpers');
const {templates} = require('../data/team-templates');

const isChief = role => /chief of staff/i.test(role || '');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = (message, status = 400) => {
  const error = Object.assign(new Error(message), {status});
  if (status === 502) error.publicMessage = message;
  throw error;
};
const copy = value => JSON.parse(JSON.stringify(value));
const generatedText = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const generatedList = value => Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 500)).filter(Boolean).slice(0, 12) : [];

function inputText(value, label, max, required = false) {
  if (value !== undefined && typeof value !== 'string') fail(`${label} must be text.`);
  const text = (value || '').trim();
  if (text.length > max) fail(`${label} must be ${max} characters or fewer.`);
  if (required && !text) fail(`${label} is required.`);
  return text;
}

function constraintLines(value) {
  if (value === undefined) return [];
  if (typeof value !== 'string' && !Array.isArray(value)) fail('Hard constraints must be text or a list of text.');
  const lines = typeof value === 'string' ? value.split('\n') : value;
  if (lines.some(line => typeof line !== 'string')) fail('Every hard constraint must be text.');
  const constraints = [...new Set(lines.map(line => line.trim()).filter(Boolean))];
  if (constraints.length > 12) fail('Use at most 12 hard constraints.');
  if (constraints.some(line => line.length > 500)) fail('Each hard constraint must be 500 characters or fewer.');
  return constraints;
}

function normalizeInput(input) {
  if (!object(input)) fail('Provide an organization setup object.');
  return {
    name: inputText(input.name, 'Company name', 120),
    description: inputText(input.description, 'Company context', 4000),
    goal: inputText(input.goal, 'Team outcome', 2000),
    prompt: inputText(input.prompt, 'Organization brief', 4000),
    stage: inputText(input.stage, 'Company stage', 120),
    audience: inputText(input.audience, 'Audience', 500),
    constraints: constraintLines(input.constraints),
    clientRequestId: inputText(input.clientRequestId, 'Request ID', 120),
  };
}

class BootstrapService {
  constructor({stateManager, provider, eventService, usageService, config}) {
    Object.assign(this, {stateManager, provider, eventService, usageService, config});
    this.pendingProposals = new Map();
    this.pendingActivations = new Map();
  }

  listTemplates() {
    return templates.map(template => ({
      id: template.id, name: template.name, category: template.category,
      version: template.version, description: template.description,
      teamSize: template.recommendedTeam.length,
    }));
  }

  // Retries after a lost response reuse the saved draft, including after restart.
  async createOnce(input, source, create) {
    const requestId = input.clientRequestId;
    if (!requestId) return create({});
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({input, source})).digest('hex');
    const pending = this.pendingProposals.get(requestId);
    if (pending) {
      if (pending.fingerprint !== fingerprint) fail('This request ID belongs to a different setup.', 409);
      return pending.promise;
    }
    const existing = (this.stateManager.get().bootstrapProposals || []).find(entity => entity.clientRequestId === requestId);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) fail('This request ID belongs to a different setup. Start a new draft.', 409);
      return existing;
    }
    const promise = create({clientRequestId: requestId, requestFingerprint: fingerprint});
    this.pendingProposals.set(requestId, {fingerprint, promise});
    try { return await promise; }
    finally { this.pendingProposals.delete(requestId); }
  }

  async persistDraft(entity) {
    try { await this.stateManager.persist(); }
    catch (error) {
      const state = this.stateManager.get();
      state.bootstrapProposals = state.bootstrapProposals.filter(item => item.id !== entity.id);
      state.events = state.events.filter(event => event.entity?.id !== entity.id);
      throw error;
    }
  }

  async fromTemplate(templateId, rawInput = {}) {
    const input = normalizeInput(rawInput);
    const template = templates.find(item => item.id === templateId);
    if (!template) fail('Team template not found.', 404);
    const source = {type: 'template', templateId, templateVersion: template.version};
    return this.createOnce(input, source, async requestMetadata => {
      const data = copy(template);
      for (const key of ['id', 'name', 'category', 'version', 'description']) delete data[key];
      data.companyProfile = {...data.companyProfile, name: input.name || 'New Organization', description: input.description || input.goal || template.description};
      data.initialTasks = [];
      data.approvalPolicyDraft = {externalAction: 'human_approval', spending: 'human_approval', policyChange: 'human_approval'};
      data.assumptions = [`Started from the ${template.name} template. Review every role and constraint before activation.`];
      data.questions = [];
      const proposal = this.validateProposal(data, input);
      const entity = {id: id('cbp'), status: 'draft', source, proposal, ...requestMetadata, createdAt: now(), updatedAt: now()};
      const state = this.stateManager.get();
      state.bootstrapProposals ||= [];
      state.bootstrapProposals.push(entity);
      this.eventService.append('company.template_proposed', {entity: {type: 'bootstrapProposal', id: entity.id}, payload: {templateId, templateVersion: template.version, companyName: proposal.companyProfile.name}});
      await this.persistDraft(entity);
      return entity;
    });
  }

  async propose(rawInput) {
    const input = normalizeInput(rawInput);
    if (!input.goal && !input.description && !input.prompt) fail('Describe the outcome you want your AI team to achieve.');
    const source = {type: 'architect'};
    return this.createOnce(input, source, async requestMetadata => {
      const prompt = prompts.companyArchitect({input, tools: [{id: 'company_context_read', description: 'Read approved company context and deliverables'}]});
      const response = await this.provider.generate({...prompt, responseSchema: companyProposalSchema, metadata: {action: 'company_architect'}, context: {companyInput: input}});
      this.usageService.record(response, {purpose: 'company_architect'});
      const proposal = this.validateProposal(response.data, input);
      const entity = {id: id('cbp'), status: 'draft', source, proposal, ...requestMetadata, createdAt: now(), updatedAt: now()};
      const state = this.stateManager.get();
      state.bootstrapProposals ||= [];
      state.bootstrapProposals.push(entity);
      this.eventService.append('company.bootstrap_proposed', {entity: {type: 'bootstrapProposal', id: entity.id}, payload: {companyName: proposal.companyProfile.name}});
      await this.persistDraft(entity);
      return entity;
    });
  }

  validateProposal(rawData, input = {}) {
    if (!object(rawData)) fail('Organa could not produce a structured organization draft. Please try again.', 502);
    const data = copy(rawData);
    let team = Array.isArray(data.recommendedTeam) ? data.recommendedTeam.filter(object) : [];
    if (!team.length) fail('The organization draft has no AI coworkers. Please try again.', 502);
    let chief = team.find(role => isChief(role.role));
    if (!chief) {
      chief = {tempId: 'role_cos', displayNameSuggestion: 'Ari', role: 'AI Chief of Staff', division: 'Leadership', purpose: 'Coordinate the team and turn owner goals into bounded work plans.', responsibilities: ['planning', 'coordination'], skills: ['planning', 'coordination'], requestedToolIds: ['company_context_read'], boundaries: ['Cannot act as CEO or approve high-impact actions'], recommendedAutonomy: 'draft_and_recommend', whyNeeded: 'A single coordination layer keeps specialist work aligned.'};
    }
    // Keep the coordinator when bounding the team, then repair references to removed roles.
    team = [chief, ...team.filter(role => role !== chief && !isChief(role.role))].slice(0, 7);
    const usedIds = new Set();
    const usedNames = new Set();
    team = team.map((role, index) => {
      let tempId = generatedText(role.tempId, 80);
      if (!/^[a-zA-Z0-9_-]+$/.test(tempId) || usedIds.has(tempId)) tempId = `role_${index}_${id('draft')}`;
      usedIds.add(tempId);
      let name = generatedText(role.displayNameSuggestion, 80) || `Coworker ${index + 1}`;
      const nameBase = name.slice(0, 74);
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) name = `${nameBase} ${suffix++}`;
      usedNames.add(name.toLowerCase());
      return {...role, tempId, displayNameSuggestion: name, role: generatedText(role.role, 120) || 'AI Specialist', division: generatedText(role.division, 80) || 'General', purpose: generatedText(role.purpose), responsibilities: generatedList(role.responsibilities), skills: generatedList(role.skills), requestedToolIds: generatedList(role.requestedToolIds), boundaries: generatedList(role.boundaries)};
    });
    const chiefId = team[0].tempId;
    const byId = new Map(team.map(role => [role.tempId, role]));
    team[0].reportsToTempId = null;
    for (const role of team.slice(1)) {
      if (!byId.has(role.reportsToTempId) || role.reportsToTempId === role.tempId) role.reportsToTempId = chiefId;
      const seen = new Set([role.tempId]);
      let cursor = byId.get(role.reportsToTempId);
      while (cursor) {
        if (seen.has(cursor.tempId)) { role.reportsToTempId = chiefId; break; }
        seen.add(cursor.tempId);
        cursor = byId.get(cursor.reportsToTempId);
      }
    }
    data.recommendedTeam = team;
    data.companyProfile = object(data.companyProfile) ? data.companyProfile : {};
    data.companyProfile.name = input.name || generatedText(data.companyProfile.name, 120) || 'New Organization';
    for (const key of ['description', 'industry', 'stage', 'audience']) data.companyProfile[key] = generatedText(data.companyProfile[key], key === 'description' ? 4000 : 500);
    const north = object(data.northStarDraft) ? data.northStarDraft : {};
    data.northStarDraft = {
      mission: generatedText(north.mission) || `Turn ${data.companyProfile.name}'s priorities into useful, reviewable outcomes.`,
      vision: generatedText(north.vision), principles: generatedList(north.principles),
      hardConstraints: [...new Set([...generatedList(north.hardConstraints), ...(input.constraints || [])])],
      softPreferences: generatedList(north.softPreferences),
    };
    // Caller-supplied constraints take priority when the combined draft exceeds the review limit.
    if (data.northStarDraft.hardConstraints.length > 12) data.northStarDraft.hardConstraints = [...new Set([...(input.constraints || []), ...generatedList(north.hardConstraints)])].slice(0, 12);
    data.initialGoals = Array.isArray(data.initialGoals) ? data.initialGoals.filter(object).slice(0, 3) : [];
    if (input.goal) {
      const first = data.initialGoals[0] || {};
      data.initialGoals = [{...first, title: input.goal.slice(0, 160), description: input.goal, successCriteria: generatedList(first.successCriteria).length ? generatedList(first.successCriteria) : ['A reviewable cross-functional outcome is produced'], suggestedKpis: Array.isArray(first.suggestedKpis) ? first.suggestedKpis.filter(object) : []}];
    }
    data.initialTasks = Array.isArray(data.initialTasks) ? data.initialTasks.filter(object).slice(0, 5) : [];
    data.assumptions = generatedList(data.assumptions);
    data.questions = generatedList(data.questions);
    return data;
  }

  get(proposalId) {
    return (this.stateManager.get().bootstrapProposals || []).find(entity => entity.id === proposalId) || null;
  }

  activationResult(entity) {
    const state = this.stateManager.get();
    const companyId = entity.activatedCompanyId;
    const company = state.companies.find(item => item.id === companyId);
    if (!company) fail('The activated organization is no longer available.', 409);
    return {
      company, northStar: state.northStars.find(item => item.companyId === companyId && item.version === 1),
      agents: state.agents.filter(item => item.companyId === companyId),
      goals: state.goals.filter(item => item.companyId === companyId),
    };
  }

  async activate(proposalId, overrides = {}) {
    const pending = this.pendingActivations.get(proposalId);
    if (pending) return pending;
    const promise = this.activateReviewed(proposalId, overrides);
    this.pendingActivations.set(proposalId, promise);
    try { return await promise; }
    finally { this.pendingActivations.delete(proposalId); }
  }

  async activateReviewed(proposalId, overrides) {
    const state = this.stateManager.get();
    const entity = this.get(proposalId);
    if (!entity) fail('Organization draft not found. Return to setup to create a new draft.', 404);
    // A successful activation with a lost response must not create another company on retry.
    if (entity.status === 'activated') {
      await this.stateManager.persist();
      return this.activationResult(entity);
    }
    if (!object(overrides)) fail('Provide the reviewed organization details.');
    const proposal = this.validateProposal(entity.proposal);
    if (overrides.companyName !== undefined) proposal.companyProfile.name = inputText(overrides.companyName, 'Company name', 120, true);
    if (overrides.mission !== undefined) proposal.northStarDraft.mission = inputText(overrides.mission, 'Mission', 1000, true);
    if (overrides.vision !== undefined) proposal.northStarDraft.vision = inputText(overrides.vision, 'Vision', 1000);
    if (overrides.hardConstraints !== undefined) proposal.northStarDraft.hardConstraints = constraintLines(overrides.hardConstraints);
    if (overrides.team !== undefined) {
      if (!Array.isArray(overrides.team)) fail('The reviewed team must be a list.');
      const byId = new Map();
      for (const edit of overrides.team) {
        if (!object(edit) || !proposal.recommendedTeam.some(role => role.tempId === edit.tempId)) fail('The reviewed team contains an unknown role.');
        if (byId.has(edit.tempId)) fail('The reviewed team contains a duplicate role.');
        if (edit.enabled !== undefined && typeof edit.enabled !== 'boolean') fail('Role selection must be true or false.');
        byId.set(edit.tempId, edit);
      }
      proposal.recommendedTeam = proposal.recommendedTeam.filter(role => byId.get(role.tempId)?.enabled !== false).map(role => {
        const edit = byId.get(role.tempId) || {};
        // Only review fields are editable here; permission and prompt overrides are ignored.
        return {...role,
          displayNameSuggestion: edit.displayNameSuggestion === undefined ? role.displayNameSuggestion : inputText(edit.displayNameSuggestion, 'Coworker name', 80, true),
          role: edit.role === undefined ? role.role : inputText(edit.role, 'Role title', 120, true),
        };
      });
    }
    if (!proposal.recommendedTeam.length) fail('Activate at least one AI coworker.');
    const chiefs = proposal.recommendedTeam.filter(role => isChief(role.role));
    if (chiefs.length !== 1) fail('Keep exactly one AI Chief of Staff to coordinate your team.');
    const names = proposal.recommendedTeam.map(role => role.displayNameSuggestion.toLowerCase());
    if (new Set(names).size !== names.length) fail('Give every AI coworker a unique name.');
    const chiefId = chiefs[0].tempId;
    const selectedIds = new Set(proposal.recommendedTeam.map(role => role.tempId));
    for (const role of proposal.recommendedTeam) {
      if (role.tempId === chiefId) role.reportsToTempId = null;
      else if (!selectedIds.has(role.reportsToTempId)) role.reportsToTempId = chiefId;
    }

    const companyId = id('cmp');
    const createdAt = now();
    const profile = proposal.companyProfile;
    const company = {id: companyId, name: profile.name, description: profile.description, industry: profile.industry, stage: profile.stage, audience: profile.audience, timezone: 'Asia/Jakarta', status: 'active', createdBy: 'local-user', createdAt, updatedAt: createdAt};
    const north = proposal.northStarDraft;
    const northStar = {
      id: id('ns'), companyId, version: 1, status: 'active', mission: north.mission, vision: north.vision, principles: north.principles,
      constraints: [...north.hardConstraints.map((text, index) => ({id: `hard_${index + 1}`, type: 'policy', text, severity: 'hard'})), ...north.softPreferences.map((text, index) => ({id: `soft_${index + 1}`, type: 'preference', text, severity: 'soft'}))],
      activeGoalIds: [], kpis: [], changedBy: 'local-user', changeNote: 'Activated from reviewed organization draft', createdAt,
    };
    const tempMap = new Map(proposal.recommendedTeam.map(role => [role.tempId, id('agt')]));
    const agents = proposal.recommendedTeam.map((role, index) => ({
      id: tempMap.get(role.tempId), companyId, displayName: role.displayNameSuggestion, role: role.role, division: role.division,
      managerAgentId: role.reportsToTempId ? tempMap.get(role.reportsToTempId) : null,
      purpose: role.purpose, responsibilities: role.responsibilities,
      skills: role.skills.map(name => ({name, level: 'advanced'})), toolPolicyIds: role.requestedToolIds.length ? role.requestedToolIds : ['company_context_read'],
      modelPolicy: {provider: 'inherit', defaultModel: null, reasoningTier: 'balanced', maxOutputTokens: 3000},
      systemPrompt: `You are the ${role.role} inside ${company.name}. ${role.purpose}\nRespect the Company North Star, separate facts from assumptions, and escalate missing critical information.`,
      personality: 'Professional, concise, evidence-aware and collaborative.', boundaries: role.boundaries,
      evaluationCriteria: ['factuality', 'goal alignment', 'constraint compliance', 'usefulness'],
      status: 'active', concurrencyLimit: 1, promptVersion: 1, avatar: avatarFor(role.displayNameSuggestion, role.division, index), createdAt, updatedAt: createdAt,
    }));
    const goals = proposal.initialGoals.map(goal => ({id: id('goal'), companyId, title: generatedText(goal.title, 160) || 'Initial goal', description: generatedText(goal.description, 2000), deadline: goal.deadline || null, successCriteria: generatedList(goal.successCriteria), status: 'active', createdAt, updatedAt: createdAt}));
    northStar.activeGoalIds = goals.map(goal => goal.id);
    northStar.kpis = proposal.initialGoals.flatMap(goal => Array.isArray(goal.suggestedKpis) ? goal.suggestedKpis.filter(object) : []).slice(0, 10).map((kpi, index) => ({id: id('kpi'), name: kpi.name || `KPI ${index + 1}`, target: kpi.target ?? null, unit: kpi.unit || '', deadline: kpi.deadline || null}));
    state.companies.push(company);
    state.northStars.push(northStar);
    state.agents.push(...agents);
    state.goals.push(...goals);
    const previousCompanyId = state.activeCompanyId;
    state.activeCompanyId = companyId;
    entity.status = 'activated';
    entity.activatedCompanyId = companyId;
    entity.reviewedProposal = proposal;
    entity.updatedAt = now();
    this.eventService.append('company.created', {actor: {type: 'user', id: 'local-user'}, entity: {type: 'company', id: companyId}, payload: {name: company.name}});
    this.eventService.append('company.activated', {actor: {type: 'user', id: 'local-user'}, entity: {type: 'company', id: companyId}});
    agents.forEach(agent => this.eventService.append('agent.hired', {actor: {type: 'user', id: 'local-user'}, entity: {type: 'agent', id: agent.id}, payload: {displayName: agent.displayName, role: agent.role}}));
    this.eventService.append('northstar.activated', {actor: {type: 'user', id: 'local-user'}, entity: {type: 'northStar', id: northStar.id}, goalIds: northStar.activeGoalIds, payload: {version: 1}});
    try { await this.stateManager.persist(); }
    catch (error) {
      // Remove only this activation's records; other organizations remain intact.
      for (const key of ['companies', 'northStars', 'agents', 'goals']) {
        state[key] = state[key].filter(item => item.id !== companyId && item.companyId !== companyId);
      }
      state.events = state.events.filter(event => event.companyId !== companyId);
      if (state.activeCompanyId === companyId) state.activeCompanyId = previousCompanyId;
      entity.status = 'draft';
      delete entity.activatedCompanyId;
      delete entity.reviewedProposal;
      throw error;
    }
    return {company, northStar, agents, goals};
  }
}

module.exports = {BootstrapService};
