# Changelog

## 3.8.0 - Live Organization Digital Twin

- Made the 3D Office a deterministic visualization of verified backend work rather than a mostly ambient simulation.
- Added task-state routing: active work returns agents to their department desks; review and blocked work moves the responsible agent to the Review Hub; dependency waits remain visible at the desk.
- Added meeting-state routing so cross-functional participants move to the Meeting Room from persisted meeting events.
- Added semantic 3D status rings and orbit nodes for working, collaborating, waiting, review, blocked, completed, and idle states.
- Added a shared company-goal node and visible work pulse from the goal to an assigned agent when work starts or needs review.
- Added a live organization status panel backed by `/api/events`.
- Ambient lunch, rooftop, prayer, and routine commands no longer interrupt coworkers controlled by real task or meeting state.
- Meeting review remains at the Review Hub until the human approves or requests changes.
- Renamed the old browser meeting events to the Organa namespace.

## 3.7.0 - Master design system implementation

- Implemented `docs/ORGANA_MASTER_DESIGN_SYSTEM.md` across the landing page and application shell instead of only storing it as a reference.
- Added `public/organa-design-system.css` as the shared token/component foundation for color, type, spacing, radius, shadow, buttons, inputs, badges, cards, agent states, orbit loaders and common work surfaces.
- Standardized the app shell to a 248px desktop sidebar, 72px collapsed tablet rail, 68px header, master breakpoints, brighter surfaces and restrained Organa gradients.
- Restyled Mission Control, tasks, approvals, North Star, meetings, forms, empty states and status badges around the shared design system.
- Added semantic agent status rings and collaboration orbit indicators while preserving professional employee identity rather than robot-centric UI.
- Replaced robot-heavy landing-page organization and collaboration artwork with native, responsive Organa node/orbit visuals using human/stylized employee identities.
- Rebuilt the product walkthrough video to match the new human-led Organa visual system and removed unused robot-heavy marketing assets.
- Updated the 3D workplace palette and functional labels for Strategy, Marketing & Research, Finance & Operations, Review Hub, Library and Meeting Room.
- Reworked UI copy toward team-management language such as **Build My Team**, **Hire AI Employee**, **Plan Mission**, **Start Mission**, and **Start Stand-Up**.
- Preserved all multi-LLM, orchestration, approvals, task DAG, persistence, Cloud Run and 3D-office behavior.


## 3.3.0 - Organa naming cleanup

- Renamed the persisted demo company to **Organa Demo**.
- Updated all persisted default agent system prompts from the former product name to **Organa**.
- Removed remaining user-facing former-name copy from task exports, deployment messages, and cloud resource descriptions.
- Added preferred `ORGANA_*` configuration variables while retaining legacy `KANTOR_*` aliases for backward compatibility.
- New deployments default to `organa`, `organa-runtime`, and the `organa_runtime` Firestore collection.

## 3.2.0 - Approved Organa identity integration

- Replaced the temporary orbital mark with the approved Organa logo artwork supplied by the user.
- Added a branded startup splash and reduced-motion-safe orbital loading treatment using the actual Organa symbol.
- Added the Organa symbol prominently to Mission Control while preserving the human-authority information architecture.
- Added a physical Organa wall sign inside the Three.js workspace so the brand belongs to the simulated workplace itself.
- Kept all product logic, agent workflows, API contracts and LLM-provider behavior unchanged.

## 3.0.0 - Organa visual system

- Rebranded the user-facing product from Kantor AI to **Organa** while preserving the backend workflow and API contracts.
- Added a reusable Organa token system based on deep navy, royal blue, cyan, indigo and soft violet.
- Added the orbital-node visual motif to branding, agent avatars, collaboration states and mission graph surfaces.
- Added a persistent application sidebar, compact workspace header, organization pulse dashboard and redesigned Mission Control shell.
- Restyled the Three.js office toward a bright, premium, collaborative workplace without changing simulation behavior.
- Redesigned tasks, approvals, meetings, agent cards, settings and responsive/mobile behavior.
- Added reduced-motion, focus states, accessible status labels and a mobile bottom-navigation treatment.
- Added `public/organa-theme.css` and `public/organa-ui.js` so visual behavior stays separated from business logic.

## 2.1.0 - Multi-LLM configuration

- Added runtime-selectable providers: Vertex AI / Gemini, Gemini Developer API, OpenAI, Anthropic, and deterministic dry-run.
- Added `Mission Control -> AI Settings` for provider, worker-model and planner-model selection without exposing secrets to the browser.
- Added per-agent provider/model overrides while retaining an `inherit` workspace-default policy.
- Added local Vertex AI service-account JSON support via `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SERVICE_ACCOUNT_JSON`, or `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.
- Added provider configuration tests and generic usage attribution across providers.

## 2.0.0, AI Builder Cup build

### Added
- Gemini / Vertex AI provider abstraction and structured response schemas.
- deterministic dry-run provider matching live AI contracts.
- dynamic company, North Star, goals and Agent Profiles.
- Company Architect and five editable team templates.
- natural-language AI coworker designer and lifecycle controls.
- AI Chief of Staff project planner with validated task DAGs.
- deterministic dependency scheduler and specialist task worker.
- multi-agent Meeting Room collaboration with moderator synthesis.
- durable versioned deliverables and generalized human approvals.
- traceability / Why view with goals, evidence, constraints, collaborators and assumptions.
- append-only event model, usage records and Morning Stand-up.
- Mission Control UI integrated into the existing Three.js office.
- dynamic backend-driven office roster and visible meeting movement.
- JSON and Firestore persistence adapters.
- Cloud Run Dockerfile and deployment script.
- complete dependency-free hackathon acceptance test.

### Changed
- product identity from a simulated office prototype to Organa, an AI Company OS.
- task UI now recognizes planned, dependency-waiting and failed states.
- legacy hard-coded Claude agent wiring removed.
- model credentials remain server-side.

### Preserved
- the original multi-floor Three.js office experience.
- existing ambient character behavior.
- blocked-question behavior.
- human draft review/revision.
- task versioning and stale-run protection concepts.

## 3.5.0 - Landing conversion improvements

- Added an in-page product walkthrough modal for every **Watch demo / Watch Video** CTA.
- Added a lightweight Organa demo video assembled from the approved landing-page visual assets.
- Connected every **Get Started** CTA directly to `/app?onboarding=1`.
- Added deep-link onboarding that automatically opens Mission Control on the company builder and keeps the generated proposal directly in the onboarding flow.
- Removed Pricing navigation from the landing page.
- Added friendly `/app` and `/workspace` routes while preserving the existing application surface.
