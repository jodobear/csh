# Phase 7: Native PTY Backend

Goal: replace the current tmux-plus-poll terminal backend with a native PTY session model that
preserves reconnect semantics while materially improving terminal fidelity.

Target findings:
- operator-workflow-terminal-04
- operator-workflow-render-01
- operator-workflow-exec-02
- deployment-resilience-poll-01
- security-exposure-runtime-02

## Current Truth
- The native PTY session manager now exists at `src/server/pty-session-manager.ts`.
- `scripts/pty-session.py` now runs as a detached PTY helper with persisted output and command control.
- The previous tmux manager has been removed from the active backend path.
- `bun run test:phase7-contract` now passes locally.
- `bun run scripts/csh.ts verify .env.csh.local` passed outside the sandbox on 2026-04-08, including `exec_status=7`.
- The remaining Phase 7 work is audit/browser closeout, not backend resurrection.

## Inputs
- `src/server/tmux-session-manager.ts`
- `src/main.ts`
- `src/contextvm-interactive-client.ts`
- `src/browser/app.ts`
- `scripts/csh.ts`
- `scripts/client-common.ts`

## Synchronization Touchpoints
- teaching surface: yes; backend/runtime requirements and operator limits change
- audit state: yes; live audit findings need closure against the new backend
- startup/discovery surface: yes; handoff and prompt routing need the new active packet

## Required Work
- replace the tmux-backed session runtime with a native PTY session manager
- keep the shell/browser session tool surface stable where practical
- make session writes byte-safe instead of UTF-8 text-only
- remove full-scrollback snapshot capture from the steady-state poll path
- preserve reconnect, cleanup, and close semantics under the new backend
- fix command execution so remote exit status is surfaced correctly
- expand `csh verify` so it becomes the canonical autonomous gate for this backend migration and
  for follow-on shell hardening work
- re-run the audit postures and capture fresh browser proof against the migrated backend

## Required Output
- `src/server/*`
- `src/main.ts`
- `src/contextvm-interactive-client.ts`
- `src/browser/app.ts`
- `scripts/*.ts`
- `scripts/run-autonomous-loop.sh`
- `handoff.md`

## Implementation Sequence

### Slice 1: contract-first recovery
- Goal: freeze the public contract before replacing the backend.
- Write set:
  - `src/server/*.test.ts`
  - `src/browser/*.test.ts`
  - test-only browser fixture helpers if needed
  - `package.json`
- Gate:
  - the new contract suites exist and fail only on the missing Phase 7 behavior, not on missing test wiring

### Slice 2: native PTY manager boot
- Goal: restore a runnable `session_*` server behind the existing tool surface.
- Write set:
  - `src/server/pty-session-manager.ts`
  - `src/main.ts`
- Gate:
  - `bun run src/main.ts`
  - `bun run test:phase7-session-contract`

### Slice 3: byte-safe I/O and steady-state delta path
- Goal: make the live terminal path byte-safe and delta-oriented.
- Write set:
  - `src/server/pty-session-manager.ts`
  - `src/contextvm-interactive-client.ts`
  - `src/browser/app.ts`
  - `scripts/client-common.ts`
- Gate:
  - raw-byte input tests pass
  - delta-path tests pass
  - high-output session test passes

### Slice 4: reconnect, lifecycle, and cleanup
- Goal: preserve reconnect, close, scavenging, and restart semantics or make the remaining limit explicit.
- Write set:
  - `src/server/pty-session-manager.ts`
  - `scripts/run-autonomous-loop.sh`
  - lifecycle verification helpers as needed
- Gate:
  - named-session reconnect passes
  - close/TTL tests pass
  - restart-recovery test either passes or the repo explicitly narrows the supported contract with matching doc and audit updates

### Slice 5: operator surfaces and autonomous gate
- Goal: make `csh verify` the canonical loop for continued hardening after Phase 7.
- Write set:
  - `scripts/csh.ts`
  - `scripts/run-autonomous-loop.sh`
  - `scripts/*.ts`
  - browser/operator checks as needed
- Gate:
  - direct path passes
  - proxy path passes
  - browser contract tests pass
  - failure output names the failing layer clearly

### Slice 6: audit and browser closeout
- Goal: convert the recovered runtime into phase-complete evidence.
- Write set:
  - `docs/audits/*.md`
  - `handoff.md`
  - route-level docs or browser/operator helpers as needed
- Gate:
  - active audit postures rerun against the native PTY backend
  - migrated browser path has fresh end-to-end proof
  - proof table and handoff reflect the post-migration state instead of the broken midpoint

## Acceptance Gates
- claims and proof table
- environment matrix
- negative tests
- trust-boundary review
- lifecycle/restart behavior
- operator UX review

## Clarifying Question Gate
- stop only if native PTY work requires a transport-level protocol break that cannot be contained in this phase
- otherwise keep the existing operator surface and swap the backend underneath it

## Verification Matrix

The implementation loop for this phase must stay layered. Do not rely on one end-to-end happy-path
check as the only gate.

### Layer 0: startup truth
- `bun run src/main.ts`
- `bun run scripts/csh.ts doctor --config /tmp/csh-phase7.env`
- `bun run test:phase7-browser-contract`

### Layer 1: PTY seam checks
- direct manager or tool-level proof for byte-safe writes, including non-UTF-8-safe control input
- resize proof
- close/signal proof
- one-shot command proof with correct remote exit status
- `bun run test:phase7-session-contract`

### Layer 2: operator session checks
- `bun run csh:smoke`
- `bun run csh:lifecycle`
- reconnect to an existing named session
- high-output session behavior

### Layer 3: ContextVM end-to-end checks
- `bun run scripts/csh.ts verify /tmp/csh-phase7.env`
- direct client path must pass
- proxy path must pass
- failure must be loud and leave enough logs for the next pass to diagnose the break

### Layer 4: browser/operator checks
- browser attach on the migrated backend
- browser reconnect/close behavior
- browser poll/delta behavior on the migrated backend

### Layer 5: post-migration review
- re-run the active audit postures:
  - `security-exposure`
  - `operator-workflow`
  - `deployment-resilience`
- update `handoff.md` so it reflects the new steady state rather than the migration slice

## Verification Artifacts
- host log path must stay stable
- proxy log path must stay stable
- verification output should identify the failing layer clearly enough for an autonomous follow-on
  pass to continue without re-discovering the failure surface

## Exit Criteria
- the primary session runtime is native PTY rather than tmux attach indirection
- shell/browser input paths no longer lose raw byte sequences through UTF-8 coercion
- steady-state polling no longer captures the full scrollback buffer every cycle
- `csh exec` returns the remote command status correctly
- `csh verify` is strong enough to act as the canonical autonomous improvement gate for this repo's
  shell path
- live audit docs reflect the post-migration state
- phase is not complete until the implementation-gate categories are explicitly checked
