const scalar = type => ({type});
const stringArray = {type: 'array', items: scalar('string')};

const specialistResponseSchema = {
  type: 'object',
  properties: {
    status: {type: 'string', enum: ['completed', 'needs_input']},
    questions: stringArray,
    output: {
      type: 'object',
      properties: {
        title: scalar('string'), content: scalar('string'), structuredData: {type: ['object', 'string', 'null']},
      },
      required: ['title', 'content'],
    },
    evidenceRefs: stringArray, assumptions: stringArray, uncertainties: stringArray, goalAlignment: stringArray,
    constraintChecks: stringArray, requestedDelegations: {type: 'array', items: {type: 'object'}}, proposedToolActions: {type: 'array', items: {type: 'object'}},
    decisionSummary: scalar('string'),
  },
  required: ['status', 'questions', 'output', 'evidenceRefs', 'assumptions', 'uncertainties', 'goalAlignment', 'constraintChecks', 'decisionSummary'],
};

const companyProposalSchema = {
  type: 'object',
  properties: {
    companyProfile: {type: 'object', properties: {name: scalar('string'), description: scalar('string'), industry: scalar('string'), stage: scalar('string'), audience: scalar('string')}, required: ['name', 'description', 'industry', 'stage', 'audience']},
    northStarDraft: {type: 'object', properties: {mission: scalar('string'), vision: scalar('string'), principles: stringArray, hardConstraints: stringArray, softPreferences: stringArray}, required: ['mission', 'vision', 'principles', 'hardConstraints', 'softPreferences']},
    initialGoals: {type: 'array', items: {type: 'object', properties: {title: scalar('string'), description: scalar('string'), deadline: {type: ['string', 'null']}, successCriteria: stringArray, suggestedKpis: {type: 'array', items: {type: 'object', properties: {name: scalar('string'), target: {type: ['number', 'string', 'null']}, unit: scalar('string'), deadline: {type: ['string', 'null']}}, required: ['name']}}}, required: ['title', 'description', 'successCriteria', 'suggestedKpis']}},
    recommendedTeam: {type: 'array', items: {type: 'object', properties: {tempId: scalar('string'), displayNameSuggestion: scalar('string'), role: scalar('string'), division: scalar('string'), reportsToTempId: {type: ['string', 'null']}, purpose: scalar('string'), responsibilities: stringArray, skills: stringArray, requestedToolIds: stringArray, boundaries: stringArray, recommendedAutonomy: scalar('string'), whyNeeded: scalar('string')}, required: ['tempId', 'displayNameSuggestion', 'role', 'division', 'purpose', 'responsibilities', 'skills', 'requestedToolIds', 'boundaries', 'recommendedAutonomy', 'whyNeeded']}},
    initialTasks: {type: 'array', items: {type: 'object'}}, approvalPolicyDraft: {type: 'object'}, assumptions: stringArray, questions: stringArray,
  },
  required: ['companyProfile', 'northStarDraft', 'initialGoals', 'recommendedTeam', 'initialTasks', 'approvalPolicyDraft', 'assumptions', 'questions'],
};

const agentDesignSchema = {
  type: 'object',
  properties: {
    displayNameSuggestion: scalar('string'), role: scalar('string'), division: scalar('string'), managerAgentId: {type: ['string', 'null']}, purpose: scalar('string'),
    responsibilities: stringArray, skills: stringArray, requestedToolIds: stringArray, boundaries: stringArray, escalationRules: stringArray,
    personalityDraft: scalar('string'), systemPromptDraft: scalar('string'), evaluationCriteria: stringArray, sampleTasks: stringArray,
    reasonForRole: scalar('string'), overlapWarning: {type: ['string', 'null']},
  },
  required: ['displayNameSuggestion', 'role', 'division', 'purpose', 'responsibilities', 'skills', 'requestedToolIds', 'boundaries', 'escalationRules', 'personalityDraft', 'systemPromptDraft', 'evaluationCriteria', 'sampleTasks', 'reasonForRole'],
};

const planSchema = {
  type: 'object',
  properties: {
    objectiveSummary: scalar('string'), assumptions: stringArray, clarifyingQuestions: stringArray, capabilityGaps: stringArray,
    tasks: {type: 'array', items: {type: 'object', properties: {
      tempId: scalar('string'), title: scalar('string'), description: scalar('string'), requiredSkills: stringArray, preferredAgentIds: stringArray,
      requiredToolIds: stringArray, dependsOn: stringArray, collaborationSuggestedWith: stringArray, outputContract: {type: 'object'},
      riskLevel: {type: 'string', enum: ['low', 'medium', 'high']}, approvalPolicy: {type: 'string'}, reason: scalar('string'),
    }, required: ['tempId', 'title', 'description', 'requiredSkills', 'preferredAgentIds', 'requiredToolIds', 'dependsOn', 'collaborationSuggestedWith', 'outputContract', 'riskLevel', 'approvalPolicy', 'reason']}},
    meetings: {type: 'array', items: {type: 'object', properties: {
      title: scalar('string'), agenda: scalar('string'), participantAgentIds: stringArray, dependsOn: stringArray, maxRounds: scalar('integer'), outputContract: {type: 'object'},
    }, required: ['title', 'agenda', 'participantAgentIds', 'dependsOn']}},
    finalSynthesis: {type: 'object', properties: {required: scalar('boolean'), dependsOn: stringArray}, required: ['required', 'dependsOn']},
  },
  required: ['objectiveSummary', 'assumptions', 'clarifyingQuestions', 'capabilityGaps', 'tasks', 'meetings', 'finalSynthesis'],
};

const participantSchema = {
  type: 'object', properties: {position: scalar('string'), evidenceRefs: stringArray, risks: stringArray, recommendations: stringArray, questionsForOthers: stringArray, assumptions: stringArray},
  required: ['position', 'evidenceRefs', 'risks', 'recommendations', 'questionsForOthers', 'assumptions'],
};
const moderatorSchema = {
  type: 'object', properties: {summary: scalar('string'), agreements: stringArray, disagreements: stringArray, recommendations: stringArray,
    decisions: {type: 'array', items: {type: 'object', properties: {decision: scalar('string'), evidenceRefs: stringArray, northStarRefs: stringArray, summaryOfWhy: scalar('string'), requiresHumanApproval: scalar('boolean')}, required: ['decision', 'evidenceRefs', 'northStarRefs', 'summaryOfWhy', 'requiresHumanApproval']}},
    unresolvedQuestions: stringArray, actionItems: {type: 'array', items: {type: 'object'}}, deliverable: {type: 'object'}},
  required: ['summary', 'agreements', 'disagreements', 'recommendations', 'decisions', 'unresolvedQuestions', 'actionItems', 'deliverable'],
};
const standupItemSchema = {type: 'object', properties: {summary: scalar('string'), ref: scalar('string')}, required: ['summary', 'ref']};
const standupAttentionItemSchema = {type: 'object', properties: {priority: {type: 'string', enum: ['low', 'medium', 'high']}, summary: scalar('string'), ref: scalar('string')}, required: ['priority', 'summary', 'ref']};
const standupSchema = {
  type: 'object', properties: {
    headline: scalar('string'),
    completed: {type: 'array', items: standupItemSchema},
    decisions: {type: 'array', items: standupItemSchema},
    needsAttention: {type: 'array', items: standupAttentionItemSchema},
    blockers: {type: 'array', items: standupItemSchema},
    next: {type: 'array', items: standupItemSchema},
    usageSummary: scalar('string'),
  },
  required: ['headline', 'completed', 'decisions', 'needsAttention', 'blockers', 'next', 'usageSummary'],
};

const emailDraftSchema = {
  type: 'object',
  properties: {subject: scalar('string'), body: scalar('string'), concerns: stringArray, constraintChecks: stringArray, assumptions: stringArray},
  required: ['subject', 'body', 'concerns', 'constraintChecks', 'assumptions'],
};

module.exports = {emailDraftSchema, specialistResponseSchema, companyProposalSchema, agentDesignSchema, planSchema, participantSchema, moderatorSchema, standupSchema};
