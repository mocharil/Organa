const crypto = require('node:crypto');
const {LlmProvider} = require('./llm-provider');

// Grounding returns Google redirect links. Swap each for the page it points to (one request to Google's own redirect host only).
async function resolveGroundingLinks(sources) {
  return Promise.all(sources.map(async source => {
    try {
      if (new URL(source.uri).hostname !== 'vertexaisearch.cloud.google.com') return source;
      const response = await fetch(source.uri, {redirect: 'manual', signal: AbortSignal.timeout(5000)});
      const location = response.headers.get('location');
      return location && /^https?:\/\//i.test(location) ? {...source, uri: location} : source;
    } catch { return source; }
  }));
}

function thinkingConfig(model, level) {
  if (!/gemini-3/i.test(String(model)) || !level || level === 'default') return {};
  return {thinkingConfig: {thinkingLevel: level.toUpperCase()}};
}

class GeminiProvider extends LlmProvider {
  constructor(config) {
    const mode = config.geminiMode || (config.geminiApiKey ? 'api-key' : 'vertex');
    super({name: mode === 'vertex' ? 'vertex' : 'gemini', model: config.geminiModel});
    this.config = config;
    this.mode = mode;
    this.clientPromise = null;
  }

  async client() {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      let GoogleGenAI;
      try { ({GoogleGenAI} = await import('@google/genai')); }
      catch { throw new Error('Gemini mode requires @google/genai. Run npm install.'); }

      if (this.mode === 'api-key') {
        if (!this.config.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured.');
        return new GoogleGenAI({apiKey: this.config.geminiApiKey});
      }

      if (!this.config.googleCloudProject) throw new Error('Vertex AI requires GOOGLE_CLOUD_PROJECT or a service-account JSON containing project_id.');
      const googleAuthOptions = this.config.googleServiceAccountCredentials
        ? {credentials: this.config.googleServiceAccountCredentials}
        : this.config.googleServiceAccountKeyFile
          ? {keyFile: this.config.googleServiceAccountKeyFile}
          : undefined;
      return new GoogleGenAI({
        vertexai: true,
        project: this.config.googleCloudProject,
        location: this.config.googleCloudLocation,
        apiVersion: 'v1',
        ...(googleAuthOptions ? {googleAuthOptions} : {}),
      });
    })();
    return this.clientPromise;
  }

  supportsResearch() { return true; }

  // Web research with Google Search grounding. Returns notes plus the sources the model actually used.
  // Structured JSON output is not combined with the search tool; the caller feeds these notes into a structured step.
  async research({model, query, system, metadata = {}, maxOutputTokens = 3000}) {
    const startedAt = Date.now();
    const ai = await this.client();
    const useModel = model || this.model;
    const response = await ai.models.generateContent({
      model: useModel,
      contents: [{role: 'user', parts: [{text: String(query || '')}]}],
      config: {
        systemInstruction: system || undefined,
        temperature: 0.2,
        maxOutputTokens,
        tools: [{googleSearch: {}}],
        ...thinkingConfig(useModel, this.config.geminiThinkingLevel),
      },
    });
    const candidate = response.candidates?.[0] || {};
    const grounding = candidate.groundingMetadata || {};
    const seen = new Set();
    const sources = (grounding.groundingChunks || []).map(chunk => chunk.web).filter(web => web?.uri).map(web => ({title: String(web.title || web.uri).slice(0, 160), uri: String(web.uri)})).filter(source => !seen.has(source.uri) && seen.add(source.uri)).slice(0, 10);
    const usage = response.usageMetadata || {};
    const resolved = await resolveGroundingLinks(sources);
    return {
      text: String(response.text || '').trim(), sources: resolved, searchQueries: (grounding.webSearchQueries || []).slice(0, 8),
      usage: {inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0, cachedTokens: usage.cachedContentTokenCount || 0, totalTokens: usage.totalTokenCount || 0},
      model: response.modelVersion || useModel, provider: this.name, requestId: response.responseId || crypto.randomUUID(), latencyMs: Date.now() - startedAt, metadata,
    };
  }

  async generate({model, system, messages, responseSchema, metadata = {}, temperature = 0.2, maxOutputTokens = 4096}) {
    const startedAt = Date.now();
    const ai = await this.client();
    const contents = Array.isArray(messages)
      ? messages.map(message => ({role: message.role === 'assistant' ? 'model' : 'user', parts: [{text: String(message.content ?? '')}]}))
      : String(messages || '');
    const response = await ai.models.generateContent({
      model: model || this.model,
      contents,
      config: {
        systemInstruction: system || undefined,
        temperature,
        maxOutputTokens,
        ...thinkingConfig(model || this.model, this.config.geminiThinkingLevel),
        ...(responseSchema ? {responseMimeType: 'application/json', responseSchema} : {}),
      },
    });
    const finishReason = response.candidates?.[0]?.finishReason;
    const text = String(response.text || '').trim();
    if (responseSchema && finishReason === 'MAX_TOKENS') throw new Error('Gemini returned invalid structured output: the answer was cut off at the output token limit.');
    let data = null;
    if (responseSchema) {
      try { data = JSON.parse(text); }
      catch (error) { throw new Error(`Gemini returned invalid structured output: ${error.message}`); }
    }
    const usage = response.usageMetadata || {};
    return {
      text, data, toolCalls: response.functionCalls || [],
      usage: {
        inputTokens: usage.promptTokenCount || usage.inputTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || usage.outputTokenCount || 0,
        cachedTokens: usage.cachedContentTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      },
      model: response.modelVersion || model || this.model,
      provider: this.name,
      requestId: response.responseId || crypto.randomUUID(),
      latencyMs: Date.now()-startedAt,
      metadata,
    };
  }
}

module.exports = {GeminiProvider};
