# Phase 8: Verification Hardening

Goal: turn the recovered native-PTY stack into a stronger autonomous gate by proving
restart recovery, fresh-checkout reproducibility, and other long-lived operator invariants from
the real verification surface.

Target findings:
- deployment-resilience-restart-01
- deployment-resilience-verify-02
- deployment-resilience-relay-01
- operator-workflow-reconnect-03

## Current Truth
- The native PTY backend is now the active runtime.
- `bun run test:phase7-contract` passes locally.
- `bun test --timeout 15000 scripts/host-control.test.ts` now passes locally.
- `bun run scripts/csh.ts verify .env.csh.local` passed locally on 2026-04-09 with
  `restart_status=0`, `browser_status=0`, and a verify-selected `browser_port`.
- Relay-backed restart recovery is now proven in the canonical verify loop via
  `scripts/restart-recovery.ts`.
- A fresh-checkout proof now exists via `scripts/fresh-checkout.ts`, which clones the repo into an
  isolated temporary directory, runs `bun install --frozen-lockfile`, and then runs
  `bun run scripts/csh.ts verify .env.csh.local` from that clone.
- Relay interruption and recovery are now proven in the canonical verify loop via
  `scripts/relay-recovery.ts`, with the loop selecting a temporary loopback relay port so it owns
  the relay process it interrupts.
- A longer-lived session proof now exists via `scripts/session-soak.ts`, which pushes high output
  through one session, keeps it alive read-only for a longer window, disconnects, and then
  reconnects to the same shell.

## Synchronization Touchpoints
- teaching surface: maybe; only if supported operator guarantees change
- audit state: yes; restart/verify findings will need live status
- startup/discovery surface: yes; active prompt and handoff need the new lane

## Required Work
- keep the loop TDD-driven so helper logic is covered before the end-to-end scripts rely on it
- preserve stable logs and clear failure surfaces for each new proof layer
- keep handoff and audit state aligned as each hardening slice closes

## Closed Slices

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

### Slice: fresh-checkout verification
- Goal: prove that the current repo can bootstrap and pass the canonical verify gate from an
  isolated clone rather than only from the worked tree.
- Write set:
  - `scripts/fresh-checkout.ts`
  - `scripts/fresh-checkout.test.ts`
  - `package.json`
- Non-goals:
  - replacing the canonical local working-tree verify path
  - public-relay compatibility rerun
  - relay fault injection
- Gate:
  - `bun test --timeout 15000 scripts/fresh-checkout.test.ts`
  - outside the sandbox, `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun-install bun run scripts/fresh-checkout.ts`
- Closeout:
  - the repo has a repeatable isolated-clone verification command
  - the hardening lane is no longer relying only on this worked tree for proof

### Next Slice
- Goal: move from longer-lived session hardening to explicit expiry and browser-age proof.
- Candidate write set:
  - `scripts/run-autonomous-loop.sh`
  - targeted idle-expiry helpers
  - browser-age verification scripts
  - `handoff.md`
  - `docs/audits/*.md`
- Candidate gates:
  - explicit idle-expiry proof with short verify-only TTLs
  - reconnect after longer idle windows
  - browser attach after extended session age

## Acceptance Gates
- claims and proof table
- environment matrix
- negative tests
- trust-boundary review
- lifecycle/restart behavior
- operator UX review

## Exit Criteria
- the canonical verify loop covers relay-backed host restart recovery
- a fresh-checkout proof exists for isolated bootstrap + verify
- the canonical verify loop covers relay interruption and recovery on a verify-owned relay
- the canonical verify loop covers a longer-lived high-output + keepAlive + delayed reconnect path
- restart-proof logs are stable enough for autonomous follow-on passes
- open restart-related risks are either closed or narrowed explicitly in docs
