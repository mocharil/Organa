# Tests

`npm test` runs `hackathon-core.cjs`, a dependency-free end-to-end API test in deterministic dry-run mode. It validates the complete demo path: company proposal, templates, dynamic hiring, North Star/prompt version traceability, Chief of Staff planning, dependency scheduling, specialist execution, multi-agent meeting, durable deliverables, approvals, provenance, stand-up, and the Mission Control static surface.

The remaining `*.cjs` files are visual regression checks inherited from the original Three.js prototype. They require Playwright and a browser runtime, which are intentionally not production dependencies.
