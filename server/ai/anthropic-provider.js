const crypto = require('node:crypto');
const {LlmProvider} = require('./llm-provider');

function stringifyMessages(messages, responseSchema) {
  const base = Array.isArray(messages)
    ? messages.map(message => `${String(message.role || 'user').toUpperCase()}: ${String(message.content ?? '')}`).join('\n\n')
    : String(messages || '');
  if (!responseSchema) return base;
  // Some Organa schemas intentionally contain flexible object payloads that are broader than
  // Anthropic's strict structured-output subset. Prompt-only JSON keeps those schemas portable.
  return `${base}\n\nReturn ONLY valid JSON matching this JSON Schema. Do not wrap it in markdown:\n${JSON.stringify(responseSchema)}`;
}

class AnthropicProvider extends LlmProvider {
  constructor(config) {
    super({name: 'anthropic', model: config.anthropicModel});
    this.config = config;
  }

  async generate({model, system, messages, responseSchema, metadata = {}, temperature = 0.2, maxOutputTokens = 4096}) {
    if (!this.config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
    const startedAt = Date.now();
    const body = {
      model: model || this.model,
      max_tokens: maxOutputTokens,
      temperature,
      messages: [{role: 'user', content: stringifyMessages(messages, responseSchema)}],
    };
    if (system) body.system = system;

    const response = await fetch(`${this.config.anthropicBaseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || `Anthropic request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    const text = (payload.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
    let data = null;
    if (responseSchema) {
      try { data = JSON.parse(text); }
      catch (error) { throw new Error(`Anthropic returned invalid structured output: ${error.message}`); }
    }
    return {
      text,
      data,
      toolCalls: (payload.content || []).filter(block => block.type === 'tool_use'),
      usage: {
        inputTokens: payload.usage?.input_tokens || 0,
        outputTokens: payload.usage?.output_tokens || 0,
        cachedTokens: payload.usage?.cache_read_input_tokens || 0,
        totalTokens: (payload.usage?.input_tokens || 0) + (payload.usage?.output_tokens || 0),
      },
      model: payload.model || model || this.model,
      provider: 'anthropic',
      requestId: payload.id || crypto.randomUUID(),
      latencyMs: Date.now() - startedAt,
      metadata,
    };
  }
}

module.exports = {AnthropicProvider};
