const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
try { process.loadEnvFile(process.env.ENV_FILE || path.join(ROOT, '.env')); } catch { /* optional local .env */ }

const bool = (value, fallback = false) => value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

const env = (preferred, legacy, fallback = undefined) => process.env[preferred] ?? process.env[legacy] ?? fallback;

function parseJson(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function loadGoogleServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = parseJson(raw);
    if (!parsed) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    return {credentials: parsed, source: 'inline-json'};
  }

  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (encoded) {
    const parsed = parseJson(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!parsed) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 does not decode to valid JSON.');
    return {credentials: parsed, source: 'base64-json'};
  }

  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.resolve(keyFile), 'utf8'));
      return {credentials: parsed, keyFile: path.resolve(keyFile), source: 'key-file'};
    } catch {
      // GoogleAuth can still resolve the path itself at request time. Keep the path but do not fail startup.
      return {credentials: null, keyFile: path.resolve(keyFile), source: 'key-file'};
    }
  }

  return {credentials: null, keyFile: null, source: 'adc'};
}

const googleServiceAccount = loadGoogleServiceAccount();
const inferredGoogleProject = googleServiceAccount.credentials?.project_id || '';

module.exports = {
  ROOT,
  publicDir: path.join(ROOT, 'public'),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')),
  stateFileName: env('ORGANA_STATE_FILE','KANTOR_STATE_FILE','state.json'),
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT) || 3000,
  storage: env('ORGANA_STORAGE','KANTOR_STORAGE','json'),
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
  defaultCompanyId: env('ORGANA_COMPANY_ID','KANTOR_COMPANY_ID','cmp_default'),

  // Provider selection. "auto" prefers Vertex AI, then Gemini API, OpenAI, Anthropic, then dry-run.
  llmProvider: String(env('ORGANA_LLM_PROVIDER','KANTOR_LLM_PROVIDER','auto')).toLowerCase(),
  llmModel: env('ORGANA_LLM_MODEL','KANTOR_LLM_MODEL',''),
  llmPlannerModel: env('ORGANA_PLANNER_MODEL','KANTOR_PLANNER_MODEL',''),

  // Gemini Developer API.
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiPlannerModel: process.env.GEMINI_PLANNER_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  // Vertex AI / Gemini. Service-account JSON can be supplied by path, inline JSON, or base64 JSON.
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || inferredGoogleProject,
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_REGION || 'asia-southeast1',
  googleServiceAccountCredentials: googleServiceAccount.credentials,
  googleServiceAccountKeyFile: googleServiceAccount.keyFile,
  googleServiceAccountSource: googleServiceAccount.source,
  vertexModel: process.env.VERTEX_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  vertexPlannerModel: process.env.VERTEX_PLANNER_MODEL || process.env.GEMINI_PLANNER_MODEL || process.env.VERTEX_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  // OpenAI Responses API.
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  openaiPlannerModel: process.env.OPENAI_PLANNER_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-luna',

  // Anthropic Messages API. Kept as an optional provider for users migrating from the original build.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1').replace(/\/$/, ''),
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  anthropicPlannerModel: process.env.ANTHROPIC_PLANNER_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',

  dryRun: bool(env('ORGANA_DRY_RUN','KANTOR_DRY_RUN'), false),
  dryRunDelayMs: Number(process.env.DRY_RUN_DELAY_MS ?? 350),
  maxPlanTasks: Math.max(2, Math.min(8, Number(env('ORGANA_MAX_PLAN_TASKS','KANTOR_MAX_PLAN_TASKS',6)))),
  enableDemoReset: bool(env('ORGANA_ENABLE_DEMO_RESET','KANTOR_ENABLE_DEMO_RESET'), true),
};
