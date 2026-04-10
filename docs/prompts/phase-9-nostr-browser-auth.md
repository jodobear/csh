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
  - `profile_browser_status=0`
  - `invite_onboarding_status=0`
- release verify is green on this branch with:
  - `release_verify_public_shell_status=0`
  - `release_verify_public_browser_static_status=0`
- live operator findings after branch verification:
  - browser auth/onboarding works end to end with `NIP-07` plus invite redemption
  - interactive shell UX is acceptable on a low-latency private relay path
  - `relay.contextvm.org` remains too laggy for primary interactive shell use
  - ContextVM solved host reachability, but browser distribution and relay bootstrap remain explicit product work

## Outcome

- persisted allowlist and invite state are implemented and exercised through CLI admin commands
- shell access is now enforced at the `session_*` tool boundary by authenticated signer pubkey
- the browser path is now a static Nostr-native client with signer selection, invite onboarding,
  saved profiles, and deterministic preview/release proofs
- the routine gate proves static browser connect, saved-profile connect, invite onboarding, aged
  attach, restart recovery, relay recovery, soak, idle expiry, proxy smoke, and exit-status
  reporting
- the release-grade gate proves fresh-checkout verification plus public-relay shell and
  browser-static compatibility
- the primary operator posture is now explicit:
  - private relay first
  - SSH tunnel fallback when relay reachability is constrained
  - `relay.contextvm.org` only as a compatibility path
- the main product lesson is also explicit: ContextVM removes the need for direct host reachability,
  but browser asset delivery and relay bootstrap/discovery still need deliberate productization

## Phase Exit

- deterministic unit/browser suite passed on branch
- `bun run test:phase7-contract` passed on branch
- `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun-install bun run scripts/csh.ts verify .env.csh.local`
  passed on branch with `browser_static_status=0`, `profile_browser_status=0`, and
  `invite_onboarding_status=0`
- outside the sandbox, `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun-install bun run scripts/release-verify.ts .env.csh.local`
  passed on branch with `release_verify_public_shell_status=0` and
  `release_verify_public_browser_static_status=0`

## Next Phase Inputs

- push `phase-9-nostr-browser`
- rerun the full proof surface on pushed state if desired
- merge the branch back into `master`
- keep future product work focused on relay/bootstrap polish or distribution packaging, not on
  reverting to host-local browser auth

## Closeout

Phase 9 is complete on `phase-9-nostr-browser`. The branch is ready to push and then merge back
into `master`.
