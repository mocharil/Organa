// Organa API + static server. The human remains the final decision-maker;
// A selectable LLM provider proposes and executes bounded work while deterministic server code owns state, dependencies and approvals.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const config=require('./config');
const {createDefaultState,nusaDemoState}=require('./data/default-state');
const {JsonStateStore}=require('./repositories/json-state-store');
const {FirestoreStateStore}=require('./repositories/firestore-state-store');
const {createProvider}=require('./ai/provider-factory');
const {StateManager}=require('./services/state-manager');
const {EventService}=require('./services/event-service');
const {UsageService}=require('./services/usage-service');
const {CompanyService}=require('./services/company-service');
const {NorthStarService}=require('./services/north-star-service');
const {BootstrapService}=require('./services/bootstrap-service');
const {AgentService}=require('./services/agent-service');
const {OrchestrationService}=require('./services/orchestration-service');
const {DeliverableService}=require('./services/deliverable-service');
const {ApprovalService}=require('./services/approval-service');
const {TaskService}=require('./services/task-service');
const {TaskWorker}=require('./services/task-worker');
const {MeetingService}=require('./services/meeting-service');
const {StandupService}=require('./services/standup-service');
const {id,now,activeAgents}=require('./services/helpers');

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.mp4':'video/mp4','.webm':'video/webm','.json':'application/json','.ico':'image/x-icon'};
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function readJson(req){return new Promise((resolve,reject)=>{let size=0;const chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>2e6){reject(Object.assign(new Error('Request too large'),{status:413}));req.destroy();}else chunks.push(chunk);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString()||'{}'));}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});});}
function serveFile(res,url){let file;try{const route=url.pathname==='/'?'/index.html':url.pathname==='/app'||url.pathname==='/workspace'?'/app.html':url.pathname;file=path.join(config.publicDir,decodeURIComponent(route));}catch{return send(res,400,{error:'Bad path.'});}if(!file.startsWith(config.publicDir+path.sep))return send(res,403,{error:'Forbidden.'});fs.readFile(file,(error,data)=>{if(error){res.writeHead(404,{'content-type':'text/plain'});return res.end('Not found');}res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(data);});}

function normalizeState(state){for(const key of ['companies','northStars','goals','agents','projects','tasks','meetings','deliverables','approvals','events','standups','usage','bootstrapProposals'])if(!Array.isArray(state[key]))state[key]=[];state.settings ||= {};state.schemaVersion=2;if(!state.activeCompanyId&&state.companies[0])state.activeCompanyId=state.companies[0].id;return state;}

async function buildRuntime(){
 const jsonStore=new JsonStateStore({dataDir:config.dataDir,fileName:config.stateFileName,createDefaultState});let store=jsonStore,storageMode='json';
 if(config.storage==='firestore'){
  try{const cloud=new FirestoreStateStore({projectId:config.googleCloudProject,databaseId:config.firestoreDatabaseId,createDefaultState});await cloud.load();store=cloud;storageMode='firestore';}
  catch(error){console.warn(`Firestore unavailable (${error.message}). Falling back to local JSON storage.`);}
 }
 const stateManager=new StateManager(store);await stateManager.init();normalizeState(stateManager.get());await stateManager.persist();
 const provider=createProvider(config,stateManager);const eventService=new EventService(stateManager);const usageService=new UsageService(stateManager);const companyService=new CompanyService({stateManager});const northStarService=new NorthStarService({stateManager,eventService});const deliverableService=new DeliverableService({stateManager,eventService});const approvalService=new ApprovalService({stateManager,eventService});const orchestrationService=new OrchestrationService({stateManager,provider,eventService,usageService,config});const agentService=new AgentService({stateManager,provider,eventService,usageService,config});const bootstrapService=new BootstrapService({stateManager,provider,eventService,usageService,config});const taskService=new TaskService({stateManager,eventService,deliverableService,approvalService,orchestrationService});const taskWorker=new TaskWorker({stateManager,provider,eventService,usageService,deliverableService,approvalService,orchestrationService,config});taskService.setKick(taskWorker.kick);const meetingService=new MeetingService({stateManager,provider,eventService,usageService,deliverableService,approvalService,config});const standupService=new StandupService({stateManager,provider,eventService,usageService,config});
 // Recover interrupted task runs after a process restart.
 let reset=false;for(const task of stateManager.get().tasks){if(task.status==='active'){task.status='queued';task.runId=null;task.version=(task.version||0)+1;task.updatedAt=now();reset=true;}}if(reset)await stateManager.persist();
 return{stateManager,provider,storageMode,eventService,usageService,companyService,northStarService,deliverableService,approvalService,orchestrationService,agentService,bootstrapService,taskService,taskWorker,meetingService,standupService};
}

async function api(runtime,req,res,url){
 const {stateManager,provider,storageMode,eventService,usageService,companyService,northStarService,deliverableService,approvalService,orchestrationService,agentService,bootstrapService,taskService,taskWorker,meetingService,standupService}=runtime;
 const body=async()=>readJson(req);
 if(url.pathname==='/api/health'&&req.method==='GET'){const llm=provider.settings();return send(res,200,{status:'ok',version:'3.18.0-organa',provider:provider.name,model:provider.model,plannerModel:provider.plannerModel,storage:storageMode,companyId:stateManager.companyId(),cloudReady:Boolean(config.googleCloudProject),ai:llm.runtime,timestamp:now()});}
 if(url.pathname==='/api/llm/settings'&&req.method==='GET')return send(res,200,provider.settings());
 if(url.pathname==='/api/llm/settings'&&req.method==='PATCH')return send(res,200,await provider.configure(await body()));
 if(url.pathname==='/api/company'&&req.method==='GET')return send(res,200,{company:companyService.get(),northStar:northStarService.get()});
 if(url.pathname==='/api/companies'&&req.method==='GET')return send(res,200,companyService.list());

 if(url.pathname==='/api/company-bootstrap/templates'&&req.method==='GET')return send(res,200,bootstrapService.listTemplates());
 let templateMatch=url.pathname.match(/^\/api\/company-bootstrap\/templates\/([^/]+)\/proposal$/);if(templateMatch&&req.method==='POST')return send(res,201,await bootstrapService.fromTemplate(templateMatch[1],await body()));
 if(url.pathname==='/api/company-bootstrap/proposals'&&req.method==='POST')return send(res,201,await bootstrapService.propose(await body()));
 let m=url.pathname.match(/^\/api\/company-bootstrap\/proposals\/([^/]+)$/);if(m&&req.method==='GET'){const p=bootstrapService.get(m[1]);return p?send(res,200,p):send(res,404,{error:'Bootstrap proposal not found.'});}
 m=url.pathname.match(/^\/api\/company-bootstrap\/proposals\/([^/]+)\/activate$/);if(m&&req.method==='POST'){const result=await bootstrapService.activate(m[1],await body());setImmediate(taskWorker.kick);return send(res,200,result);}

 if(url.pathname==='/api/agents'&&req.method==='GET'){
  const list=agentService.list({includeDrafts:url.searchParams.get('includeDrafts')==='1'});const members=Object.fromEntries(agentService.roster().map(a=>[a.displayName,{id:a.id,role:a.role,model:a.model,division:a.division,group:a.group}]));const llm=provider.settings();return send(res,200,{mode:provider.name,model:provider.model,ai:llm.runtime,members,roster:agentService.roster(),agents:list});
 }
 if(url.pathname==='/api/agents/design'&&req.method==='POST'){const input=await body();return send(res,201,await agentService.design(input.request));}
 m=url.pathname.match(/^\/api\/agents\/([^/]+)$/);if(m&&req.method==='GET'){const a=agentService.get(m[1]);return a?send(res,200,a):send(res,404,{error:'Agent not found.'});}if(m&&req.method==='PATCH')return send(res,200,await agentService.patch(m[1],await body()));
 m=url.pathname.match(/^\/api\/agents\/([^/]+)\/(activate|pause|archive)$/);if(m&&req.method==='POST')return send(res,200,await agentService.setStatus(m[1],m[2]==='activate'?'active':m[2]==='pause'?'paused':'archived'));

 if(url.pathname==='/api/north-star'&&req.method==='GET')return send(res,200,northStarService.get());
 if(url.pathname==='/api/north-star/versions'&&req.method==='GET')return send(res,200,northStarService.versions());
 if(url.pathname==='/api/north-star/versions'&&req.method==='POST')return send(res,201,await northStarService.create(await body()));
 m=url.pathname.match(/^\/api\/north-star\/versions\/(\d+)\/activate$/);if(m&&req.method==='POST')return send(res,200,await northStarService.activate(m[1]));
 if(url.pathname==='/api/goals'&&req.method==='GET'){const s=stateManager.get();return send(res,200,(s.goals||[]).filter(g=>g.companyId===s.activeCompanyId));}

 if(url.pathname==='/api/projects'&&req.method==='GET')return send(res,200,orchestrationService.list());
 if(url.pathname==='/api/projects/plan'&&req.method==='POST')return send(res,201,await orchestrationService.plan(await body()));
 m=url.pathname.match(/^\/api\/projects\/([^/]+)$/);if(m&&req.method==='GET'){const p=orchestrationService.get(m[1]);return p?send(res,200,p):send(res,404,{error:'Project not found.'});}
 m=url.pathname.match(/^\/api\/projects\/([^/]+)\/graph$/);if(m&&req.method==='GET')return send(res,200,orchestrationService.graph(m[1]));
 m=url.pathname.match(/^\/api\/projects\/([^/]+)\/activate-plan$/);if(m&&req.method==='POST'){const result=await orchestrationService.activate(m[1]);setImmediate(taskWorker.kick);return send(res,200,result);}

 if(url.pathname==='/api/tasks'&&req.method==='GET')return send(res,200,taskService.list());
 if(url.pathname==='/api/tasks'&&req.method==='POST')return send(res,201,await taskService.create(await body()));
 // Kept for the original browser migration path. Importing into the new canonical store is intentionally conservative.
 if(url.pathname==='/api/tasks/import'&&req.method==='POST'){const incoming=await body();if(!Array.isArray(incoming))return send(res,400,{error:'Expected a list of tasks.'});const current=taskService.list();if(current.length)return send(res,409,{error:'The server already has tasks.'});const created=[];for(const item of incoming.slice(0,100)){try{created.push(await taskService.create({...item,approvalPolicy:'review_output'}));}catch{/* skip old invalid assignee */}}return send(res,201,created);}
 m=url.pathname.match(/^\/api\/tasks\/([^/]+)$/);if(m&&req.method==='GET'){const t=taskService.get(m[1]);return t?send(res,200,{...t,assignee:agentService.get(t.assigneeAgentId)?.displayName||t.assignee}):send(res,404,{error:'Task not found.'});}
 if(m&&req.method==='PATCH'){const input=await body();if(input.action==='answer')return send(res,200,await taskService.answer(m[1],input));if(input.action==='approve'||input.action==='revise')return send(res,200,await taskService.review(m[1],input));if(input.assignee!==undefined||input.assigneeAgentId!==undefined)return send(res,200,await taskService.reassign(m[1],input.assigneeAgentId||input.assignee));if(input.status==='queued')return send(res,200,await taskService.retry(m[1]));return send(res,409,{error:'AI coworkers own task execution. Use approve, revise, answer, reassign, or retry.'});}
 m=url.pathname.match(/^\/api\/tasks\/([^/]+)\/(answer|approve|request-revision|retry|reassign)$/);if(m&&req.method==='POST'){const input=await body();if(m[2]==='answer')return send(res,200,await taskService.answer(m[1],input));if(m[2]==='approve')return send(res,200,await taskService.review(m[1],{...input,action:'approve'}));if(m[2]==='request-revision')return send(res,200,await taskService.review(m[1],{...input,action:'revise'}));if(m[2]==='retry')return send(res,200,await taskService.retry(m[1]));if(m[2]==='reassign')return send(res,200,await taskService.reassign(m[1],input.assigneeAgentId||input.assignee));}

 if(url.pathname==='/api/meetings'&&req.method==='GET')return send(res,200,meetingService.list());
 m=url.pathname.match(/^\/api\/meetings\/([^/]+)$/);if(m&&req.method==='GET'){const meeting=meetingService.get(m[1]);return meeting?send(res,200,meeting):send(res,404,{error:'Meeting not found.'});}
 m=url.pathname.match(/^\/api\/meetings\/([^/]+)\/start$/);if(m&&req.method==='POST')return send(res,200,await meetingService.start(m[1]));
 m=url.pathname.match(/^\/api\/meetings\/([^/]+)\/(approve|request-revision)$/);if(m&&req.method==='POST'){const input=await body();return send(res,200,await meetingService.approve(m[1],m[2]==='approve',input.note||input.feedback||''));}

 if(url.pathname==='/api/deliverables'&&req.method==='GET')return send(res,200,deliverableService.list());
 m=url.pathname.match(/^\/api\/deliverables\/([^/]+)$/);if(m&&req.method==='GET'){const d=deliverableService.get(m[1]);return d?send(res,200,d):send(res,404,{error:'Deliverable not found.'});}
 m=url.pathname.match(/^\/api\/deliverables\/([^/]+)\/why$/);if(m&&req.method==='GET')return send(res,200,deliverableService.why(m[1]));

 if(url.pathname==='/api/approvals'&&req.method==='GET')return send(res,200,approvalService.list(url.searchParams.get('status')||undefined));
 m=url.pathname.match(/^\/api\/approvals\/([^/]+)\/(approve|reject|request-revision)$/);if(m&&req.method==='POST'){const input=await body(),a=approvalService.get(m[1]);if(!a)return send(res,404,{error:'Approval not found.'});if(a.entityType==='task'){const task=taskService.get(a.entityId);if(!task)return send(res,404,{error:'Linked task not found.'});if(m[2]==='approve')return send(res,200,await taskService.review(task.id,{action:'approve',version:task.version}));return send(res,200,await taskService.review(task.id,{action:'revise',feedback:input.note||input.feedback||'Please revise this output.',version:task.version}));}if(a.entityType==='meeting')return send(res,200,await meetingService.approve(a.entityId,m[2]==='approve',input.note||input.feedback||''));const resolved=approvalService.resolve(a.id,m[2]==='approve'?'approved':'rejected',input.note||'');await stateManager.persist();return send(res,200,resolved);}

 if(url.pathname==='/api/events'&&req.method==='GET')return send(res,200,eventService.list({after:url.searchParams.get('after')||undefined,type:url.searchParams.get('type')||undefined,limit:Number(url.searchParams.get('limit')||200)}));
 if(url.pathname==='/api/standups/latest'&&req.method==='GET')return send(res,200,standupService.latest());
 if(url.pathname==='/api/standups/generate'&&req.method==='POST')return send(res,201,await standupService.generate());
 m=url.pathname.match(/^\/api\/standups\/([^/]+)$/);if(m&&req.method==='GET'){const st=standupService.get(m[1]);return st?send(res,200,st):send(res,404,{error:'Stand-up not found.'});}
 if(url.pathname==='/api/usage/summary'&&req.method==='GET')return send(res,200,usageService.summary());

 if(url.pathname==='/api/demo/reset'&&req.method==='POST'){if(!config.enableDemoReset)return send(res,403,{error:'Demo reset is disabled.'});const llmSettings=stateManager.get().settings?.llm;const next=nusaDemoState();if(llmSettings)next.settings={...(next.settings||{}),llm:{...llmSettings}};await stateManager.replace(next);provider.refresh();runtime.taskWorker.busy.clear();return send(res,200,{ok:true,company:companyService.get(),agents:agentService.list()});}
 return send(res,404,{error:'Not found.'});
}

(async()=>{
 const runtime=await buildRuntime();
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host||config.host}`);if(!url.pathname.startsWith('/api/'))return serveFile(res,url);try{await api(runtime,req,res,url);}catch(error){const status=error.status||500;const publicError=error.publicMessage||(status>=500?'Server error.':error.message);send(res,status,{error:publicError,code:error.code||undefined,details:error.publicMessage?error.details:(status>=500?undefined:error.details)});if(status>=500)console.error(error);}});
 server.listen(config.port,config.host,()=>{console.log(`Organa: http://${config.host}:${config.port}`);console.log(`AI provider: ${runtime.provider.name}${runtime.provider.model?` · ${runtime.provider.model}`:''}${runtime.provider.plannerModel&&runtime.provider.plannerModel!==runtime.provider.model?` · planner ${runtime.provider.plannerModel}`:''}`);console.log(`Persistence: ${runtime.storageMode}`);runtime.taskWorker.kick();});
 setInterval(()=>runtime.taskWorker.kick(),1500).unref();
})().catch(error=>{console.error('Failed to start Organa:',error);process.exitCode=1;});
