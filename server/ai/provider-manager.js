const {LlmProvider} = require('./llm-provider');

const LABELS = {
  'vertex': 'Gemini on Vertex AI',
  'gemini': 'Gemini Developer API',
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'dry-run': 'Deterministic dry-run',
};

function likelyModelFor(providerId, model) {
  if (!model) return false;
  const value = String(model).toLowerCase();
  if (providerId === 'vertex' || providerId === 'gemini') return value.startsWith('gemini');
  if (providerId === 'openai') return /^(gpt|o\d|chatgpt)/.test(value);
  if (providerId === 'anthropic') return value.startsWith('claude');
  return providerId === 'dry-run';
}

class ProviderManager extends LlmProvider {
  constructor({providers, config, stateManager}) {
    super({name: 'dry-run', model: null});
    this.providers = providers;
    this.config = config;
    this.stateManager = stateManager;
    this.refresh();
  }

  get stateSettings() {
    const state = this.stateManager.get();
    state.settings ||= {};
    state.settings.llm ||= {};
    return state.settings.llm;
  }

  defaultProviderId() {
    if (this.config.dryRun) return 'dry-run';
    const requested = String(this.config.llmProvider || 'auto').toLowerCase();
    if (requested !== 'auto' && this.providers.has(requested)) return requested;
    for (const id of ['vertex', 'gemini', 'openai', 'anthropic']) if (this.providers.has(id)) return id;
    return 'dry-run';
  }

  defaultModel(providerId, planner = false) {
    const map = {
      vertex: planner ? this.config.vertexPlannerModel : this.config.vertexModel,
      gemini: planner ? this.config.geminiPlannerModel : this.config.geminiModel,
      openai: planner ? this.config.openaiPlannerModel : this.config.openaiModel,
      anthropic: planner ? this.config.anthropicPlannerModel : this.config.anthropicModel,
      'dry-run': null,
    };
    return map[providerId] || null;
  }

  refresh() {
    const saved = this.stateSettings;
    let providerId = saved.provider || this.defaultProviderId();
    if (this.config.dryRun) providerId = 'dry-run';
    if (!this.providers.has(providerId)) providerId = this.defaultProviderId();
    this.activeProviderId = providerId;
    this.name = providerId;
    this.model = saved.model || this.config.llmModel || this.defaultModel(providerId, false);
    this.plannerModel = saved.plannerModel || this.config.llmPlannerModel || this.defaultModel(providerId, true) || this.model;
  }

  list() {
    return ['vertex', 'gemini', 'openai', 'anthropic', 'dry-run'].map(id => ({
      id,
      label: LABELS[id],
      configured: this.providers.has(id),
      authMode: id === 'vertex' ? this.vertexAuthMode() : id === 'gemini' ? 'api-key' : id === 'openai' ? 'api-key' : id === 'anthropic' ? 'api-key' : 'none',
      defaultModel: this.defaultModel(id, false),
      plannerModel: this.defaultModel(id, true),
    }));
  }

  vertexAuthMode() {
    if (this.config.googleServiceAccountCredentials) return `service-account:${this.config.googleServiceAccountSource}`;
    if (this.config.googleServiceAccountKeyFile) return 'service-account:key-file';
    return 'application-default-credentials';
  }

  settings() {
    return {
      provider: this.activeProviderId,
      model: this.model,
      plannerModel: this.plannerModel,
      forcedDryRun: Boolean(this.config.dryRun),
      providers: this.list(),
    };
  }

  async configure({provider, model, plannerModel} = {}) {
    const id = String(provider || this.activeProviderId).toLowerCase();
    if (this.config.dryRun && id !== 'dry-run') throw Object.assign(new Error('ORGANA_DRY_RUN is enabled. Disable it before selecting a live provider.'), {status: 409});
    if (!this.providers.has(id)) throw Object.assign(new Error(`Provider "${id}" is not configured on the server.`), {status: 400});
    const settings = this.stateSettings;
    settings.provider = id;
    settings.model = String(model || '').trim() || this.defaultModel(id, false);
    settings.plannerModel = String(plannerModel || '').trim() || this.defaultModel(id, true) || settings.model;
    settings.updatedAt = new Date().toISOString();
    await this.stateManager.persist();
    this.refresh();
    return this.settings();
  }

  resolve(providerId, requestedModel, planner = false) {
    let id = providerId && providerId !== 'inherit' ? String(providerId).toLowerCase() : this.activeProviderId;
    if (!this.providers.has(id)) id = this.activeProviderId;
    const provider = this.providers.get(id) || this.providers.get('dry-run');
    const fallbackModel = id === this.activeProviderId
      ? (planner ? this.plannerModel : this.model)
      : this.defaultModel(id, planner);
    const model = likelyModelFor(id, requestedModel) ? requestedModel : fallbackModel;
    return {id, provider, model};
  }

  async generate(args = {}) {
    const planner = Boolean(args.planner || ['company_architect', 'agent_designer', 'chief_of_staff', 'standup'].includes(args.metadata?.action));
    const selected = this.resolve(args.provider, args.model, planner);
    return selected.provider.generate({...args, model: selected.model});
  }
}

module.exports = {ProviderManager};
