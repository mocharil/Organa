# Organa v3.18.5 — UI and feature flows

This version was rebuilt from the available v3.18.2 archive. The full v3.18.4 source could not be recovered, so v3.18.5 is a replacement release with the changes and tests recorded here.

The interface uses the Organa design tokens, consistent typography, cards with more generous spacing, clear primary buttons, loading and empty states, keyboard focus, and reduced-motion support. There is still a single main navigation; the Overview, Performance/Evaluation and Tasks popups do not repeat the sidebar.

| Feature | Change / behavior checked | Evidence |
| --- | --- | --- |
| Onboarding | Two setup paths, team review, validation, drafts surviving reload, retry without duplication, activation and first mission | [24 scenario results](qa/onboarding/onboarding-e2e-results.json) |
| Overview | Metrics from stored data, shortcuts to related features, North Star, clear primary actions | [Desktop](qa/ui/company-1440.png), [phone](qa/ui/company-390.png) |
| Missions | Search/status, two intake paths, brief drafts, clarification answers on the same mission, safe activation when navigating away | [Desktop](qa/ui/mission-1440.png), [clarification](qa/ui/clarification-1440.png) |
| Tasks | Search/filter, list first on phones, full coworker names, formatted results, history, drafts and recipient choices that persist | [Desktop](qa/ui/tasks-1440.png), [phone](qa/ui/tasks-390.png) |
| Team | Structure and People, coworker search, profile/configuration, edit drafts, lifecycle and hiring | [People](qa/ui/people-1440.png), [phone](qa/ui/people-390.png) |
| Meetings | Cards/search/status, participant perspectives, decision record, inline revision, review against the current version | [Desktop](qa/ui/meetings-1440.png), [phone](qa/ui/meetings-390.png) |
| Knowledge | Search/count/clear, current version, heading/list/table/code formatting, provenance, HTML content not executed | [Document](qa/ui/document-1440.png), [320 px](qa/ui/document-320.png) |
| Approvals | Search/status, saved revision feedback, context and source task/meeting buttons | [Desktop](qa/ui/review-1440.png), [phone](qa/ui/review-390.png) |
| Stand-up | Priority-ranked brief, task/meeting/approval sources, empty state and labeled fallback | [Desktop](qa/ui/standup-1440.png), [phone](qa/ui/standup-390.png) |
| Goals / North Star | Active version, constraints, editor with drafts that survive navigation/reload | [Desktop](qa/ui/goals-1440.png), [phone](qa/ui/goals-390.png) |
| Performance / Evaluation | Metrics from stored activity, mission progress, coworker identity and profile links | [Desktop](qa/ui/performance-1440.png), [phone](qa/ui/performance-390.png) |
| AI Settings | Tidier form, expandable credential guidance, clear demo/live mode | [Desktop](qa/ui/settings-1440.png), [phone](qa/ui/settings-390.png) |
| Office / landing | Full coworker names, person/division/custom instructions, meeting capacity, travel between floors, details not covered by controls, local music/video | [Office desktop](qa/office/office-1440.png), [phone](qa/office/office-390.png), [landing](qa/office/landing-1440.png) |

Phone navigation provides an **All pages** button for all 12 destinations. Escape closes that menu without closing the workspace: [screenshot](qa/ui/mobile-all-pages.png).

## Recovery behavior

A retry creates one task, one mission, or one North Star version for the same request, including after a restart. Failed saves during creation, activation, answers, review, clarification and reassignment return a state that can be retried. Reassignment does not skip unfinished dependencies and does not change the owner of a task that is running, in review or finished. Renaming a coworker keeps the assignee's identity. A worker or clarification response from an old organization does not write results into a reset organization.

A mission that asks for input now shows a list of questions and an answer textarea. The answers keep the mission ID, goal and history; the new plan must still be reviewed before **Start Mission**. An approval source opens the exact record. The result of an activation request does not take over another page you are viewing.

## How to verify

```bash
npm ci
npx playwright install chromium
npm run check
npm test
npm run test:e2e:all
```

The [full verification results](END_TO_END_QA.md) distinguish demo tests from live Gemini tests. Screenshots come from isolated test data; demo numbers and fixture documents are not evidence of live model quality.

A team lifecycle change in the Office requires a reload to rebuild the 3D roster. The UI shows a reload hint after saving the status. The ZIP file contains source, lockfile, tests, the local guide and screenshots; local dependencies and credentials are not included.
