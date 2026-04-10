# Phase 9: Nostr-Native Browser Auth

## Goal

Move the browser/operator path from the older bridge-oriented posture to a Nostr-native static client
with signer-based auth, host allowlisting, and invite onboarding, while keeping the native PTY backend
and ContextVM shell surface intact.

## Scope

- persisted allowlist and invite state
- tool-level auth enforcement for `session_*`
- auth admin CLI helpers
- static browser preview/client path with signer abstraction
- deterministic browser proofs for static client, aged attach, and invite onboarding
- routine and release-grade verify coverage for the new browser/auth path

## Out Of Scope

- replacing the native PTY backend
- changing the core ContextVM shell protocol
- public multi-user browser exposure as a default deployment posture

## Deterministic Gates

- `bun test --timeout 15000 src/auth/state.test.ts src/auth/server-contract.test.ts scripts/auth-cli.test.ts src/browser-static/storage.test.ts src/browser-static/signers.test.ts src/browser-static/signers-test.test.ts src/browser-static/app.test.ts scripts/release-verify.test.ts scripts/host-control.test.ts`
- `bun run test:phase7-contract`
- `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun-install bun run scripts/csh.ts verify .env.csh.local`
- outside the sandbox: `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun-install bun run scripts/release-verify.ts .env.csh.local`

## Current Branch State

- branch: `phase-9-nostr-browser`
- base stable branch: `master`
- routine verify is green on this branch with:
  - `idle_expiry_status=0`
  - `aged_browser_attach_status=0`
  - `soak_status=0`
  - `relay_recovery_status=0`
  - `restart_status=0`
  - `proxy_status=0`
  - `exec_status=7`
  - `browser_static_status=0`
  - `invite_onboarding_status=0`
- release verify is green on this branch with:
  - `release_verify_public_shell_status=0`
  - `release_verify_public_browser_static_status=0`
- live operator findings after branch verification:
  - browser auth/onboarding works end to end with `NIP-07` plus invite redemption
  - interactive shell UX is acceptable on a low-latency private relay path
  - `relay.contextvm.org` remains too laggy for primary interactive shell use
  - ContextVM solved host reachability, but browser distribution and relay bootstrap remain explicit product work

## Remaining TDD Slices

### Slice A: Browser Transport Parity

Goal: make the browser client reliable on the primary private-relay path without depending on ad hoc SSH tunneling for the relay leg.

TDD gates:
- add a relay/bootstrap model test that covers separate browser-origin and relay-origin configuration
- extend browser smoke to run against a distinct relay endpoint and prove `auth_status -> auth_redeem_invite -> session_open -> session_poll`
- keep `bun run test:phase7-contract` green

Closeout proof:
- `bun run scripts/csh.ts verify .env.csh.local` still passes
- a manual browser check on the primary private-relay path opens a shell without transport timeouts

### Slice B: Static Browser Distribution

Goal: stop treating `csh browser` as the only practical browser delivery path and make the static client independently hostable.

TDD gates:
- add a build/output test for the static bundle and asset manifest
- add a static-host smoke that serves `dist/browser-static` without the repo-local preview server and verifies the browser client still connects
- document the browser distribution contract in the guide surface

Closeout proof:
- `bun run csh:build-browser`
- static-host smoke passes against the same host/relay path as the preview smoke

### Slice C: Relay Bootstrap And Operator Profiles

Goal: make the operator path closer to “know the server pubkey and route profile” instead of hand-entering relay details every time.

TDD gates:
- add profile parsing and persistence tests for named relay/server presets
- add browser app tests for importing/selecting a saved profile
- add CLI tests for emitting a shareable profile payload without private keys

Closeout proof:
- browser can connect from a saved profile with no manual relay re-entry
- docs no longer imply that `npub` alone is sufficient without relay bootstrap

### Slice D: Phase 9 Merge Closeout

Goal: merge only after the product posture and proof surface match reality.

TDD gates:
- rerun the deterministic unit/browser suite
- rerun `bun run test:phase7-contract`
- rerun routine verify
- rerun release verify outside the sandbox

Closeout proof:
- prompt, handoff, and audits all reflect the final browser/auth posture
- branch is clean, pushed, and ready to merge to `master`

## Closeout

Phase 9 is ready for merge once the remaining slices above are closed, the docs/handoff surface stays
aligned with the branch reality, and the branch is pushed.
