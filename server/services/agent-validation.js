const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const isChief = agent => /chief of staff/i.test(agent?.role || '');
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
function text(value, label, max, required = false) {
  if (typeof value !== 'string') throw fail(`${label} must be text.`);
  const result = value.trim();
  if (required && !result) throw fail(`${label} is required.`);
  if (result.length > max) throw fail(`${label} must be ${max} characters or fewer.`);
  return result;
}
function stringList(value, label) {
  if (!Array.isArray(value) || value.length > 30) throw fail(`${label} must contain at most 30 text items.`);
  return [...new Set(value.map(item => text(item, label, 1000, true)))];
}
function validateProfile(agent, input, coworkers) {
  if (!isObject(input)) throw fail('Employee settings must be an object.');
  const patch = {...input};
  for (const [key, max] of Object.entries({displayName: 120, role: 120, division: 120, purpose: 4000, systemPrompt: 16000, personality: 4000})) {
    if (patch[key] !== undefined) patch[key] = text(patch[key], key, max, ['displayName', 'role', 'division'].includes(key));
  }
  const others = coworkers.filter(item => item.id !== agent.id && item.status !== 'archived');
  const name = patch.displayName ?? agent.displayName;
  if (agent.status !== 'archived' && others.some(item => item.displayName.trim().toLowerCase() === name.toLowerCase())) throw fail('Coworker names must be unique in this organization.');
  const nextRole = patch.role ?? agent.role;
  if (isChief({role: nextRole}) && others.some(isChief)) throw fail('This organization already has a Chief of Staff.');
  if (isChief(agent) && agent.status === 'active' && !isChief({role: nextRole})) throw fail('Keep the Chief of Staff role so missions and meetings retain their coordinator.');
  for (const key of ['responsibilities', 'boundaries', 'evaluationCriteria']) if (patch[key] !== undefined) patch[key] = stringList(patch[key], key);
  if (patch.skills !== undefined) {
    if (!Array.isArray(patch.skills) || patch.skills.length > 30) throw fail('Skills must contain at most 30 items.');
    patch.skills = patch.skills.map(skill => typeof skill === 'string' ? {name: text(skill, 'Skill', 120, true), level: 'advanced'} : {name: text(skill?.name, 'Skill name', 120, true), level: text(skill?.level || 'advanced', 'Skill level', 40, true)});
  }
  if (patch.managerAgentId !== undefined && patch.managerAgentId !== null && typeof patch.managerAgentId !== 'string') throw fail('Pick a manager from this organization.');
  if (patch.modelPolicy !== undefined) {
    if (!isObject(patch.modelPolicy)) throw fail('Model policy must be an object.');
    const policy = {...agent.modelPolicy, ...patch.modelPolicy};
    const tokens = Number(policy.maxOutputTokens ?? 3000);
    if (!Number.isFinite(tokens) || tokens < 256 || tokens > 16000) throw fail('Output token limit must be between 256 and 16000.');
    const provider = text(policy.provider || 'inherit', 'AI provider', 40, true);
    if (!['inherit', 'auto', 'vertex', 'gemini', 'openai', 'anthropic', 'dry-run'].includes(provider)) throw fail('Choose a supported AI provider.');
    patch.modelPolicy = {provider, defaultModel: policy.defaultModel == null ? null : text(policy.defaultModel, 'Model', 160) || null, maxOutputTokens: Math.round(tokens), reasoningTier: text(policy.reasoningTier || 'balanced', 'Reasoning tier', 40, true)};
  }
  return patch;
}
module.exports = {fail, isChief, isObject, text, stringList, validateProfile};
