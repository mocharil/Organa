# Testing Gemini on your local computer

The v3.18.5 package includes an HTTP runner for 17 flows with Gemini/Vertex. The tests shipped in this package use the demo provider; Google authentication and live model output quality were not tested in the package itself.

## Setup

Use Node.js 22 or later and run `npm ci`. Keep configuration in a local `.env`. For a service account, set:

```dotenv
ORGANA_LLM_PROVIDER=vertex
ORGANA_DRY_RUN=0
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_CLOUD_LOCATION=global
VERTEX_MODEL=gemini-3.8-flash
VERTEX_PLANNER_MODEL=gemini-3.8-flash
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=<base64 of the service-account JSON>
```

Alternatively, use `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json`. Be aware that an operating-system-level `GOOGLE_APPLICATION_CREDENTIALS` variable takes precedence over `.env`, so requests may silently use a different service account (this produces a 403 even when your key is valid). The base64 variable is checked first and avoids that problem.

Use an account and project that can access the Vertex model you selected. The runner inherits the local server configuration, including the model you choose. A model saved from the Settings page is stored in `data/state.json` and overrides `.env` for the running app, so check Settings if the model shown differs from your configuration. The Gemini Developer API alternative uses `ORGANA_LLM_PROVIDER=gemini` and `GEMINI_API_KEY` on the server. Keep credentials on your own computer; there is no need to send them in a conversation.

## Running

```bash
npm run test:live -- --preflight
npm run test:live
```

Preflight only checks configuration. A "ready" message does not yet prove authentication works. The live test that follows makes real model requests and can use paid quota.

The runner creates a temporary server on loopback with isolated Nusa Coffee data. It does not need `npm start` and does not change your `data/state.json` or `.env`. When it finishes or is cancelled, the server is stopped and the temporary data is cleaned up.

## Limits and results

The default limits are 30 model calls, 8,192 output tokens per call, 90 seconds per SDK request, one SDK attempt, and 20 minutes for the whole run. The call reservation is written before the request; a failed request still uses budget. The budget survives a restart of the test server. The call limit can be set between 1 and 200 and the token limit between 1 and 32,768 through the `ORGANA_LIVE_CHECK_MAX_CALLS` and `ORGANA_LIVE_CHECK_MAX_TOKENS` variables. The token value limits output, not total input tokens or cost in any currency.

Results are saved in `.local-qa/live-<timestamp>/results.json`, `report.md` and `budget.json`. Errors are redacted so known credentials, private keys and bearer tokens are not shown. The local results folder is ignored by Git. Do not share a report that still contains private work context without checking it first.

Flows covered: health/provider/storage, company and team, direct instruction, task retry, revision and history, human approval, Knowledge and provenance, Chief of Staff plan, plan retry, activation retry, task dependency and review, meeting, exact meeting approval, rejection of an old approval, Stand-up, usage/events, and persistence after restart.

If the model asks for clarification, produces an invalid plan, does not schedule a meeting, or fails authentication, the runner saves partial results and stops. It does not claim that all live flows passed in those conditions. Questions can be answered through the Missions/Tasks UI for manual checking.

## Checking the runner without Google requests

```bash
npm run test:live:runner
node scripts/live-check.cjs --fixture
```

The seven runner tests check preflight, credential redaction, call/token limits, failure budget, the 17 fixture HTTP flows, and cancellation. The `--fixture` mode explicitly uses the demo provider and records `liveExecutionVerified: false`. The bundled fixture results are in `docs/qa/live-fixture/`.
