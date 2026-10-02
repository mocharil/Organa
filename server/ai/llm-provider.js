class LlmProvider {
  constructor({name = 'unknown', model = null} = {}) { this.name = name; this.model = model; }
  async generate() { throw new Error('generate() must be implemented by an LLM provider'); }
}
module.exports = {LlmProvider};
