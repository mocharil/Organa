const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4208;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'organa-dual-intake-'));
let server;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(route,{method='GET',body,expected}={}){
  const response=await fetch(`${BASE}${route}`,{method,headers:body===undefined?undefined:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await response.text();let payload=null;try{payload=raw?JSON.parse(raw):null;}catch{payload=raw;}
  if(expected!==undefined)assert.equal(response.status,expected,`${method} ${route}: ${raw}`);else assert.ok(response.ok,`${method} ${route} returned ${response.status}: ${raw}`);
  return payload;
}
async function waitForServer(){for(let i=0;i<80;i++){try{const health=await request('/api/health');if(health?.status==='ok')return;}catch{}await sleep(100);}throw new Error('Server did not start');}

(async()=>{
  server=spawn(process.execPath,['server/server.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1',DATA_DIR:dataDir,ENV_FILE:'/nonexistent',KANTOR_STORAGE:'json',KANTOR_DRY_RUN:'1',KANTOR_ENABLE_DEMO_RESET:'1',GEMINI_API_KEY:'',GOOGLE_API_KEY:'',GOOGLE_CLOUD_PROJECT:''},stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',chunk=>{stderr+=chunk;});
  await waitForServer();
  const health=await request('/api/health');assert.equal(health.version,`${require('../package.json').version}-organa`);assert.equal(health.ai.mode,'deterministic');
  await request('/api/demo/reset',{method:'POST',body:{}});
  const roster=(await request('/api/agents')).agents;const chief=roster.find(a=>/chief of staff/i.test(a.role));const specialist=roster.find(a=>a.status==='active'&&!/chief of staff/i.test(a.role));assert.ok(chief&&specialist,'demo roster should contain Chief of Staff and specialists');

  const project=await request('/api/projects/plan',{method:'POST',expected:201,body:{goal:'Understand a revenue drop and recommend the next actions.',intakeMode:'chief_of_staff'}});
  assert.equal(project.intakeMode,'chief_of_staff');assert.equal(project.routing.mode,'chief_of_staff');assert.equal(project.routing.coordinatorAgentId,chief.id);assert.ok(project.routing.participantAgentIds.length>=1);assert.ok(project.routing.assignments.length===project.planDraft.tasks.length);assert.ok(project.routing.assignments.every(item=>item.ownerAgentId));assert.match(project.routing.rationale,/matched each workstream/i);

  const task=await request('/api/tasks',{method:'POST',expected:201,body:{title:'Review campaign performance',brief:'Review last month campaign performance and propose three concrete experiments for next week.',assigneeAgentId:specialist.id,approvalPolicy:'review_output',intakeMode:'direct_agent'}});
  assert.equal(task.intakeMode,'direct_agent');assert.equal(task.projectId,null);assert.equal(task.assigneeAgentId,specialist.id);assert.equal(task.approvalPolicy,'review_output');
  const events=await request('/api/events?limit=100');const created=events.find(e=>e.type==='task.created'&&e.entity?.id===task.id);assert.equal(created?.payload?.intakeMode,'direct_agent');

  const ui=fs.readFileSync(path.join(ROOT,'public/mission-control.js'),'utf8');
  for(const phrase of ['Ask Chief of Staff','Assign to AI Employee','Plan with Chief of Staff','Send instruction','Why this route','Direct assignments'])assert.ok(ui.includes(phrase),`missing dual-intake UI phrase: ${phrase}`);
  assert.match(ui,/intakeMode:'direct_agent'/);assert.match(ui,/intakeMode:'chief_of_staff'/);

  console.log('PASS: dual work intake supports Chief of Staff auto-routing and governed direct AI employee assignment');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{if(server&&!server.killed)server.kill('SIGTERM');});
