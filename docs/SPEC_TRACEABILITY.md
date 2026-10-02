# Spec Traceability

This document maps the supplied Organa specification to the implemented hackathon build.

| Spec feature | Priority | Implementation | Verification |
|---|---:|---|---|
| Generate company from goal | P0 | Company Architect proposal + editable activation flow | `hackathon-core.cjs` |
| Start from team template | P0 | 5 curated templates through same proposal pipeline | `hackathon-core.cjs` |
| AI Team Builder / hiring | P0 | `/api/agents/design`, persistent draft, activate/pause/archive | `hackathon-core.cjs` |
| Prompt/personality editing | P0 | persistent edit + `promptVersion`; next run records `agentPromptVersionUsed` | `hackathon-core.cjs` |
| Chief of Staff | P0 | structured planner + bounded task count + valid agent IDs | `hackathon-core.cjs` |
| Task DAG | P0 | dependency IDs, cycle validator, deterministic scheduler release | event ordering assertion |
| Mission Control | P0 | goal, plan, status, outputs, approvals, attention | browser UI + static assertion |
| Vision Memory / North Star | P0 | draft versions, explicit activation, run version trace | `hackathon-core.cjs` |
| Agent collaboration | P0 | 2-4 independent participant outputs + moderator synthesis | `hackathon-core.cjs` |
| Meeting Room visualization | P0 | meeting start/end events move named office avatars | `office.js` integration |
| Human approvals | P0 | task + meeting approval entities and review states | `hackathon-core.cjs` |
| Shared deliverables | P0 | versioned deliverable entity; downstream tasks read dependency deliverables | `hackathon-core.cjs` |
| Why did you do this? | P0 | goals, evidence, hard constraints, collaborators, assumptions, decision summary | `hackathon-core.cjs` |
| Morning Stand-up | P0 | deterministic stored-state snapshot + bounded summarizer | `hackathon-core.cjs` |
| Functional office / existing ambient behavior | P0/existing | existing 3D office retained, dynamic roster/tasks/meetings added | syntax + manual browser recommended |
| Gemini migration | P0 | `GeminiProvider` using `@google/genai`, Vertex or API key | provider code; live credentials required for external verification |
| Google Cloud deployment | P0 | Dockerfile + Cloud Run/Firestore/Vertex deploy script | deployment credentials required for external verification |
| Cost monitoring | P1 | request/token usage persisted and attributable to agent/project/task/meeting | `/api/usage/summary` |
| Activity feed | P1 | append-only bounded event list, surfaced in Stand-up | API/UI |
| Permissions / tool registry | P1 | current build has role boundaries and no autonomous external tools; full tool registry deferred | post-hackathon |
| Agent-to-agent delegation | P1 | intentionally not enabled in P0 | post-hackathon |
| Agent performance scoring | P1 | raw approval/task/usage data exists; dedicated score UI deferred | post-hackathon |
| Agent improvement | P2 | deferred | post-hackathon |
| Memory Bank | P2 | deferred; explicit North Star remains authoritative | post-hackathon |

## External verification still required

Two P0 infrastructure signals cannot be truthfully completed inside an offline editing container:

1. a real Gemini/Vertex AI call with the target GCP credentials;
2. a real Cloud Run deployment URL using the user's GCP project.

The code, dependency manifest and deployment script are in place for both. The deterministic end-to-end suite covers the same state transitions without paid calls.
