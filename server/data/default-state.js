const crypto = require('node:crypto');

const now = () => new Date().toISOString();
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36) || crypto.randomUUID().slice(0, 8);
const initials = name => String(name || 'AI').split(/\s+/).filter(Boolean).slice(0, 3).map(v => v[0]).join('').toUpperCase();

const DEFAULT_TEAM = [
  ['agt_arman', 'Koh Arman', 'AI Chief of Staff', 'Leadership', 'leadership', 'male', ['planning', 'coordination', 'decision_support']],
  ['agt_wira', 'Koh Wira', 'Technology Lead', 'Engineering', 'engineering', 'male', ['architecture', 'engineering', 'delivery']],
  ['agt_rani', 'Kak Rani', 'Social Media Specialist', 'Marketing', 'marketing', 'female', ['copywriting', 'social_media', 'campaign_execution']],
  ['agt_dewi', 'Kak Dewi', 'Growth Marketing Strategist', 'Marketing', 'marketing', 'female', ['growth_strategy', 'campaign_planning', 'analytics']],
  ['agt_mira', 'Mira', 'Business Development Specialist', 'Business', 'marketing', 'female', ['partnerships', 'market_analysis', 'business_models']],
  ['agt_tari', 'Tari', 'Market Research Analyst', 'Strategy', 'marketing', 'female', ['market_research', 'competitive_analysis', 'synthesis']],
  ['agt_bagas', 'Bagas Pratama Putra', 'Frontend Engineer', 'Engineering', 'engineering', 'male', ['frontend', 'javascript', 'ux_implementation']],
  ['agt_rizky', 'Rizky Hakim', 'Backend Engineer', 'Engineering', 'engineering', 'male', ['backend', 'apis', 'data_modeling']],
  ['agt_yoga', 'Yoga', 'Product Designer', 'Product', 'engineering', 'male', ['product_design', 'ux', 'prototyping']],
  ['agt_eko', 'Bang Eko', 'Brand & Visual Designer', 'Creative', 'engineering', 'male', ['visual_design', 'creative_direction', 'brand_systems']],
  ['agt_gilang', 'Gilang', 'Customer Operations Lead', 'Operations', 'service', 'male', ['support_operations', 'quality', 'process_design']],
  ['agt_sinta', 'Kak Sinta', 'Customer Support Specialist', 'Operations', 'service', 'female', ['customer_support', 'service_writing', 'triage']],
  ['agt_laras', 'Kak Laras', 'Finance & Operations Analyst', 'Finance', 'service', 'female', ['budgeting', 'financial_analysis', 'operating_metrics']],
];

function rolePrompt(role, purpose) {
  return [
    `You are the ${role} inside Organa.`,
    purpose,
    'Complete only work that belongs to your role. Be concrete and concise.',
    'Separate confirmed facts, assumptions, and uncertainty. Never invent company facts or claim an external action happened without evidence.',
    'Respect the Company North Star and hard constraints. Escalate missing critical information instead of guessing.',
  ].join('\n');
}

function makeAgent([id, displayName, role, division, group, gender, skillNames], companyId = 'cmp_default') {
  const purpose = `Own ${role.toLowerCase()} work and contribute that specialist perspective to cross-functional company goals.`;
  const createdAt = now();
  return {
    id, companyId, displayName, role, division, managerAgentId: id === 'agt_arman' ? null : 'agt_arman', purpose,
    responsibilities: [`Deliver ${role.toLowerCase()} outputs`, 'Surface risks and assumptions', 'Collaborate when another discipline materially improves the result'],
    skills: skillNames.map(name => ({name, level: 'advanced'})), toolPolicyIds: ['company_context_read'],
    modelPolicy: {provider: 'inherit', defaultModel: null, reasoningTier: 'balanced', maxOutputTokens: 3000},
    systemPrompt: rolePrompt(role, purpose), personality: 'Professional, concise, evidence-aware and collaborative.',
    boundaries: ['No autonomous external publishing, spending, deleting, or policy changes', 'Ask for human input when a critical fact is missing'],
    evaluationCriteria: ['factuality', 'goal alignment', 'constraint compliance', 'usefulness'],
    status: 'active', concurrencyLimit: 1, promptVersion: 1,
    avatar: {initials: initials(displayName), gender, group},
    createdAt, updatedAt: createdAt,
  };
}

function defaultNorthStar(companyId = 'cmp_default') {
  return {
    id: 'ns_default_v1', companyId, version: 1, status: 'active',
    mission: 'Help a small team turn high-level business goals into coordinated, reviewable work with AI coworkers.',
    vision: 'Make AI teamwork observable, controllable and useful for everyday company execution.',
    principles: ['Human remains final decision-maker', 'Evidence before claims', 'Smallest useful plan', 'Ask instead of guessing'],
    constraints: [
      {id: 'con_human_approval', type: 'governance', text: 'External publishing, spending, destructive actions and policy changes require human approval.', severity: 'hard'},
    ],
    activeGoalIds: [], kpis: [], changedBy: 'system', changeNote: 'Default workspace', createdAt: now(),
  };
}

function createDefaultState() {
  const createdAt = now();
  const company = {
    id: 'cmp_default', name: 'Organa Demo', description: 'AI-native virtual office for coordinated business execution.',
    industry: 'software', stage: 'prototype', audience: 'small teams and founders', timezone: 'Asia/Jakarta', status: 'active',
    createdBy: 'local-user', createdAt, updatedAt: createdAt,
  };
  return {
    schemaVersion: 2,
    settings: {},
    activeCompanyId: company.id,
    companies: [company],
    northStars: [defaultNorthStar(company.id)],
    goals: [],
    agents: DEFAULT_TEAM.map(row => makeAgent(row, company.id)),
    projects: [], tasks: [], meetings: [], deliverables: [], approvals: [], events: [], standups: [], usage: [], bootstrapProposals: [],
    metadata: {createdAt, updatedAt: createdAt},
  };
}

function nusaDemoState() {
  const state = createDefaultState();
  const companyId = 'cmp_nusa_coffee';
  const createdAt = now();
  state.activeCompanyId = companyId;
  state.companies = [{
    id: companyId, name: 'Nusa Coffee', description: 'Sustainable Indonesian specialty coffee brand for urban professionals.',
    industry: 'consumer-coffee', stage: 'pre-launch', audience: 'urban professionals', timezone: 'Asia/Jakarta', status: 'active', createdBy: 'demo-user', createdAt, updatedAt: createdAt,
  }];
  state.northStars = [{
    id: 'ns_nusa_v1', companyId, version: 1, status: 'active',
    mission: 'Make traceable Indonesian specialty coffee easy to enjoy at work.',
    vision: 'Build a trusted modern Indonesian coffee brand.',
    principles: ['Evidence before claims', 'Prefer profitable growth over vanity metrics', 'Do not make unsupported sustainability claims'],
    constraints: [{id: 'con_budget', type: 'budget', text: 'Launch marketing spend must not exceed IDR 25,000,000', severity: 'hard'}],
    activeGoalIds: [],
    kpis: [{id: 'kpi_waitlist', name: 'Qualified launch waitlist', target: 500, unit: 'people', deadline: '2026-10-31'}],
    changedBy: 'demo-user', changeNote: 'Hackathon demo North Star', createdAt,
  }];
  const demoRows = [
    ['agt_cos', 'Ari', 'AI Chief of Staff', 'Leadership', 'leadership', 'male', ['planning', 'coordination', 'decision_support']],
    ['agt_research', 'Maya', 'Market Research Analyst', 'Strategy', 'marketing', 'female', ['market_research', 'competitive_analysis', 'synthesis']],
    ['agt_marketing', 'Rani', 'Growth Marketing Specialist', 'Marketing', 'marketing', 'female', ['campaign_strategy', 'copywriting', 'channel_analysis']],
    ['agt_finance', 'Laras', 'Finance & Operations Analyst', 'Finance', 'service', 'female', ['budgeting', 'unit_economics', 'risk_analysis']],
    ['agt_product', 'Wira', 'Product & Web Lead', 'Engineering', 'engineering', 'male', ['product_strategy', 'frontend', 'launch_execution']],
  ];
  state.agents = demoRows.map(row => makeAgent(row, companyId)).map(a => ({...a, managerAgentId: a.id === 'agt_cos' ? null : 'agt_cos'}));
  state.metadata.updatedAt = now();
  return state;
}

module.exports = {createDefaultState, nusaDemoState, makeAgent, defaultNorthStar, initials, slug};
