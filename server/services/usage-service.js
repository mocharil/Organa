const crypto = require('node:crypto');
class UsageService {
  constructor(stateManager) { this.stateManager = stateManager; }
  record(response, {agentId = null, projectId = null, taskId = null, meetingId = null, purpose = null} = {}) {
    if (!response) return null;
    const state=this.stateManager.get(); state.usage ||= [];
    const row={id:`use_${crypto.randomUUID()}`,companyId:state.activeCompanyId,agentId,projectId,taskId,meetingId,purpose,provider:response.provider,model:response.model,requestId:response.requestId,inputTokens:response.usage?.inputTokens||0,outputTokens:response.usage?.outputTokens||0,totalTokens:response.usage?.totalTokens||0,latencyMs:response.latencyMs||0,createdAt:new Date().toISOString()};
    state.usage.push(row); return row;
  }
  summary() {
    const state=this.stateManager.get(), rows=(state.usage||[]).filter(u=>u.companyId===state.activeCompanyId);
    const total=rows.reduce((a,u)=>a+(u.totalTokens||0),0), input=rows.reduce((a,u)=>a+(u.inputTokens||0),0), output=rows.reduce((a,u)=>a+(u.outputTokens||0),0);
    const byAgent={},byProject={};
    const add=(bucket,key,u)=>{bucket[key] ||= {requests:0,inputTokens:0,outputTokens:0,totalTokens:0,latencyMs:0};const row=bucket[key];row.requests++;row.inputTokens+=u.inputTokens||0;row.outputTokens+=u.outputTokens||0;row.totalTokens+=u.totalTokens||0;row.latencyMs+=u.latencyMs||0;};
    for(const u of rows){add(byAgent,u.agentId||'system',u);if(u.projectId)add(byProject,u.projectId,u);}
    for(const bucket of [byAgent,byProject])for(const value of Object.values(bucket))value.avgLatencyMs=value.requests?Math.round(value.latencyMs/value.requests):0;
    return {requests:rows.length,inputTokens:input,outputTokens:output,totalTokens:total,byAgent,byProject};
  }
}
module.exports = {UsageService};
