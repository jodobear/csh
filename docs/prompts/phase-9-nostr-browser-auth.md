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

## Closeout

Phase 9 is ready for merge once the docs/handoff surface stays aligned with the branch reality and the
branch is pushed.
