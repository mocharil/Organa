const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createProvider} = require('../server/ai/provider-factory');
const {ProviderManager} = require('../server/ai/provider-manager');
const {DryRunProvider} = require('../server/ai/dry-run-provider');

const state = {settings:{}};
const stateManager = {get:()=>state, persist:async()=>{}};
const baseConfig = {
  dryRun:false,
  dryRunDelayMs:0,
  llmProvider:'auto',
  llmModel:'',
  llmPlannerModel:'',
  googleCloudProject:'',
  googleCloudLocation:'asia-southeast1',
  googleServiceAccountCredentials:null,
  googleServiceAccountKeyFile:null,
  googleServiceAccountSource:'adc',
  vertexModel:'gemini-2.5-flash',
  vertexPlannerModel:'gemini-2.5-flash',
  geminiApiKey:'',
  geminiModel:'gemini-2.5-flash',
  geminiPlannerModel:'gemini-2.5-flash',
  openaiApiKey:'', openaiModel:'gpt-test', openaiPlannerModel:'gpt-test',
  anthropicApiKey:'', anthropicModel:'claude-test', anthropicPlannerModel:'claude-test',
};

async function testNoCredentialsIsExplicitAndUsable(){
  const manager = createProvider(baseConfig, stateManager);
  const settings = manager.settings();
  assert.equal(settings.provider, 'dry-run');
  assert.equal(settings.runtime.mode, 'deterministic');
  assert.equal(settings.runtime.usingLiveAi, false);
  assert.equal(settings.runtime.liveProviderConfigured, false);
  assert.equal(settings.runtime.setupRequired, true);

  const company = await manager.generate({metadata:{action:'company_architect'},context:{companyInput:{name:'Test',goal:'Launch'}}});
  assert.equal(company.provider, 'dry-run');
  assert.ok(company.data.recommendedTeam.length > 0);
  const agent = await manager.generate({metadata:{action:'agent_designer'},context:{request:'Hire a researcher'}});
  assert.equal(agent.provider, 'dry-run');
  const plan = await manager.generate({metadata:{action:'chief_of_staff'},context:{goal:'Prepare launch',agents:[{id:'a1',status:'active',role:'Researcher'}]}});
  assert.equal(plan.provider, 'dry-run');
  const standup = await manager.generate({metadata:{action:'standup'},context:{snapshot:{completed:[],blockers:[],needsAttention:[],decisions:[],next:[]}}});
  assert.equal(standup.provider, 'dry-run');
}

async function testBrokenLiveAuthBecomesActionable(){
  const fakeVertex = {async generate(){throw new Error('Could not load the default credentials.');}};
  const providers = new Map([
    ['dry-run', new DryRunProvider({...baseConfig,dryRunDelayMs:0})],
    ['vertex', fakeVertex],
  ]);
  const manager = new ProviderManager({
    providers,
    config:{...baseConfig,llmProvider:'vertex',googleCloudProject:'project-x'},
    stateManager:{get:()=>({settings:{}}),persist:async()=>{}},
  });
  await assert.rejects(
    ()=>manager.generate({metadata:{action:'chief_of_staff'},context:{goal:'test'}}),
    error=>error.status===424 && error.code==='AI_PROVIDER_NOT_READY' && /service account|Application Default Credentials/i.test(error.message)
  );
}

function testUiMakesModeVisible(){
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root,'public/app.html'),'utf8');
  const ui = fs.readFileSync(path.join(root,'public/organa-ui.js'),'utf8');
  const mc = fs.readFileSync(path.join(root,'public/mission-control.js'),'utf8');
  const tasks = fs.readFileSync(path.join(root,'public/tasks.js'),'utf8');
  assert.match(html,/id="organaAiStatus"/);
  assert.match(ui,/AI not connected · demo mode/);
  assert.match(mc,/Live AI is not connected/);
  assert.match(mc,/GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(mc,/GEMINI_API_KEY/);
  for (const action of ['Building this organization','Designing this AI employee','Planning and routing this mission','Executing this direct assignment','Starting this mission','Running this cross-functional meeting','Generating this Stand-up']) {
    assert.ok(mc.includes(action), `missing deterministic-mode notification for ${action}`);
  }
  assert.match(tasks,/deterministic demo mode because live AI is not connected/);
}

(async()=>{
  await testNoCredentialsIsExplicitAndUsable();
  await testBrokenLiveAuthBecomesActionable();
  testUiMakesModeVisible();
  console.log('PASS: no-LLM mode stays usable, live-AI setup is explicit, and provider auth failures are actionable');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
