# Changelog

## Unreleased — daily use, demo and AI quality

- Workspaces: switch between organizations from the header; an instant, non-destructive Nusa Coffee demo workspace built from a real Gemini run (Settings → Workspaces).
- Automatic rolling backups of the workspace file, safety backups before demo changes and restores, and a Backups panel with restore (Settings → Backups).
- Document export: Download .md and Copy text, plus a Constraint guard line showing the checks each coworker recorded.
- Overview "Needs you" card, tab-title count of waiting items, and real mission progress from task status.
- Fewer redundant questions from coworkers, with a one-click "Proceed with your best assumptions".
- Stand-up items now carry detail, owner, goals and constraints, which raised judged stand-up quality from 3.4 to 4.5 out of 5.
- KPI suggestions are named; goal and mission titles are cut at word boundaries.
- Web research: tick "Use web research" on a task or mission to ground it in live Google Search with cited sources.
- Export to Word (.docx) and Excel (.csv), and optional Save to Google Docs / Sheets through your own Google account (drive.file scope only, OAuth with PKCE; see docs/GOOGLE_SETUP.md).
- Emails: AI drafts an email from your instruction or from any document; you choose recipients, edit, and send through your own Gmail (send-only permission). Safeguards: confirmation on every send, no placeholders, recipient and daily limits, single send on double click, recovery after a dropped connection or restart, and "Open in Gmail" with no setup.
- Safer defaults: the server listens on 127.0.0.1 unless HOST is set.
- Windows-safe cancellation test, a live AI quality evaluation (npm run test:quality) and a guided tour.

## 3.18.5 — UI refresh and source recovery

Rebuilt from the available v3.18.2 archive after the later workspace source was unavailable. This release is a tested replacement, not a byte-for-byte restoration of v3.18.4.

- Shared readable workspace styling, mobile All pages navigation, searchable collections, Team People view, structured document rendering and reduced-motion loading.
- One global navigation across Overview, Performance and the other workspace panels; native Tasks retains its parent workspace.
- Company-scoped workflow drafts; stable request identities for missions, tasks and North Star versions; retry and failed-save recovery; dependency-safe reassignment and rename-safe selections.
- Mission clarification answers update the same plan, retain history and survive retries/restart. Mission activation preserves navigation when its request finishes.
- Approval source links, inline revision feedback and stale-approval validation; failed task review/answer/retry saves retain pending work and dependencies, and North Star activation rolls back on storage failure.
- Full coworker names in Office, accurate provider badges, clear empty-selection feedback and separate mobile detail/control areas.
- Local isolated Gemini runner with bounded calls/output, partial cancellation reports, secret redaction and a fixture mode that never claims live execution.

See `docs/END_TO_END_QA.md` for this release's actual checks and remaining verification scope.

## v3.18.2 · Workspace, Team, Meeting, and Stand-up Reliability

- Validated employee fields, unique names, coordinator continuity, reporting changes, and model policies; made hiring retries idempotent.
- Protected running work and repaired reports when a manager is archived; kept saved names, initials, and 3D avatar gender consistent.
- Required every selected meeting participant to be active, verified contribution identity, and rejected malformed model responses.
- Passed owner revision feedback and the previous decision into the next meeting round; prevented old approval IDs from approving revised results.
- Made meeting review retries safe, rolled back failed decision writes, and recovered interrupted meetings after server restart.
- Preserved stand-up source coverage, priority, and recorded usage; included failed meetings and revision work; coalesced concurrent generation.
- Kept pending UI requests busy without overwriting another selected view; exposed meeting contributions, decision records, inline revisions, and stand-up source actions.
- Removed popup sidebars and routed all workspace views through the single main navigation, including mobile and collapsed-sidebar layouts.
- Added Overview loading recovery, preserved North Star draft review and activation retries, and verified Performance totals and saved evaluation criteria.
- Kept meeting/evaluation details open through background refresh and focused stand-up task links on their exact saved record.
- Improved mobile forms, profile selection, task layout, credential cards, and access to every workspace section.
- Added 15 workflow API/service groups and 30 workflow browser scenarios, with screenshots and a QA report; reran the 24 onboarding scenarios.

## v3.18.1 · Onboarding Reliability and UI

- Unified landing and workspace organization creation behind one guided setup.
- Saved setup and review edits across refresh, retry, navigation, and AI Settings detours in the same browser tab.
- Preserved owner-supplied goals and constraints in scratch, template, and deterministic-mode proposals.
- Added draft request deduplication, idempotent activation, bounded input validation, unique names, coordinator validation, repaired reporting lines, and storage-failure rollback.
- Reworked setup for desktop and mobile with compact progress, selectable template cards, labeled coworker fields, inline validation, clear recovery actions, and a completion screen.
- Deferred 3D construction until setup exits, bundled the existing renderer and fonts, and kept navigation usable when WebGL is unavailable.
- Passed the first approved outcome into Missions and protected in-progress form edits from background refresh.
- Added automated API and browser onboarding regression coverage, a dependency lockfile, and a QA report with screenshots.

## v3.18 — Dual Work Intake

- Added two explicit work-entry paths in Missions: **Ask Chief of Staff** for automatic planning/routing and **Assign to AI Employee** for direct ownership.
- Chief of Staff plans now persist a routing summary with coordinator, primary owner, participating agents, assignments, and routing rationale.
- Direct assignments are tracked as governed Organa tasks with `intakeMode=direct_agent`, human review by default, events, usage, Stand-up visibility, and deliverable traceability.
- Added searchable division-grouped employee picker and direct-assignment history inside Mission Control.
- Added routing preview and per-task “why this route” explanations before a Chief-routed mission is activated.
- Both flows continue to work in deterministic mode when no live LLM is configured.

## v3.17 — AI Setup Guardrails

- Made live-AI state visible globally in the sidebar and inside AI-powered work surfaces instead of forcing users to infer whether Gemini is configured.
- Confirmed and surfaced both Gemini authentication paths: Vertex AI with service account / Application Default Credentials, or Gemini Developer API with a server-side API key.
- Added deterministic-mode notices for organization design, employee design, mission planning/execution, meetings, Stand-up, and direct task execution.
- Added actionable provider errors so missing/broken credentials return setup guidance instead of a generic HTTP 500.
- Added runtime status metadata to `/api/health`, `/api/llm/settings`, and `/api/agents`, including setup-required and degraded provider state.
- Added regression coverage proving Organa stays usable with zero live-LLM credentials and that provider authentication failures are reported as actionable setup errors.

## v3.16 — Stand-up Reliability

- Made Morning Stand-up resilient to transient or malformed LLM responses.
- Added a deterministic verified fallback generated directly from stored tasks, approvals, meetings, blockers, and queued work instead of returning HTTP 500 when AI summarization is unavailable.
- Added provenance enforcement so AI-generated stand-up items can only reference records present in the deterministic activity snapshot.
- Tightened the stand-up response schema and required stable refs for every list item.
- Added `/api/standups/latest` so the latest owner brief survives page refreshes.
- Added degraded-mode messaging in the UI and a regression test for provider failures, invented refs, and missing workspace state.

# Changelog

## v3.15 — Hierarchical AI Team

- Rebuilt Your AI Team as an organization chart: Human Founder → AI Chief of Staff → divisions → specialist AI employees.
- Added collapsible division branches and explicit reporting-line labels.
- Added an integrated employee profile with current work, responsibilities, skills, manager/direct reports, collaborators, activity, performance, model usage, and configuration.
- Added editable manager/reporting line, division, purpose, responsibilities, skills, provider/model, prompt, and personality settings.
- Added lifecycle controls for hire, pause, activate, archive, and restore.
- Added reporting-line validation to reject self-management and management cycles; the Chief of Staff always reports to the Human Founder.
- Added hierarchy regression coverage.

## v3.14 — Unified navigation
- Fixed incorrect sidebar routing where Knowledge opened Approval Center, Goals opened Overview, and Performance opened Team.
- Added dedicated Knowledge, Goals & North Star, and Performance views.
- Added Approvals and Stand-up to the global sidebar so important top-level surfaces no longer exist only inside Organization Control.
- Synchronized active navigation state and Organization Control header copy with the selected global section.
- Added a navigation consistency regression test.

## v3.13 — Explicit onboarding start path
- Added a first onboarding decision: **Build from scratch** or **Use a template**.
- Split the onboarding configuration UI so each path has its own focused setup instead of mixing templates under the scratch form.
- Template onboarding now supports selecting a starter team first, then customizing company name, goal, and extra hard constraints.
- Review screen now shows which starting path produced the proposal.
- Template-specific constraints are merged into the proposal North Star before activation.

## v3.12 — Onboarding reliability & guided setup
- Rebuilt the `/app?onboarding=1` experience as a focused guided setup instead of reusing the full dashboard surface.
- Onboarding no longer waits for the 3D scene to finish before becoming interactive.
- Added a non-modal onboarding workspace that leaves the main app navigation usable.
- Added request timeouts and recoverable error states so buttons cannot remain stuck indefinitely.
- Added a four-step flow: Outcome → Team design → Review → Activate.
- Added clearer fields for company context, desired outcome, and hard constraints.
- Added example outcomes and editable template previews.
- Activation now removes the onboarding query before opening the live office, preventing the setup flow from reopening in a loop.

## v3.11 — Floating compact landing header
- Added an elegant scroll-responsive landing header that starts full-width and shrinks into a centered floating pill after the user scrolls down.
- Reduced logo, nav spacing, and CTA sizing in the compact state while preserving the full navigation hierarchy.
- Added glass blur, soft Organa-blue shadowing, responsive mobile behavior, and `prefers-reduced-motion` support.

## v3.10 — Live organization flow + visual use cases
- Rebuilt the landing-page organization diagram as a repeating founder → Chief of Staff → division → specialist-agent flow.
- Added reusable Organa department SVG assets for Chief of Staff, Product, Engineering, Marketing, Sales, Operations, and Finance.
- Added sequential branch animation, network pulses, specialist-agent reveal states, and reduced-motion behavior.
- Reworked the “Built for real work” cards with generated background visuals and a native Organa adaptation of the supplied ColorChangeCards hover interaction.
- Added grayscale-to-color hover/focus transition, image zoom, rotating arrow, and rolling title animation without introducing React/Tailwind into the current vanilla app.

## v3.9.2 — Consistent logo + foldable sidebar
- Standardized the in-app sidebar branding to use the same Organa logo family as the landing page and favicon.
- Added a fold / unfold desktop sidebar control so users can widen the 3D office view.
- Persisted the sidebar state in local storage so the workspace remembers the preferred layout.

## v3.9.1 — Organa logo and favicon refresh
- Replaced the Organa logo mark with the new uploaded orbital icon.
- Updated the full logo lockup asset to use the new icon with the Organa wordmark.
- Regenerated the favicon from the same source mark for brand consistency across the landing page and app.

## v3.9 — Landing visuals upgrade
- Added visual image previews for all six core feature cards on the landing page.
- Added a dedicated “Inside the app” landing section showcasing the 3D digital twin app experience.
- Replaced the abstract workroom illustration with a richer collaboration image that matches the Organa visual system.
- Bundled new landing assets for AI Chief of Staff, Team Builder, Agent Collaboration, Company North Star, Morning Stand-up, Approval Center, and the 3D app showcase.

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
