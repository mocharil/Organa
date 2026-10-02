const {DryRunProvider} = require('./dry-run-provider');
const {GeminiProvider} = require('./gemini-provider');
const {OpenAIProvider} = require('./openai-provider');
const {AnthropicProvider} = require('./anthropic-provider');
const {ProviderManager} = require('./provider-manager');

function createProvider(config, stateManager) {
  const providers = new Map();
  providers.set('dry-run', new DryRunProvider(config));

  if (config.googleCloudProject) providers.set('vertex', new GeminiProvider({...config, geminiMode: 'vertex', geminiModel: config.vertexModel}));
  if (config.geminiApiKey) providers.set('gemini', new GeminiProvider({...config, geminiMode: 'api-key', geminiModel: config.geminiModel}));
  if (config.openaiApiKey) providers.set('openai', new OpenAIProvider(config));
  if (config.anthropicApiKey) providers.set('anthropic', new AnthropicProvider(config));

  return new ProviderManager({providers, config, stateManager});
}

module.exports = {createProvider};
