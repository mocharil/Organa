const {spawn} = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '../..');

async function availablePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function startServer({dataDir, extraEnv = {}} = {}) {
  const ownsDirectory = !dataDir;
  dataDir ||= fs.mkdtempSync(path.join(os.tmpdir(), 'organa-onboarding-'));
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {...process.env, ENV_FILE: '/nonexistent', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ORGANA_STORAGE: 'json', ORGANA_DRY_RUN: '1', DRY_RUN_DELAY_MS: '25', ...extraEnv},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
    }
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) return {base, dataDir, stop, cleanup: async () => { await stop(); if (ownsDirectory) fs.rmSync(dataDir, {recursive: true, force: true}); }};
      } catch {}
      await delay(80);
    }
    throw new Error(`Server did not start: ${logs}`);
  } catch (error) {
    await stop();
    if (ownsDirectory) fs.rmSync(dataDir, {recursive: true, force: true});
    throw error;
  }
}

module.exports = {startServer, ROOT};
