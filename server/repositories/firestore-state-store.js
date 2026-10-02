class FirestoreStateStore {
  constructor({projectId, databaseId, createDefaultState}) {
    this.projectId = projectId;
    this.databaseId = databaseId;
    this.createDefaultState = createDefaultState;
    this.db = null;
  }

  async client() {
    if (this.db) return this.db;
    let Firestore;
    try { ({Firestore} = require('@google-cloud/firestore')); }
    catch { throw new Error('ORGANA_STORAGE=firestore requires @google-cloud/firestore. Run npm install before deployment.'); }
    this.db = new Firestore({projectId: this.projectId || undefined, databaseId: this.databaseId});
    return this.db;
  }

  async load() {
    const db = await this.client();
    const root = db.collection('organa_runtime').doc('active');
    const snap = await root.get();
    if (!snap.exists) {
      const state = this.createDefaultState();
      await this.save(state);
      return state;
    }
    return snap.data().state;
  }

  async save(state) {
    const db = await this.client();
    const next = JSON.parse(JSON.stringify(state));
    next.metadata ||= {};
    next.metadata.updatedAt = new Date().toISOString();
    await db.collection('organa_runtime').doc('active').set({state: next, updatedAt: next.metadata.updatedAt});
  }
}

module.exports = {FirestoreStateStore};
