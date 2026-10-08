const {id,now,activeNorthStar}=require('./helpers');
const {reuseRequest}=require('./request-identity');
class NorthStarService{
 constructor({stateManager,eventService}){Object.assign(this,{stateManager,eventService});this.requests=new Map();}
 get(){return activeNorthStar(this.stateManager.get());}
 versions(){const s=this.stateManager.get();return(s.northStars||[]).filter(n=>n.companyId===s.activeCompanyId).sort((a,b)=>(b.version||0)-(a.version||0));}
 async create(input={}){const {clientRequestId,...payload}=input;if(input.constraints!==undefined&&!Array.isArray(input.constraints))throw Object.assign(new Error('Constraints must be a list.'),{status:400});payload.constraints=(payload.constraints||[]).map(constraint=>{if(!constraint||typeof constraint!=='object')throw Object.assign(new Error('Each constraint must be an object.'),{status:400});const {id,...value}=constraint;return value;});return reuseRequest({stateManager:this.stateManager,collection:'northStars',pending:this.requests,input,payload,create:metadata=>this.createVersion(input,metadata)});}
 async createVersion(input={},metadata={}){const s=this.stateManager.get(),current=this.get(),version=(this.versions()[0]?.version||0)+1;const ns={...metadata,id:id('ns'),companyId:s.activeCompanyId,version,status:'draft',mission:String(input.mission??current?.mission??'').slice(0,1000),vision:String(input.vision??current?.vision??'').slice(0,1000),principles:Array.isArray(input.principles)?input.principles.slice(0,20):current?.principles||[],constraints:Array.isArray(input.constraints)?input.constraints.slice(0,30):current?.constraints||[],activeGoalIds:Array.isArray(input.activeGoalIds)?input.activeGoalIds:current?.activeGoalIds||[],kpis:Array.isArray(input.kpis)?input.kpis:current?.kpis||[],changedBy:'local-user',changeNote:String(input.changeNote||'North Star update').slice(0,500),createdAt:now()};s.northStars.push(ns);const event=this.eventService.append('northstar.version_created',{actor:{type:'user',id:'local-user'},entity:{type:'northStar',id:ns.id},payload:{version}});try{await this.stateManager.persist();}catch(error){s.northStars=s.northStars.filter(n=>n.id!==ns.id);s.events=s.events.filter(e=>e.id!==event.id);throw error;}return ns;}
 async activate(version){
  const state=this.stateManager.get(),target=this.versions().find(item=>item.version===Number(version));if(!target)throw Object.assign(new Error('North Star version not found.'),{status:404});if(target.status==='active'){await this.stateManager.persist();return target;}
  const snapshots=state.northStars.filter(item=>item.companyId===state.activeCompanyId).map(record=>({record,before:structuredClone(record)}));
  for(const {record} of snapshots)if(record.status==='active')record.status='superseded';target.status='active';target.activatedAt=now();const event=this.eventService.append('northstar.activated',{actor:{type:'user',id:'local-user'},entity:{type:'northStar',id:target.id},goalIds:target.activeGoalIds,payload:{version:target.version}});
  try{await this.stateManager.persist();return target;}catch(error){for(const {record,before} of snapshots){for(const key of Object.keys(record))delete record[key];Object.assign(record,before);}state.events=state.events.filter(item=>item.id!==event.id);throw error;}
 }

}
module.exports={NorthStarService};
