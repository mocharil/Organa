const crypto = require('node:crypto');
const {LlmProvider} = require('./llm-provider');

const lower = value => String(value || '').toLowerCase();
const titleCase = value => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function dryCompany(context = {}) {
  const input = context.companyInput || {};
  const brief = String(input.description || input.goal || input.prompt || 'AI-assisted small business');
  const coffee = /coffee|kopi|cafe|café/i.test(brief);
  const name = input.name || (coffee ? 'Nusa Coffee' : 'Northstar Studio');
  return {
    companyProfile: {name, description: brief.slice(0, 280), industry: coffee ? 'consumer-coffee' : 'technology-services', stage: input.stage || 'early-stage', audience: input.audience || (coffee ? 'urban professionals' : 'small business teams')},
    northStarDraft: {
      mission: coffee ? 'Make traceable Indonesian specialty coffee easy to enjoy at work.' : `Turn ${name}'s priorities into useful, reviewable outcomes with a small AI-assisted team.`,
      vision: coffee ? 'Build a trusted modern Indonesian coffee brand.' : `Build ${name} into a focused organization that compounds learning and execution quality.`,
      principles: ['Evidence before claims', 'Prefer useful outcomes over activity', 'Human remains final decision-maker'],
      hardConstraints: coffee ? ['Launch marketing spend must not exceed IDR 25,000,000'] : ['External publishing, spending and destructive actions require human approval'],
      softPreferences: ['Keep the team small', 'Prefer reversible decisions'],
    },
    initialGoals: [{title: coffee ? 'Prepare launch plan' : 'Validate the first operating plan', description: coffee ? 'Build an evidence-backed launch package within the approved budget.' : 'Turn the company goal into a measurable first execution cycle.', deadline: null, successCriteria: ['A reviewable cross-functional recommendation exists', 'Risks and assumptions are explicit'], suggestedKpis: coffee ? [{name: 'Qualified launch waitlist', target: 500, unit: 'people'}] : []}],
    recommendedTeam: [
      {tempId: 'role_cos', displayNameSuggestion: 'Ari', role: 'AI Chief of Staff', division: 'Leadership', reportsToTempId: null, purpose: 'Turn owner goals into bounded plans and coordinate specialist work.', responsibilities: ['planning', 'coordination', 'attention management'], skills: ['planning', 'coordination', 'decision_support'], requestedToolIds: ['company_context_read'], boundaries: ['Cannot change company policy or approve high-impact actions'], recommendedAutonomy: 'draft_and_recommend', whyNeeded: 'The company needs one coordination layer without creating an autonomous CEO.'},
      {tempId: 'role_research', displayNameSuggestion: 'Maya', role: 'Market Research Analyst', division: 'Strategy', reportsToTempId: 'role_cos', purpose: 'Find and synthesize evidence for decisions.', responsibilities: ['competitive research', 'market synthesis'], skills: ['market_research', 'competitive_analysis'], requestedToolIds: ['company_context_read'], boundaries: ['Must label assumptions and unsupported claims'], recommendedAutonomy: 'draft_and_recommend', whyNeeded: 'Research reduces guesswork in downstream strategy.'},
      {tempId: 'role_marketing', displayNameSuggestion: 'Rani', role: 'Growth Marketing Specialist', division: 'Marketing', reportsToTempId: 'role_cos', purpose: 'Turn evidence into channel, positioning and messaging recommendations.', responsibilities: ['campaign planning', 'messaging drafts'], skills: ['campaign_strategy', 'copywriting'], requestedToolIds: ['company_context_read'], boundaries: ['Cannot publish externally without approval'], recommendedAutonomy: 'draft_and_recommend', whyNeeded: 'Launch work needs an accountable growth perspective.'},
      {tempId: 'role_finance', displayNameSuggestion: 'Laras', role: 'Finance & Operations Analyst', division: 'Finance', reportsToTempId: 'role_cos', purpose: 'Check affordability, constraints and operating trade-offs.', responsibilities: ['budget checks', 'risk analysis'], skills: ['budgeting', 'financial_analysis'], requestedToolIds: ['company_context_read'], boundaries: ['Cannot move money or alter financial records'], recommendedAutonomy: 'draft_and_recommend', whyNeeded: 'A plan is not executable if it ignores budget constraints.'},
      {tempId: 'role_product', displayNameSuggestion: 'Wira', role: 'Product & Web Lead', division: 'Engineering', reportsToTempId: 'role_cos', purpose: 'Translate strategy into a concrete customer-facing launch experience.', responsibilities: ['product planning', 'web launch specification'], skills: ['product_strategy', 'frontend'], requestedToolIds: ['company_context_read'], boundaries: ['Cannot deploy to production without human approval'], recommendedAutonomy: 'draft_and_recommend', whyNeeded: 'The team needs a bridge from strategy to a tangible launch surface.'},
    ],
    initialTasks: [], approvalPolicyDraft: {externalAction: 'human_approval', spending: 'human_approval', policyChange: 'human_approval'}, assumptions: ['This is a planning workspace, not an autonomous legal entity.'], questions: [],
  };
}

function dryAgentDesign(context = {}) {
  const request = String(context.request || 'research specialist');
  const role = /finance|budget/i.test(request) ? 'Finance Analyst' : /research|competitor/i.test(request) ? 'Research Specialist' : /market|growth|content/i.test(request) ? 'Growth Marketing Specialist' : /engineer|developer|code/i.test(request) ? 'Software Engineer' : `${titleCase(request.split(/\bwho\b|\bthat\b|\bto\b/i)[0].trim() || 'Specialist')} Specialist`;
  const name = role.includes('Finance') ? 'Laras' : role.includes('Research') ? 'Maya' : role.includes('Marketing') ? 'Rani' : role.includes('Engineer') ? 'Wira' : 'Nadia';
  return {displayNameSuggestion: name, role, division: role.includes('Finance') ? 'Finance' : role.includes('Engineer') ? 'Engineering' : role.includes('Marketing') ? 'Marketing' : 'Strategy', managerAgentId: context.chiefOfStaffId || null, purpose: `Own ${role.toLowerCase()} work requested by the human owner.`, responsibilities: ['Produce bounded specialist outputs', 'Surface assumptions and risks'], skills: lower(role).split(/\s+/).filter(Boolean), requestedToolIds: ['company_context_read'], boundaries: ['No external high-impact action without approval', 'Do not fabricate evidence'], escalationRules: ['Escalate missing critical facts'], personalityDraft: 'Concise, analytical and collaborative.', systemPromptDraft: `You are the ${role} inside Organa. Complete only assigned work, separate facts from assumptions, respect hard constraints, and ask when a critical fact is missing.`, evaluationCriteria: ['factuality', 'goal alignment', 'constraint compliance'], sampleTasks: [`Create a ${role.toLowerCase()} recommendation for the current company goal.`], reasonForRole: `The hiring request explicitly needs ${role.toLowerCase()} capability.`, overlapWarning: null};
}

function pickAgents(agents, keywords, fallback = []) {
  const active = (agents || []).filter(a => a.status === 'active');
  const matches = active.filter(a => keywords.some(k => lower(`${a.role} ${a.division} ${(a.skills || []).map(s => typeof s === 'string' ? s : s.name).join(' ')}`).includes(k)));
  return [...new Set([...matches.map(a => a.id), ...fallback])].filter(Boolean);
}

function dryPlan(context = {}) {
  const agents = context.agents || [];
  const goal = String(context.goal || 'Prepare a launch plan');
  const research = pickAgents(agents, ['research', 'strategy', 'business development'])[0] || agents[1]?.id || agents[0]?.id;
  const marketing = pickAgents(agents, ['marketing', 'growth', 'social'])[0] || agents[2]?.id || agents[0]?.id;
  const finance = pickAgents(agents, ['finance', 'budget', 'operations'])[0] || agents[3]?.id || agents[0]?.id;
  const product = pickAgents(agents, ['product', 'engineer', 'web', 'design'])[0] || agents[4]?.id || agents[0]?.id;
  const tasks = [
    {tempId: 't1', title: 'Build evidence brief', description: `Research the evidence and decision context needed for: ${goal}`, requiredSkills: ['research'], preferredAgentIds: [research], requiredToolIds: [], dependsOn: [], collaborationSuggestedWith: [], outputContract: {type: 'research_brief', requiredSections: ['findings', 'evidence', 'risks']}, riskLevel: 'low', approvalPolicy: 'none', reason: 'Downstream work should start from a shared evidence base.'},
    {tempId: 't2', title: 'Draft market and communication strategy', description: 'Translate the evidence brief into positioning, channels, messages and measurable next steps.', requiredSkills: ['marketing'], preferredAgentIds: [marketing], requiredToolIds: [], dependsOn: ['t1'], collaborationSuggestedWith: [finance].filter(Boolean), outputContract: {type: 'strategy', requiredSections: ['positioning', 'channels', 'messages', 'metrics']}, riskLevel: 'medium', approvalPolicy: 'none', reason: 'Marketing needs the research result before proposing strategy.'},
    {tempId: 't3', title: 'Check budget and operating constraints', description: 'Evaluate the proposed direction against company budget, hard constraints and operating risk.', requiredSkills: ['finance'], preferredAgentIds: [finance], requiredToolIds: [], dependsOn: ['t1'], collaborationSuggestedWith: [marketing].filter(Boolean), outputContract: {type: 'constraint_review', requiredSections: ['budget', 'risks', 'recommendation']}, riskLevel: 'medium', approvalPolicy: 'none', reason: 'Finance independently checks affordability and constraints.'},
    {tempId: 't4', title: 'Define launch execution package', description: 'Turn the approved research and cross-functional recommendations into an execution-ready launch package.', requiredSkills: ['product'], preferredAgentIds: [product], requiredToolIds: [], dependsOn: ['t2', 't3'], collaborationSuggestedWith: [marketing, finance].filter(Boolean), outputContract: {type: 'launch_package', requiredSections: ['scope', 'customer_experience', 'execution_steps', 'acceptance_criteria']}, riskLevel: 'medium', approvalPolicy: 'review_output', reason: 'Execution should only start after strategy and constraints are reviewed.'},
  ].filter(t => t.preferredAgentIds[0]);
  return {objectiveSummary: goal, assumptions: ['No external action will be executed automatically.'], clarifyingQuestions: [], capabilityGaps: [], tasks, meetings: [{title: 'Cross-functional launch review', agenda: 'Reconcile market strategy with budget constraints and agree the recommendation for the owner.', participantAgentIds: [research, marketing, finance].filter(Boolean), dependsOn: ['t2', 't3'], outputContract: {type: 'decision_record'}, maxRounds: 2}], finalSynthesis: {required: true, dependsOn: tasks.slice(-1).map(t => t.tempId)}};
}

function drySpecialist(context = {}) {
  const task = context.task || {};
  const agent = context.agent || {};
  const brief = String(task.brief || task.description || '');
  if (brief.trim().length < 8) return {status: 'needs_input', questions: ['What outcome should this task produce, and what facts should I rely on?'], output: {title: task.title || 'Task', content: '', structuredData: null}, evidenceRefs: [], assumptions: [], uncertainties: ['Task brief is too sparse.'], goalAlignment: [], constraintChecks: [], requestedDelegations: [], proposedToolActions: [], decisionSummary: 'Waiting for a clearer task brief.'};
  const inputs = (context.inputDeliverables || []).map(d => `${d.title}: ${d.currentContent || d.content || ''}`).join('\n');
  const north = context.northStar || {};
  const constraintText = (north.constraints || []).map(c => c.text).join('; ');
  const content = [
    `${agent.role || 'Specialist'} output for “${task.title}”`,
    '',
    `Recommendation: ${brief}`,
    inputs ? `\nInputs considered:\n${inputs.slice(0, 1600)}` : '',
    constraintText ? `\nConstraint check: ${constraintText}` : '',
    '\nAssumptions: This dry-run output demonstrates the same workflow without a live model. Replace it with Gemini output by configuring Vertex AI or GEMINI_API_KEY.',
  ].join('\n').trim();
  return {status: 'completed', questions: [], output: {title: task.title || 'Deliverable', content, structuredData: {dryRun: true, role: agent.role}}, evidenceRefs: (context.inputDeliverables || []).map(d => `deliverable:${d.id}`), assumptions: ['Dry-run mode is active.'], uncertainties: [], goalAlignment: (task.goalIds || []).map(id => `goal:${id}`), constraintChecks: (north.constraints || []).map(c => `Checked: ${c.text}`), requestedDelegations: [], proposedToolActions: [], decisionSummary: `${agent.displayName || 'Agent'} produced a reviewable ${task.outputContract?.type || 'work'} draft.`};
}

function dryParticipant(context = {}) {
  const agent = context.agent || {};
  return {position: `${agent.role || 'Specialist'} perspective: prioritize a plan that is evidence-backed, feasible, and consistent with the company constraints.`, evidenceRefs: (context.inputs || []).map(d => `deliverable:${d.id}`), risks: ['Unverified assumptions can propagate into execution.'], recommendations: [`Use the ${agent.role || 'specialist'} criteria explicitly before the owner approves the final direction.`], questionsForOthers: ['Which trade-off is most material to the final recommendation?'], assumptions: ['This is a bounded planning meeting, not an external action.']};
}

function dryModerator(context = {}) {
  const names = (context.contributions || []).map(c => c.agentName).filter(Boolean);
  const constraints = (context.northStar?.constraints || []).map(c => c.text);
  return {summary: `The meeting combined ${names.join(', ') || 'the specialist'} perspectives into one owner-ready recommendation.`, agreements: ['Use evidence as the starting point', 'Respect hard constraints before execution'], disagreements: ['Channel ambition and budget conservatism require an explicit owner trade-off.'], recommendations: ['Proceed with the smallest testable launch plan, then expand only after evidence supports it.'], decisions: [{decision: 'Adopt a constrained, evidence-backed launch direction for human review.', evidenceRefs: (context.inputDeliverables || []).map(d => `deliverable:${d.id}`), northStarRefs: constraints.map((_, i) => `constraint:${i}`), summaryOfWhy: 'It reconciles growth intent with company constraints and preserves human control.', requiresHumanApproval: true}], unresolvedQuestions: ['Which option should the owner approve for external execution?'], actionItems: [], deliverable: {type: 'decision_record', title: 'Cross-functional decision record'}};
}

function dryStandup(context = {}) {
  const snapshot = context.snapshot || {};
  const completed = (snapshot.completed || []).slice(0, 5).map(item => ({summary: item.summary, ref: item.ref}));
  const blockers = (snapshot.blockers || []).slice(0, 5).map(item => ({summary: item.summary, ref: item.ref}));
  const attention = (snapshot.needsAttention || []).slice(0, 5).map(item => ({priority: item.priority || 'medium', summary: item.summary, ref: item.ref}));
  return {headline: attention.length ? `${attention.length} item${attention.length === 1 ? '' : 's'} need owner attention.` : completed.length ? `${completed.length} meaningful item${completed.length === 1 ? '' : 's'} completed in the current window.` : 'The team is ready for the next mission.', completed, decisions: (snapshot.decisions || []).slice(0, 5), needsAttention: attention, blockers, next: (snapshot.next || []).slice(0, 5), usageSummary: snapshot.usageSummary || 'Dry-run mode: no paid model usage recorded.'};
}

class DryRunProvider extends LlmProvider {
  constructor(config) { super({name: 'dry-run', model: null}); this.config = config; }
  async generate({metadata = {}, context = {}}) {
    const startedAt=Date.now();
    if (this.config.dryRunDelayMs) await new Promise(resolve => setTimeout(resolve, this.config.dryRunDelayMs));
    const action = metadata.action || 'specialist';
    const generators = {company_architect: dryCompany, agent_designer: dryAgentDesign, chief_of_staff: dryPlan, specialist: drySpecialist, meeting_participant: dryParticipant, meeting_moderator: dryModerator, standup: dryStandup};
    const data = (generators[action] || drySpecialist)(context);
    const text = JSON.stringify(data);
    return {text, data, toolCalls: [], usage: {inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0}, model: null, provider: 'dry-run', requestId: crypto.randomUUID(), latencyMs: Date.now()-startedAt, metadata};
  }
}

module.exports = {DryRunProvider};
