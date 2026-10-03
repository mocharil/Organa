const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {AgentService} = require('../server/services/agent-service');

const root = path.resolve(__dirname, '..');
const mc = fs.readFileSync(path.join(root, 'public/mission-control.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/organa-theme.css'), 'utf8');

for (const marker of [
  'Human Founder',
  'Chief of Staff',
  'Organization structure',
  'Current work',
  'Responsibilities',
  'Reporting & collaborators',
  'Performance',
  'Model & cost',
  'Recent activity',
  'Configuration',
  'Reports to',
  'Collapse divisions',
]) assert(mc.includes(marker), `missing hierarchical team UI marker: ${marker}`);

for (const selector of ['.mc-team-workspace','.mc-team-org-chart','.mc-chief-node','.mc-division-grid','.mc-report-children','.mc-team-profile']) {
  assert(css.includes(selector), `missing hierarchical team style: ${selector}`);
}

const createdAt = new Date().toISOString();
const state = {
  activeCompanyId: 'cmp_1',
  agents: [
    {id:'chief',companyId:'cmp_1',displayName:'Ari',role:'AI Chief of Staff',division:'Leadership',managerAgentId:null,status:'active',modelPolicy:{}},
    {id:'lead',companyId:'cmp_1',displayName:'Wira',role:'Engineering Lead',division:'Engineering',managerAgentId:'chief',status:'active',modelPolicy:{}},
    {id:'specialist',companyId:'cmp_1',displayName:'Nina',role:'Frontend Engineer',division:'Engineering',managerAgentId:'lead',status:'active',modelPolicy:{}},
  ],
};
const stateManager = {get:()=>state,persist:async()=>{},};
const eventService = {append:()=>{}};
const service = new AgentService({stateManager,eventService,provider:{},usageService:{},config:{}});

(async()=>{
  const specialist = await service.patch('specialist',{managerAgentId:'chief'});
  assert.equal(specialist.managerAgentId,'chief','valid reporting-line update should be saved');
  await service.patch('specialist',{managerAgentId:'lead'});
  await assert.rejects(()=>service.patch('lead',{managerAgentId:'specialist'}),/management cycle/i,'cycle should be rejected');
  await assert.rejects(()=>service.patch('lead',{managerAgentId:'lead'}),/cannot report to themselves/i,'self-manager should be rejected');
  const chief = await service.patch('chief',{managerAgentId:'lead'});
  assert.equal(chief.managerAgentId,null,'Chief of Staff must remain directly under the human founder');
  assert.ok(createdAt); // keep deterministic lint-free CommonJS without external test runner.
  console.log('PASS: AI Team hierarchy renders reporting structure and prevents invalid manager cycles');
})().catch(error=>{console.error(error);process.exit(1);});
