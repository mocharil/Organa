const crypto = require('node:crypto');
const {LlmProvider} = require('./llm-provider');

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
        ...(responseSchema ? {responseMimeType: 'application/json', responseSchema} : {}),
      },
    });
    const text = String(response.text || '').trim();
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
