# Phase 8: Verification Hardening

Goal: turn the recovered native-PTY stack into a stronger autonomous gate by proving relay-backed
restart recovery and other long-lived operator invariants from the real `csh verify` path.

Target findings:
- deployment-resilience-restart-01
- deployment-resilience-verify-02
- operator-workflow-reconnect-03

## Current Truth
- The native PTY backend is now the active runtime.
- `bun run test:phase7-contract` passes locally.
- `bun test --timeout 15000 scripts/host-control.test.ts` now passes locally.
- `bun run scripts/csh.ts verify .env.csh.local` passed locally on 2026-04-09 with
  `restart_status=0`, `browser_status=0`, and a verify-selected `browser_port`.
- Relay-backed restart recovery is now proven in the canonical verify loop via
  `scripts/restart-recovery.ts`.

## Synchronization Touchpoints
- teaching surface: maybe; only if supported operator guarantees change
- audit state: yes; restart/verify findings will need live status
- startup/discovery surface: yes; active prompt and handoff need the new lane

## Required Work
- add a relay-backed restart-recovery proof that exercises a named session across a real host restart
- wire that proof into `csh verify` with stable logs and clear failure surfaces
- keep the loop TDD-driven so helper logic is covered before the end-to-end script relies on it
- update handoff and audit state once the proof is live

## First Slice

### Slice: relay-backed restart recovery
- Goal: prove that a named session survives a real host restart over the relay-backed operator path
  and make that proof part of `csh verify`.
- Write set:
  - `scripts/host-control.ts`
  - `scripts/host-control.test.ts`
  - `scripts/restart-recovery.ts`
  - `scripts/run-autonomous-loop.sh`
  - `package.json`
- Non-goals:
  - browser redesign
  - public-relay compatibility rerun
  - long-duration soak tests
- Gate:
  - `bun test --timeout 15000 scripts/host-control.test.ts`
  - `bun run scripts/restart-recovery.ts .env.csh.local`
  - `bun run test:phase7-contract`
  - `bun run scripts/csh.ts verify .env.csh.local`
- Closeout:
  - `verify` fails loudly if relay-backed host restart breaks reconnect semantics
  - the proof table no longer carries relay-backed restart as an unproven edge case

### Next Slice
- Goal: move from restart recovery to broader long-lived hardening.
- Candidate write set:
  - `scripts/run-autonomous-loop.sh`
  - targeted fault-injection or soak helpers
  - `handoff.md`
  - `docs/audits/*.md`
- Candidate gates:
  - fresh-checkout `csh verify`
  - relay interruption / recovery proof
  - longer-lived idle and high-output session proof

## Acceptance Gates
- claims and proof table
- environment matrix
- negative tests
- trust-boundary review
- lifecycle/restart behavior
- operator UX review

## Exit Criteria
- the canonical verify loop covers relay-backed host restart recovery
- restart-proof logs are stable enough for autonomous follow-on passes
- open restart-related risks are either closed or narrowed explicitly in docs
