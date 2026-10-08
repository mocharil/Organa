# Tests

Use Node.js 22 or newer. Install dependencies with `npm ci`.

```sh
npm test
npm run check
```

`npm test` runs provider configuration, the complete hackathon API flow, digital twin and navigation checks, team hierarchy, stand-up recovery, AI setup guardrails, dual work intake, onboarding integration checks, 12 onboarding API/service groups, and 15 workflow API/service groups. Workflow coverage includes validated team editing, safe hiring retries, lifecycle changes, reporting repair, meeting contributions, revision feedback, stale approvals, interrupted meeting recovery, stand-up provenance, concurrent calls, and storage rollback.

`npm run check` checks JavaScript syntax. This project serves plain HTML, CSS, and JavaScript directly and has no build/transpilation step.

## Browser onboarding tests

```sh
npx playwright install chromium
npm run test:e2e
npm run test:e2e:workflows
```

The browser suite starts its own local server using an isolated temporary data directory, and blocks all third-party resource requests. It covers real clicks and forms, both paths and all templates, mobile/tablet/desktop layout, refresh/back/retry, lost activation responses, timeouts, settings recovery, unavailable storage, reduced motion, 3D roster handoff, and unavailable graphics. Provider failures are simulated; live credentialed model calls are not made.

The workflow browser suite runs 30 scenarios from organization setup through draft design, reviewed hiring, pause/archive/restore, North Star draft activation, mission task approval, a real meeting, a revised decision, evaluation, owner approval, and the resulting stand-up. It checks Overview loading/retry, recorded performance totals and saved evaluation criteria, real 3D identities/meeting participants, delayed responses, unavailable endpoints, exact task-source navigation, and all ten workspace views at five widths. Popups contain no internal navigation; all routes use the single main app sidebar. Use `npm run test:e2e:all` to run both browser suites in order.

To retain screenshots and the JSON result in a chosen directory:

```sh
ONBOARDING_QA_DIR=./qa-output npm run test:e2e
WORKFLOWS_QA_DIR=./workflow-qa-output npm run test:e2e:workflows
```

A custom Chromium binary can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Playwright is a development dependency and is omitted by `npm ci --omit=dev` for production installs.

`npm run test:onboarding` and `npm run test:workflows` run their API/service groups separately. Older Three.js visual/animation scripts remain available separately under `tests/`. See `docs/ONBOARDING_QA.md` and `docs/WORKFLOWS_QA.md` for validated scopes and reference screenshots.
