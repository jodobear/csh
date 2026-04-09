# Phase 8: Verification Hardening

Status: complete 2026-04-09.

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
  `idle_expiry_status=0`, `aged_browser_attach_status=0`, `soak_status=0`,
  `relay_recovery_status=0`, `restart_status=0`, `proxy_status=0`, `exec_status=7`,
  `browser_status=0`, and a verify-selected `browser_port`.
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
- An explicit idle-expiry proof now exists via `scripts/idle-expiry.ts`, which runs against a
  short-TTL verify-only host and confirms the original session closes before a fresh session opens.
- An aged browser attach proof now exists via `scripts/aged-browser-attach.ts`, which keeps a
  named session alive, waits for it to age, and then attaches through the authenticated browser
  bridge against that existing session.
- A release-grade verification path now exists via `scripts/release-verify.ts` and
  `csh verify release`, which rerun the fresh-checkout proof and public-relay compatibility proof
  without overloading the routine local/private-relay gate.

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

### Slice: idle expiry and aged browser attach
- Goal: prove that the canonical verify loop catches idle-session expiry under short verify-only
  TTLs and still allows browser attach against an already-aged live session.
- Write set:
  - `scripts/idle-expiry.ts`
  - `scripts/aged-browser-attach.ts`
  - `scripts/run-autonomous-loop.sh`
  - `src/contextvm-gateway.ts`
  - `src/server/pty-session-manager.ts`
  - `scripts/pty-session.py`
  - `package.json`
- Non-goals:
  - changing production default TTLs
  - turning fresh-checkout verification into an every-run gate
  - public-relay compatibility rerun
- Gate:
  - `bun test --timeout 15000 scripts/host-control.test.ts`
  - `bun run test:phase7-contract`
  - `bun run scripts/csh.ts verify .env.csh.local`
- Closeout:
  - `verify` now proves short-TTL idle expiry with stable `idle-expiry.log`, `idle-host.log`, and
    `verify-idle.env` artifacts
  - `verify` now proves browser attach against an aged named session with a stable
    `aged-browser-attach.log` artifact

### Slice: routine versus release-grade verification
- Goal: keep `csh verify` as the routine autonomous gate, move heavier proofs into a checked-in
  release-grade flow, and rerun public-relay compatibility on the hardened native-PTY backend.
- Write set:
  - `scripts/release-verify.ts`
  - `scripts/release-verify.test.ts`
  - `scripts/csh.ts`
  - `package.json`
  - `scripts/README.md`
  - `docs/guides/server-setup.md`
- Non-goals:
  - changing routine verify coverage again
  - turning public-relay compatibility into the primary operator path
  - starting the next engineering phase
- Gate:
  - `bun test --timeout 15000 scripts/release-verify.test.ts`
  - `bun test --timeout 15000 scripts/host-control.test.ts`
  - `bun run test:phase7-contract`
  - `bun run scripts/csh.ts verify .env.csh.local`
  - outside the sandbox, `bun run scripts/release-verify.ts .env.csh.local`
- Closeout:
  - `csh verify` remains the routine local/private-relay-first gate
  - release-grade proof now has a checked-in command and stable logs for fresh checkout and
    public-relay compatibility
  - Phase 8 can leave the startup path because its exit criteria are satisfied

## Phase Closeout
- Routine verification is now `csh verify`.
- Release-grade verification is now `csh verify release` or `bun run scripts/release-verify.ts`.
- Fresh-checkout reproducibility and public-relay compatibility have both been rerun through
  checked-in code on 2026-04-09.
- The next engineering lane should start from a new phase prompt rather than extending Phase 8.

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
- the canonical verify loop covers explicit idle expiry under short verify-only TTLs
- the canonical verify loop covers browser attach against an already-aged live session
- a checked-in release-grade verification flow exists for fresh-checkout and public-relay proof
- restart-proof logs are stable enough for autonomous follow-on passes
- open restart-related risks are either closed or narrowed explicitly in docs
