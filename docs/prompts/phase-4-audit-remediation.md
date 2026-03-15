# Phase 4: Audit Remediation

Goal: fix the live high- and medium-severity findings from the posture-specific audit set without expanding the product scope.

## Inputs

- `AGENTS.md`
- `handoff.md`
- `docs/README.md`
- `docs/process/process-principles.md`
- `docs/process/implementation-gates.md`
- `docs/audits/security-exposure-2026-03-15.md`
- `docs/audits/operator-workflow-2026-03-15.md`
- `docs/audits/deployment-resilience-2026-03-15.md`

## Target Findings

- `security-exposure-browser-01`
- `security-exposure-runtime-01`
- `security-exposure-config-01`
- `security-exposure-transport-01`
- `security-exposure-transport-02`
- `operator-workflow-exec-01`
- `operator-workflow-browser-01`
- `operator-workflow-browser-02`
- `operator-workflow-shell-01`
- `operator-workflow-verification-01`
- `operator-workflow-shell-02`
- `operator-workflow-terminal-01`
- `deployment-resilience-verify-01`
- `deployment-resilience-config-01`
- `deployment-resilience-session-01`
- `deployment-resilience-bootstrap-01`
- `deployment-resilience-browser-01`

## Audit Postures

- `security-exposure`
- `operator-workflow`
- `deployment-resilience`

## Required Work

- remove direct shell sourcing of env files from runtime start paths
- harden browser remote access so non-loopback use is not token-only
- tighten runtime/state-file permissions and transport defaults
- fix misleading operator behaviors around `exec`, reconnect, close, and disconnect
- make verification fail honestly when an advertised path fails
- reduce browser startup fragility by supporting prebuilt assets
- update the audit docs in place instead of leaving stale open findings

## Required Output

- updated runtime and CLI files under `src/` and `scripts/`
- updated audit docs under `docs/audits/`
- updated `handoff.md`

## Acceptance Gates

- claims and proof table updated where behavior changed
- negative tests or direct verification exist for each closed high/medium finding
- trust-boundary changes are explicit
- lifecycle and operator-UX changes are explicit
- docs surface is restored to steady state after closeout

## Exit Criteria

- targeted high- and medium-severity findings are fixed or explicitly carried forward with rationale
- audit docs reflect the new live state instead of the pre-fix state
- `handoff.md` points to the current remaining work, not this fix pass itself
