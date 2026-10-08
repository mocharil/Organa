# Organa local workflow check

Provider: dry-run
Mode: Fixture harness, no live AI
Passed: 17/17
Live execution verified: false

- PASS: Health uses the selected provider and isolated JSON storage
- PASS: Company and reviewed team are available
- PASS: Direct instruction executes and returns a reviewable result
- PASS: Retry of the same instruction keeps one task
- PASS: Task revision keeps draft history
- PASS: Current task output requires human approval
- PASS: Knowledge retains the approved deliverable and provenance
- PASS: Chief of Staff produces a bounded mission plan
- PASS: Plan retry returns the same saved project
- PASS: Activation retry preserves task and meeting identities
- PASS: Mission tasks execute in dependency order and each draft is reviewed
- PASS: A cross-functional meeting produces a decision for review
- PASS: Approval Center confirms the exact meeting decision
- PASS: Previously resolved approval cannot approve another version
- PASS: Stand-up has verified links to saved work
- PASS: Usage and events record provider-backed execution
- PASS: Restart retains task results, meeting decisions, stand-up and budget
