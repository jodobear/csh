# Phase 3: Acceptance Hardening

Goal: bring the interactive shell and browser paths up to the implementation-gate standard, fix the
audit findings, and leave behind a defensible proof record.

## Inputs

- `AGENTS.md`
- `handoff.md`
- `docs/process/process-principles.md`
- `docs/process/implementation-gates.md`
- `docs/plans/build-plan.md`
- `docs/plans/phased-implementation-plan.md`
- `docs/plans/decision-log.md`
- the current interactive/browser implementation under `src/` and `scripts/phase1/`

## Required Work

- audit the code and repo state against the implementation gates
- fix correctness, trust-boundary, lifecycle, and operator-UX issues exposed by the audit
- update verification paths so they do not overclaim what has not been proven
- record claims vs proof in `handoff.md`
- record open risks and unsupported behaviors explicitly

## Required Output

- updated `handoff.md`
- updated implementation and runtime files as needed
- updated process artifacts when the audit shows a process deficiency

## Acceptance Gates

- claims-and-proof table exists for the interactive shell and browser paths
- environment matrix is explicit
- negative cases are recorded, not only happy-path checks
- trust boundaries are explicit and enforced where claimed
- lifecycle behavior covers disconnect, restart, cleanup, and persistence scope
- operator UX covers reconnect, scrollback, and unsupported behaviors

## Clarifying Question Gate

- stop if a fix would materially change the product contract or deployment model
- ask one targeted question before advancing

## Exit Criteria

- the audit findings are either fixed or explicitly carried as open risks
- `handoff.md` includes claims vs proof, open risks, and unsupported behaviors
- the phase is not called complete until the implementation-gate categories are explicitly checked
