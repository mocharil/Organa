# Organa Hackathon Implementation

## Product statement

Organa is an AI-native company operating system for the Future of Work. The user remains the owner. AI coworkers provide specialized execution, while an AI Chief of Staff turns outcomes into bounded work plans and deterministic backend services enforce dependencies, approvals and persistence.

## Why this is more than a multi-bot chat

The core differentiator is coordinated execution state:

```text
Human outcome
  -> North Star context
  -> Chief of Staff structured plan
  -> validated task DAG
  -> specialist execution
  -> shared deliverables
  -> cross-functional meeting
  -> human approval
  -> persistent event history
  -> stand-up
```

An agent cannot simply claim a downstream task is done. Dependencies are checked by application code. A meeting is a stored entity with real participants and outputs. A deliverable records evidence references, assumptions, constraints, collaborators and the North Star / prompt version used.

## Major implementation changes from the original prototype

### AI and orchestration

- Replaced hard-coded Claude wiring with an LLM provider abstraction.
- Added Gemini provider using the official `@google/genai` package.
- Added deterministic dry-run provider with the same structured contracts.
- Added Company Architect, Agent Designer, Chief of Staff, Specialist, Meeting Participant, Meeting Moderator and Stand-up prompt contracts.
- Added server-side DAG validation, cycle detection, dependency release and per-agent concurrency control.

### Persistent organization model

- Company entity
- versioned North Star
- Goal entities
- persistent Agent Profiles
- Project / Task graph
- Meeting entities
- versioned Deliverables
- Approval entities
- append-only Events
- Stand-up snapshots
- model Usage records

### Human agency and safety

- Company generation always creates a draft proposal first.
- Team templates also create editable drafts, never automatic installs.
- AI coworker hiring creates a draft profile first.
- North Star edits create a new draft version, preserving the active source of truth until explicit activation.
- designated task outputs and meeting decisions enter review state.
- revision history is retained.
- model execution cannot directly approve its own output.

### Visual product

- The 3D office roster now loads from `/api/agents` with a static fallback.
- Company name and team size are loaded from the backend.
- AI coworkers follow real task status.
- Meeting participants can visibly move to the existing Meeting Room during collaboration.
- Mission Control adds six operational surfaces without rewriting the Three.js experience:
  - Company
  - AI Team
  - Mission
  - Meetings
  - Review
  - Stand-up

## Demo scenario: Nusa Coffee

North Star hard constraint:

```text
Launch marketing spend must not exceed IDR 25,000,000.
```

Team:

- Ari, AI Chief of Staff
- Maya, Market Research Analyst
- Rani, Growth Marketing Specialist
- Laras, Finance & Operations Analyst
- Wira, Product & Web Lead

Mission example:

```text
Launch Nusa Coffee in Jakarta with a maximum launch marketing budget of
IDR 25,000,000 and prepare an owner-ready execution package.
```

Expected task graph:

```text
T1 Evidence brief
  |\
  | +-> T2 Market / communication strategy
  | +-> T3 Budget / operating constraint check
  |        \
  +---------+-> T4 Launch execution package -> Human review

T2 + T3 -> 3-agent cross-functional meeting -> Human review
```

The automated test verifies event ordering so T2/T3 cannot start before T1 and T4 cannot start before T2 and T3.

## Google Cloud target

```text
Cloud Run
  |-- Node API + static Three.js frontend
  |-- Gemini calls through Vertex AI
  `-- Firestore state adapter
```

The deployment script creates a dedicated runtime service identity and grants only the Google Cloud roles required by this prototype.

## Production follow-ups

Post-hackathon work should focus on:

1. Firebase Auth or IAP + company membership authorization.
2. Split Firestore entities into company-scoped collections with transactional version checks.
3. Cloud Tasks / separate worker service for long-running execution.
4. registered tool execution with per-agent permission policy.
5. actual cost estimation by model and region, not token counts alone.
6. evaluation suites for agent output quality and approval/revision rates.
7. optional Google ADK adoption once product contracts stabilize.
