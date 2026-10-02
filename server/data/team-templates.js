// Curated starter templates. Installing a template creates the same editable proposal
// used by the Company Architect. No template grants additional permissions by itself.
const role = (tempId, displayNameSuggestion, roleName, division, purpose, skills, reportsToTempId='role_cos') => ({
  tempId, displayNameSuggestion, role: roleName, division, reportsToTempId,
  purpose,
  responsibilities: [purpose],
  skills,
  requestedToolIds: ['company_context_read'],
  boundaries: ['No external publishing, spending, destructive changes, or policy changes without human approval'],
  recommendedAutonomy: 'draft_and_recommend',
  whyNeeded: purpose,
});
const chief = role('role_cos','Ari','AI Chief of Staff','Leadership','Turn owner goals into bounded plans and coordinate specialist work.',['planning','coordination','decision_support'],null);

const templates = [
  {
    id:'tpl_startup_launch', name:'Startup Launch Team', category:'startup', version:1,
    description:'Compact team for market research, positioning, budget checks and launch preparation.',
    companyProfile:{industry:'startup',stage:'early-stage',audience:'target customers'},
    northStarDraft:{mission:'Launch a focused offer with evidence, constraint discipline and human approval.',vision:'Build a repeatable path from idea to validated launch.',principles:['Evidence before claims','Prefer reversible experiments','Human remains final decision-maker'],hardConstraints:['External publishing and spending require human approval'],softPreferences:['Keep the team small']},
    initialGoals:[{title:'Prepare launch plan',description:'Produce an evidence-backed, owner-ready launch plan.',deadline:null,successCriteria:['Research, strategy and constraints are reconciled'],suggestedKpis:[]}],
    recommendedTeam:[chief,role('role_research','Maya','Market Research Analyst','Strategy','Build the evidence base for launch decisions.',['market_research','competitive_analysis']),role('role_marketing','Rani','Growth Marketing Specialist','Marketing','Turn evidence into positioning, channels and campaign recommendations.',['campaign_strategy','copywriting']),role('role_finance','Laras','Finance & Operations Analyst','Finance','Check affordability, operating constraints and trade-offs.',['budgeting','financial_analysis']),role('role_product','Wira','Product & Web Lead','Engineering','Translate strategy into an execution-ready customer experience.',['product_strategy','frontend'])],
  },
  {
    id:'tpl_content_social', name:'Content & Social Team', category:'marketing', version:1,
    description:'Small team for research-backed content strategy, production and channel planning.',
    companyProfile:{industry:'content',stage:'operating',audience:'online audience'},
    northStarDraft:{mission:'Publish useful, evidence-aware content consistently.',vision:'Create a trusted content engine that compounds audience learning.',principles:['Audience value first','Evidence before claims','Consistency over volume'],hardConstraints:['External publishing requires human approval'],softPreferences:['Reuse strong ideas across channels']},
    initialGoals:[{title:'Build a 30-day content system',description:'Create a reviewable content strategy and calendar.',deadline:null,successCriteria:['Audience themes, calendar and measurement plan are ready'],suggestedKpis:[]}],
    recommendedTeam:[chief,role('role_research','Maya','Audience Research Analyst','Strategy','Research audience questions, competitors and content opportunities.',['audience_research','competitive_analysis']),role('role_content','Rani','Content Strategist','Marketing','Create editorial strategy, briefs and reusable narratives.',['content_strategy','copywriting']),role('role_social','Sinta','Social Media Specialist','Marketing','Adapt approved narratives into platform-specific drafts and calendars.',['social_media','content_planning'])],
  },
  {
    id:'tpl_support', name:'Customer Support Team', category:'support', version:1,
    description:'Support operations team for knowledge, response quality and escalation analysis.',
    companyProfile:{industry:'services',stage:'operating',audience:'customers'},
    northStarDraft:{mission:'Resolve customer questions accurately and consistently while surfacing recurring problems.',vision:'Turn every support interaction into faster resolution and better product knowledge.',principles:['Do not invent policy','Escalate uncertainty','Protect customer trust'],hardConstraints:['Never promise refunds, legal outcomes, or account changes without authorized human/tool confirmation'],softPreferences:['Prefer concise empathetic responses']},
    initialGoals:[{title:'Improve support readiness',description:'Build a support knowledge and escalation playbook.',deadline:null,successCriteria:['Top questions, draft answers and escalation rules are documented'],suggestedKpis:[]}],
    recommendedTeam:[chief,role('role_support','Sinta','Customer Support Specialist','Customer Support','Draft accurate customer responses and identify escalations.',['customer_support','communication']),role('role_knowledge','Maya','Knowledge Analyst','Strategy','Organize source material into reusable support knowledge.',['knowledge_management','research']),role('role_ops','Laras','Support Operations Analyst','Operations','Analyze recurring issues and recommend workflow improvements.',['operations','analysis'])],
  },
  {
    id:'tpl_research', name:'Research & Analysis Team', category:'research', version:1,
    description:'Evidence-first team for market, competitor and decision analysis.',
    companyProfile:{industry:'research',stage:'project',audience:'decision makers'},
    northStarDraft:{mission:'Turn ambiguous questions into transparent, decision-useful evidence.',vision:'Make important decisions traceable to sources, assumptions and trade-offs.',principles:['Evidence before confidence','Separate fact from inference','Preserve uncertainty'],hardConstraints:['Do not present unsupported claims as facts'],softPreferences:['Prefer primary sources when available']},
    initialGoals:[{title:'Produce decision brief',description:'Create an evidence-backed recommendation with assumptions and risks.',deadline:null,successCriteria:['Evidence, alternatives and recommendation are explicit'],suggestedKpis:[]}],
    recommendedTeam:[chief,role('role_research','Maya','Lead Research Analyst','Strategy','Own evidence gathering and synthesis.',['research','synthesis']),role('role_quant','Laras','Quantitative Analyst','Analytics','Check numerical assumptions, scenarios and trade-offs.',['quantitative_analysis','financial_analysis']),role('role_writer','Rani','Insight Writer','Strategy','Turn findings into a clear executive decision brief.',['business_writing','storytelling'])],
  },
  {
    id:'tpl_ecommerce', name:'Small E-commerce Team', category:'commerce', version:1,
    description:'Lean team for product research, storefront execution, growth and customer support.',
    companyProfile:{industry:'e-commerce',stage:'operating',audience:'online shoppers'},
    northStarDraft:{mission:'Grow online sales through useful products, trustworthy communication and disciplined execution.',vision:'Build an efficient customer-centric commerce operation.',principles:['Customer trust first','Measure before scaling','Do not overclaim'],hardConstraints:['Spending, refunds, price changes and external publishing require human approval'],softPreferences:['Prefer small tests before large campaigns']},
    initialGoals:[{title:'Improve next sales cycle',description:'Prepare a cross-functional sales and merchandising plan.',deadline:null,successCriteria:['Product, growth, operations and support inputs are reconciled'],suggestedKpis:[]}],
    recommendedTeam:[chief,role('role_research','Maya','Product Research Analyst','Strategy','Research demand, competitors and product opportunities.',['product_research','competitive_analysis']),role('role_growth','Rani','E-commerce Growth Specialist','Marketing','Plan acquisition, merchandising and campaign experiments.',['growth_marketing','ecommerce']),role('role_ops','Laras','Commerce Operations Analyst','Operations','Check margin, inventory and operating constraints.',['operations','budgeting']),role('role_web','Wira','Storefront & Web Specialist','Engineering','Turn approved plans into storefront and web implementation specs.',['frontend','conversion_optimization']),role('role_support','Sinta','Customer Support Specialist','Customer Support','Prepare customer FAQs and support playbooks.',['customer_support','knowledge_management'])],
  },
];

module.exports = {templates};
