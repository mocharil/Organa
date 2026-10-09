const fs = require('node:fs');
const path = require('node:path');

const BACKUP_INTERVAL_MS = 10 * 60 * 1000;
const BACKUP_KEEP = 30;
const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

class JsonStateStore {
  constructor({dataDir, fileName, createDefaultState, backupIntervalMs = BACKUP_INTERVAL_MS, backupKeep = BACKUP_KEEP}) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, fileName);
    this.backupDir = path.join(dataDir, 'backups');
    this.createDefaultState = createDefaultState;
    this.backupIntervalMs = backupIntervalMs;
    this.backupKeep = backupKeep;
    this.lastBackupAt = 0;
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

  // Copies the current state file into data/backups. Returns the backup file name, or null when there is nothing to copy.
  backup(label = 'auto') {
    if (!fs.existsSync(this.file)) return null;
    fs.mkdirSync(this.backupDir, {recursive: true});
    const safeLabel = String(label).replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'auto';
    let name = `state-${safeLabel}-${stamp(new Date())}.json`;
    for (let n = 2; fs.existsSync(path.join(this.backupDir, name)); n += 1) name = `state-${safeLabel}-${stamp(new Date())}-${n}.json`;
    fs.copyFileSync(this.file, path.join(this.backupDir, name));
    this.lastBackupAt = Date.now();
    this.prune();
    return name;
  }

  // Manual and pre-restore/pre-demo backups are never pruned automatically; only rolling "auto" ones are.
  prune() {
    const autos = this.listBackups().filter(item => item.label === 'auto');
    for (const old of autos.slice(this.backupKeep)) { try { fs.unlinkSync(path.join(this.backupDir, old.name)); } catch { /* best effort */ } }
  }

  listBackups() {
    let names = [];
    try { names = fs.readdirSync(this.backupDir).filter(name => /^state-[a-z0-9-]+\.json$/i.test(name)); } catch { return []; }
    return names.map(name => {
      const stat = fs.statSync(path.join(this.backupDir, name));
      return {name, label: (name.match(/^state-([a-z0-9]+)-/i) || [])[1] || 'auto', size: stat.size, createdAt: stat.mtime.toISOString()};
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
  }

  readBackup(name) {
    if (!/^state-[a-z0-9-]+\.json$/i.test(String(name))) throw Object.assign(new Error('Invalid backup name.'), {status: 400});
    const file = path.join(this.backupDir, name);
    if (!fs.existsSync(file)) throw Object.assign(new Error('Backup not found.'), {status: 404});
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.companies)) throw Object.assign(new Error('This backup is not a valid Organa workspace.'), {status: 422});
    return parsed;
  }

  save(state) {
    const next = JSON.parse(JSON.stringify(state));
    next.metadata ||= {};
    next.metadata.updatedAt = new Date().toISOString();
    // One rolling snapshot of the previous file at most every few minutes, so a bad edit or bug is recoverable.
    if (this.backupIntervalMs >= 0 && Date.now() - this.lastBackupAt >= this.backupIntervalMs) {
      try { this.backup('auto'); } catch { /* a backup problem must never block saving the workspace */ }
    }
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = {JsonStateStore};
