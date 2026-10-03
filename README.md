# Organa

**Build and operate an AI workforce from one visual company workspace.**

Organa turns a company-level outcome into coordinated, reviewable work. A human owner defines the company North Star, hires or edits AI coworkers, gives the team a mission, and reviews the resulting decisions and deliverables. The existing Three.js office is the live operating surface, not just decoration: active AI coworkers populate the office, task state follows backend execution, and meeting participants visibly move to the Meeting Room.

## Design source of truth

All product and marketing UI work must follow [`docs/ORGANA_MASTER_DESIGN_SYSTEM.md`](docs/ORGANA_MASTER_DESIGN_SYSTEM.md). It is the canonical visual reference for brand tokens, spacing, components, agent states, orbit/node interaction language, motion, accessibility, responsive behavior, and 3D-office styling. When older styles conflict with it, the master design system wins.

Version 3.8 applies that system through `public/organa-design-system.css`, with shared tokens and reusable visual primitives used by both the marketing site and the AI workplace. The product now uses the specified 248px desktop navigation, 72px tablet rail, bright `#F8FAFF` foundation, restrained blue/cyan/violet gradients, professional employee identity, semantic agent-status rings, orbit/node collaboration visuals, human-review emphasis, and master responsive/accessibility rules.


## Live Organization digital twin

The 3D Office is a deterministic visualization of Organa's persisted execution state. Models generate bounded work content, but they never move characters directly. Server-side task, meeting, approval, and dependency transitions are persisted first, exposed through `/api/events`, and then translated into 3D behavior.

```text
Human goal
   ↓
Mission Control
   ↓
Deterministic orchestrator / task DAG
   ↓
Persisted task + meeting events
   ↓
3D digital-twin mapper
   ↓
Agent desk / Meeting Room / Review Hub / status orbit
```

Current visual mappings include:

- `task.started` → the responsible coworker returns to their department desk, receives a cyan working orbit, and a light pulse travels from the shared goal node to that coworker.
- `waiting_dependency` → the coworker remains visible at their desk with a waiting state instead of wandering away.
- `task.blocked` → the coworker moves to the Review Hub and visibly waits for human input.
- `task.needs_review` → the coworker moves to the Review Hub with an indigo review state.
- `meeting.started` → the persisted participant set moves to the Meeting Room and receives the collaboration orbit state.
- `meeting.completed` → participants return to normal work while the moderator carries the synthesis to the Review Hub until the human resolves the approval.
- `task.completed` / resolved meeting review → a short green completion state is shown before the coworker becomes available again.

Ambient office behavior remains available for idle coworkers only. Lunch, rooftop, prayer, lounge, and spontaneous movement cannot override a coworker who is controlled by verified work state.

## Hackathon positioning

Organa is designed for the **Future of Work & Enterprise Productivity** challenge.

The product thesis is simple:

> Give Organa an outcome, not a prompt.

Instead of chatting with several isolated bots, the user operates a small AI organization with:

- an **AI Chief of Staff** for bounded planning and coordination,
- persistent specialist AI coworkers with editable role prompts,
- a versioned **Company North Star** for mission, principles and hard constraints,
- a dependency-aware task graph,
- multi-agent meetings with independent contributions and moderator synthesis,
- durable versioned deliverables,
- human approval gates,
- traceability through the **Why did the team do this?** view,
- an event-backed Morning Stand-up,
- a configurable LLM layer: Gemini on Vertex AI, Gemini API key, OpenAI, Anthropic, or deterministic dry-run,
- Cloud Run + Firestore for the hackathon deployment target.

The human remains the company owner and final decision-maker. The Chief of Staff is a business role. Deterministic server code owns scheduling, dependencies, persistence, approvals and state transitions.

## Demo-critical flow

The seeded **Nusa Coffee** scenario demonstrates the complete path:

1. Open **Organization Control**.
2. Load the Nusa Coffee demo, or create a company from a goal / team template.
3. Review the team and North Star. Nusa Coffee includes a hard launch-marketing cap of IDR 25,000,000.
4. In **Missions**, submit a company-level goal.
5. The Chief of Staff proposes a four-task DAG.
6. Research completes first. Marketing and Finance then run in parallel. The final execution package waits for both.
7. Start the scheduled cross-functional Meeting Room session.
8. Review the meeting decision record and the final task deliverable.
9. Approve or request revision.
10. Generate a Morning Stand-up from the actual stored execution state and events.

## Architecture

```text
Browser / Three.js Office
        |
        +-- Mission Control
        +-- Task board
        +-- Meeting visualization
        |
        v
Node.js API on Cloud Run
        |
        +-- Company Architect
        +-- Agent Designer
        +-- AI Chief of Staff planner
        +-- Deterministic DAG scheduler
        +-- Specialist task worker
        +-- Meeting orchestrator
        +-- Deliverables + approvals
        +-- Events + stand-up
        |
        +--> Provider Manager
              +-- Gemini / Vertex AI
              +-- Gemini Developer API
              +-- OpenAI Responses API
              +-- Anthropic Messages API
              +-- deterministic dry-run
        |
        +--> Firestore

Human owner is the final authority
```

Important boundaries:

- Model output is structured JSON and validated by server-side orchestration contracts.
- AI does not directly mutate task dependencies, approvals or persistence state.
- A model may recommend work, but deterministic application code decides what state transition is valid.
- External publishing, spending and destructive actions remain approval-gated concepts. This prototype does not autonomously execute them.
- Dry-run mode follows the same state transitions as live providers, which makes local development and judging fallback deterministic.
- Provider credentials stay server-side. Mission Control can switch among providers that are already configured on the server, and each coworker can inherit the workspace model or use a provider/model override.

## Run locally

Requires Node.js 22+.

```bash
npm install
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

If no live AI credentials are configured, Organa automatically runs in deterministic dry-run mode. This is intentional and still exercises the real company, task, meeting, deliverable, approval and event state machines. The app now shows this mode explicitly in the sidebar, AI-powered surfaces, Tasks, and AI Settings so users are never expected to infer whether a live model is connected.

For Gemini there are two supported authentication paths:

- **Vertex AI**: service-account JSON (`GOOGLE_APPLICATION_CREDENTIALS`, inline JSON, or base64 JSON) or Application Default Credentials / a Cloud Run runtime service account.
- **Gemini Developer API**: server-side `GEMINI_API_KEY`.

A provider that is selected but cannot authenticate returns an actionable provider/setup error instead of a generic server 500.

### Choose the LLM provider

Set `ORGANA_LLM_PROVIDER` in `.env`, or use **Mission Control → AI Settings** after the server starts. Runtime switching only exposes providers whose credentials are already configured on the server. Keys are never returned to the browser.

```bash
ORGANA_LLM_PROVIDER=vertex   # vertex | gemini | openai | anthropic | dry-run | auto
```

`auto` prefers Vertex AI, then Gemini API, OpenAI, Anthropic, and finally dry-run. For the AI Builder Cup submission, keep Vertex AI / Gemini as the demonstrated provider even though the app supports other providers.

### Gemini with an API key

```bash
ORGANA_LLM_PROVIDER=gemini
GEMINI_API_KEY=your_server_side_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_PLANNER_MODEL=gemini-2.5-flash
```

### Gemini on Vertex AI with your service-account JSON

The simplest local setup is to point Google Application Default Credentials at your JSON key file:

```bash
ORGANA_LLM_PROVIDER=vertex
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=asia-southeast1
VERTEX_MODEL=gemini-2.5-flash
VERTEX_PLANNER_MODEL=gemini-2.5-flash
```

If `GOOGLE_CLOUD_PROJECT` is omitted, Organa can infer it from a readable service-account JSON's `project_id`. The server also accepts `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` for environments where mounting a file is inconvenient. Do not commit any of these credentials.

On Cloud Run, prefer assigning the Cloud Run service a runtime service account with Vertex AI permissions instead of deploying a long-lived JSON key.

### OpenAI

```bash
ORGANA_LLM_PROVIDER=openai
OPENAI_API_KEY=your_server_side_key
OPENAI_MODEL=gpt-5.6-luna
OPENAI_PLANNER_MODEL=gpt-5.6-luna
```

Organa uses the OpenAI Responses API and JSON-schema output where a structured response is required.

### Anthropic

```bash
ORGANA_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_server_side_key
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_PLANNER_MODEL=claude-sonnet-4-6
```

Anthropic remains available for users migrating from the original prototype.

### Workspace and per-agent model overrides

Open **Mission Control → AI Settings** to switch the workspace default provider and enter model IDs without restarting the app. In **AI Team**, each coworker can either inherit the workspace provider or override its provider/model. Provider switching never stores or exposes API keys in app state.

## Deploy to Google Cloud Run

The deployment script creates or reuses:

- a dedicated Cloud Run runtime service account,
- Artifact Registry,
- Firestore Native mode default database,
- minimum runtime IAM for Vertex AI, Firestore and logging,
- a Cloud Run service configured for Vertex AI + Firestore.

Run:

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="asia-southeast1"
./scripts/deploy-cloud-run.sh
```

For the hackathon demo the script allows unauthenticated access so judges can open the app. For a real multi-user deployment, add Firebase Auth or IAP, enforce company membership on every endpoint, and disable the demo reset endpoint.

## Tests

The core end-to-end test uses deterministic dry-run mode and does not require paid model calls:

```bash
npm test
npm run check
```

It verifies:

- Company Architect proposal + human activation
- five curated team templates through the same proposal pipeline
- natural-language AI coworker hiring
- North Star versioning
- agent prompt versioning and run traceability
- Chief of Staff bounded DAG generation
- dependency ordering through append-only events
- multi-specialist execution
- multi-agent meeting contributions and synthesis
- durable deliverables
- provenance / Why view
- human approvals
- stand-up generation from real stored state
- Mission Control static surface

The older visual regression scripts still require Playwright and a browser runtime. They are not production dependencies.

## Key API surface

```text
GET  /api/health
GET  /api/llm/settings
PATCH /api/llm/settings
GET  /api/company
GET  /api/company-bootstrap/templates
POST /api/company-bootstrap/templates/:id/proposal
POST /api/company-bootstrap/proposals
POST /api/company-bootstrap/proposals/:id/activate

GET  /api/agents
POST /api/agents/design
PATCH /api/agents/:id
POST /api/agents/:id/activate

GET  /api/north-star
POST /api/north-star/versions
POST /api/north-star/versions/:version/activate

POST /api/projects/plan
POST /api/projects/:id/activate-plan
GET  /api/projects/:id/graph

GET  /api/tasks
POST /api/tasks
PATCH /api/tasks/:id

GET  /api/meetings
POST /api/meetings/:id/start
POST /api/meetings/:id/approve
POST /api/meetings/:id/request-revision

GET  /api/deliverables
GET  /api/deliverables/:id/why
GET  /api/approvals
POST /api/approvals/:id/approve
POST /api/approvals/:id/request-revision

GET  /api/events
POST /api/standups/generate
GET  /api/usage/summary
POST /api/demo/reset
```

## Repository map

```text
public/
  index.html                 Three.js office + Mission Control shell
  office.js                  office rendering, dynamic roster, meeting movement
  tasks.js                   focused task UI and server sync
  mission-control.js         company/team/mission/meeting/review/stand-up UX

server/
  ai/                        Provider manager + Gemini/Vertex/OpenAI/Anthropic/dry-run adapters
  data/                      default state and curated team templates
  prompts/                   bounded structured prompts
  repositories/              JSON + Firestore persistence adapters
  services/                  company, agents, orchestration, worker, meetings,
                             deliverables, approvals, events and stand-up
  server.js                  REST API + static hosting

tests/
  hackathon-core.cjs         P0 end-to-end acceptance path

scripts/
  deploy-cloud-run.sh        GCP deployment helper
```

## Current prototype boundaries

This build intentionally focuses on the complete hackathon story rather than maximum feature count. It does not yet provide autonomous financial actions, automatic external publishing, recursive agent delegation, marketplace complexity, or an endpoint DLP/security product. Those are outside the core Future of Work scenario.

The Firestore adapter currently persists the canonical workspace state as a compact runtime document. That is suitable for the bounded hackathon demo. A production-scale version should split high-volume entities such as tasks, events and deliverables into company-scoped collections and add transactional optimistic updates.

See `docs/HACKATHON_IMPLEMENTATION.md` and `docs/SPEC_TRACEABILITY.md` for architecture decisions and acceptance coverage.

## Landing page and onboarding

The public landing page is served at `/`. The interactive Organa workspace is available at `/app` and `/workspace`.

All landing-page **Get Started** calls to action link to `/app?onboarding=1`. This opens a focused four-step setup flow beside the live workspace: **Outcome → Team design → Review → Activate**. The onboarding surface becomes interactive immediately without waiting for the 3D office to finish loading, keeps the app navigation usable, provides recoverable timeout/error states, and removes the onboarding query after activation so the user lands cleanly in the live office.

The landing-page **Watch demo / Watch Video** controls open an accessible in-page video modal using `public/assets/landing/organa-demo.mp4`.
