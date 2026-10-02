const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function configFrom(env) {
  const result = spawnSync(process.execPath, ['-e', `const c=require('./server/config'); console.log(JSON.stringify({project:c.googleCloudProject,source:c.googleServiceAccountSource,llmProvider:c.llmProvider}))`], {
    cwd: ROOT,
    env: {...process.env, ENV_FILE:'/nonexistent', GOOGLE_APPLICATION_CREDENTIALS:'', GOOGLE_SERVICE_ACCOUNT_JSON:'', GOOGLE_SERVICE_ACCOUNT_JSON_BASE64:'', GOOGLE_CLOUD_PROJECT:'', GCP_PROJECT_ID:'', ...env},
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

async function main() {
  const inline = configFrom({
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({type:'service_account', project_id:'service-account-project', client_email:'test@example.invalid', private_key:'dummy'}),
    KANTOR_LLM_PROVIDER:'vertex',
  });
  assert.equal(inline.project, 'service-account-project');
  assert.equal(inline.source, 'inline-json');
  assert.equal(inline.llmProvider, 'vertex');

  const config = require('../server/config');
  const {createProvider} = require('../server/ai/provider-factory');
  const state = {settings:{}};
  let persistCount = 0;
  const stateManager = {get:()=>state, persist:async()=>{persistCount += 1;}};
  const manager = createProvider({
    ...config,
    dryRun:false,
    llmProvider:'auto',
    googleCloudProject:'vertex-project',
    googleServiceAccountCredentials:{type:'service_account',project_id:'vertex-project',client_email:'x@example.invalid',private_key:'dummy'},
    googleServiceAccountSource:'inline-json',
    geminiApiKey:'gemini-key',
    openaiApiKey:'openai-key',
    anthropicApiKey:'anthropic-key',
  }, stateManager);
  const settings = manager.settings();
  assert.equal(settings.provider, 'vertex');
  for (const id of ['vertex','gemini','openai','anthropic','dry-run']) {
    assert.equal(settings.providers.find(p=>p.id===id)?.configured, true, `${id} should be configurable`);
  }
  assert.match(settings.providers.find(p=>p.id==='vertex').authMode, /service-account/);

  const changed = await manager.configure({provider:'openai', model:'gpt-custom', plannerModel:'gpt-planner'});
  assert.equal(changed.provider, 'openai');
  assert.equal(changed.model, 'gpt-custom');
  assert.equal(changed.plannerModel, 'gpt-planner');
  assert.equal(state.settings.llm.provider, 'openai');
  assert.equal(persistCount, 1);

  // A coworker can override the provider/model while "inherit" uses workspace defaults.
  assert.equal(manager.resolve('inherit', null).id, 'openai');
  assert.equal(manager.resolve('gemini', 'gemini-2.5-flash').id, 'gemini');
  assert.equal(manager.resolve('gemini', 'gpt-wrong-family').model, manager.defaultModel('gemini'));

  console.log('PASS: multi-provider configuration, service-account inference, runtime switching and per-agent routing');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
