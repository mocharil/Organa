const crypto = require('node:crypto');
class EventService {
  constructor(stateManager) { this.stateManager = stateManager; }
  append(type, {actor = {type:'system', id:'organa'}, entity = null, goalIds = [], projectId = null, room = null, payload = {}} = {}) {
    const state = this.stateManager.get(), companyId = state.activeCompanyId;
    const event = {id: `evt_${crypto.randomUUID()}`, companyId, type, actor, entity, goalIds, projectId, room, payload, createdAt: new Date().toISOString()};
    state.events ||= []; state.events.push(event);
    if (state.events.length > 2000) state.events.splice(0, state.events.length - 2000);
    return event;
  }
  list({after, type, limit = 200} = {}) {
    const state=this.stateManager.get(), companyId=state.activeCompanyId;
    return (state.events || []).filter(e=>e.companyId===companyId && (!after || e.createdAt>after) && (!type || e.type===type)).slice(-Math.min(500,limit)).reverse();
  }
}
module.exports = {EventService};
