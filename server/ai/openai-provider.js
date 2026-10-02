const crypto = require('node:crypto');
const {LlmProvider} = require('./llm-provider');

function toInput(messages) {
  if (!Array.isArray(messages)) return String(messages || '');
  return messages.map(message => ({
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'developer' : 'user',
    content: String(message.content ?? ''),
  }));
}

class OpenAIProvider extends LlmProvider {
  constructor(config) {
    super({name: 'openai', model: config.openaiModel});
    this.config = config;
  }

  async generate({model, system, messages, responseSchema, metadata = {}, maxOutputTokens = 4096}) {
    if (!this.config.openaiApiKey) throw new Error('OPENAI_API_KEY is not configured.');
    const startedAt = Date.now();
    const body = {
      model: model || this.model,
      input: toInput(messages),
      max_output_tokens: maxOutputTokens,
      store: false,
    };
    if (system) body.instructions = system;
    if (responseSchema) {
      body.text = {
        format: {
          type: 'json_schema',
          name: 'organa_response',
          schema: responseSchema,
          strict: false,
        },
      };
    }

    const response = await fetch(`${this.config.openaiBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.openaiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || `OpenAI request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    const text = String(payload.output_text || payload.output?.flatMap(item => item.content || []).find(part => part.type === 'output_text')?.text || '').trim();
    let data = null;
    if (responseSchema) {
      try { data = JSON.parse(text); }
      catch (error) { throw new Error(`OpenAI returned invalid structured output: ${error.message}`); }
    }
    const usage = payload.usage || {};
    return {
      text,
      data,
      toolCalls: [],
      usage: {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cachedTokens: usage.input_tokens_details?.cached_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
      model: payload.model || model || this.model,
      provider: 'openai',
      requestId: payload.id || crypto.randomUUID(),
      latencyMs: Date.now() - startedAt,
      metadata,
    };
  }
}

module.exports = {OpenAIProvider};
