# Organa v3.18.5 — end-to-end verification

The release verification used isolated data and the deterministic demo provider. The source started from the v3.18.2 archive, and the flow and UI fixes were then rebuilt. This release is not an identical copy of the lost v3.18.4.

## Results

| Check | Result | Evidence / command |
| --- | --- | --- |
| JavaScript syntax | Pass | `npm run check` |
| Nine legacy core regression scripts | Pass | `npm test` |
| Onboarding API | 12 / 12 | `tests/onboarding-api.cjs` |
| Team, meetings, stand-up and workflow API | 15 / 15 | `tests/workflows-api.cjs` |
| Retry recovery, persistence, reassignment, clarification and reset | 20 / 20 | `tests/recovery-regressions.cjs` |
| Local Gemini guard and runner | 7 / 7 (6 / 7 on Windows; see note below) | `tests/live-check-runner.cjs` |
| Browser onboarding | 24 / 24 | [JSON](qa/onboarding/onboarding-e2e-results.json) |
| Browser workflow | 30 / 30 | [JSON](qa/workflows/workflows-e2e-results.json) |
| Browser workspace UI | 14 / 14 | [JSON](qa/ui/workspace-ui-results.json) |
| Browser Office and landing | 19 / 19 | [JSON](qa/office/office-ui-results.json) |
| Workspace layout | 50 combinations | 10 pages × 320, 390, 768, 1024 and 1440 px, part of the UI suite |
| HTTP runner in fixture mode | 17 / 17 | [JSON](qa/live-fixture/results.json), `liveExecutionVerified: false` |

Total browser: **87 scenarios**. Total tests reported with `node:test`: **54**, plus nine core regression scripts. The fifty layout combinations are part of one UI scenario; the 17 fixture runner flows are also covered by a single runner test. Those numbers are not re-added as independent tests.

Note: on Windows, the runner test "Cancellation writes partial results and terminates the isolated child" fails because the terminated child process reports no exit code. It also fails without the latest changes and has not been investigated further.

## Important scope

- Setup from an outcome/template, review edits, coordinator, unique names, failure/retry, lost-response recovery, reload and the first mission.
- Team profile/lifecycle/hiring, validation and failed-save recovery; the rebuilt Office uses the stored roster.
- Direct assignment, Chief of Staff plan, identity retry, dependencies, review, revision, history, deliverables and provenance. A failed save on task answer/retry/review preserves the version, approval and dependencies; North Star activation preserves the previously active version.
- Mission clarification: questions, drafts after reload, failed save, concurrent answers, history, restart, stale requests and organization reset.
- Meetings from real work: dependency/participant readiness, independent contributions, revision feedback, failed save, current approval and rejection of an old approval.
- Stand-up with valid references, priority, source navigation, recorded usage and a verified fallback.
- Overview/Evaluation without internal navigation; a single page title, all phone routes, keyboard Escape, focus, safe document rendering and reduced motion.
- Office: avatar identity, four floors, whole building, individual/division/custom instructions, meeting capacity, empty selection, walking via the stairs, returning to the desk, task review, camera, music volume and local video assets.

## Reproduction

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:e2e:all
```

The four browser suites use a temporary server and data. If Chromium is already available, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the executable path. This package's verification used Chromium 143 through a local executable because the Playwright Chromium download in the working environment produced a truncated archive. That Chromium file is not part of the source ZIP.

## Live Gemini check (added 2026-10-09)

`npm run test:live` was run against Gemini on Vertex AI (`gemini-3.8-flash`, global endpoint) and all flows passed with `liveExecutionVerified: true`. Running it live exposed two schema problems that the demo provider could not catch: `structuredData` allowed an `array` type without `items`, and meeting items in the plan schema had no properties. Both are fixed in `server/ai/schemas.js`. This is one run on one project, so it does not establish model quality in general.

## Limits of the evidence

The release verification above used no Gemini credentials and made no live Google requests. Service-account authentication, live model answer quality and provider behavior in your project must be checked through the [local runner](LOCAL_LIVE_TEST.md). The document fixture is used to check formatting and hostile content, not AI answer quality.

Browser testing was done on Chromium; Safari/Firefox and physical devices were not checked. Persistence was tested with local JSON, not live Firestore transactions. The Office roster after a team lifecycle change follows the reload hint shown in the UI. Passing the scenarios above does not prove there are no bugs for every possible input or external integration.
