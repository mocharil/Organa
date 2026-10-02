class StateManager {
  constructor(store) { this.store = store; this.state = null; this.saveChain = Promise.resolve(); }
  async init() { this.state = await this.store.load(); return this.state; }
  get() { if (!this.state) throw new Error('StateManager not initialized'); return this.state; }
  companyId() { return this.get().activeCompanyId; }
  async persist() {
    const snapshot = JSON.parse(JSON.stringify(this.get()));
    this.saveChain = this.saveChain.catch(() => {}).then(() => this.store.save(snapshot));
    return this.saveChain;
  }
  async mutate(fn) { const result = await fn(this.get()); await this.persist(); return result; }
  async replace(state) { this.state = state; await this.persist(); return this.state; }
}
module.exports = {StateManager};
