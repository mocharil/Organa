const fs = require('node:fs');
const path = require('node:path');

class JsonStateStore {
  constructor({dataDir, fileName, createDefaultState}) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, fileName);
    this.createDefaultState = createDefaultState;
    fs.mkdirSync(dataDir, {recursive: true});
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!parsed || typeof parsed !== 'object') throw new Error('state is not an object');
      return parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const state = this.createDefaultState();
      this.save(state);
      return state;
    }
  }

  save(state) {
    const next = JSON.parse(JSON.stringify(state));
    next.metadata ||= {};
    next.metadata.updatedAt = new Date().toISOString();
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = {JsonStateStore};
