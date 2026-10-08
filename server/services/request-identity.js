const {createHash} = require('node:crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

// Persist identity on the resulting entity so a lost response can be retried after restart.
async function reuseRequest({stateManager, collection, pending, input, payload, create}) {
  const requestId = input?.clientRequestId;
  if (requestId === undefined || requestId === '') return create({});
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 160) throw Object.assign(new Error('Invalid request identity.'), {status: 400});
  const companyId = stateManager.get().activeCompanyId;
  const signature = createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
  const key = `${companyId}:${requestId}`;
  const existing = (stateManager.get()[collection] || []).find(entity => entity.companyId === companyId && entity.clientRequestId === requestId);
  if (existing) {
    if (existing.requestSignature !== signature) throw Object.assign(new Error('This request identity belongs to different work.'), {status: 409});
    await stateManager.persist();
    return existing;
  }
  const running = pending.get(key);
  if (running) {
    if (running.signature !== signature) throw Object.assign(new Error('This request identity belongs to different work.'), {status: 409});
    return running.promise;
  }
  const promise = create({clientRequestId: requestId, requestSignature: signature});
  pending.set(key, {signature, promise});
  try { return await promise; } finally { pending.delete(key); }
}

module.exports = {reuseRequest};
