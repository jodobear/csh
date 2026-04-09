# Handoff

## Current Status

- Active phase: [phase-8-verification-hardening.md](/workspace/projects/csh/docs/prompts/phase-8-verification-hardening.md)
- Current objective: harden the autonomous verify loop around the native PTY backend, with
  restart recovery, fresh-checkout proof, relay interruption/recovery, longer-lived session
  proof, explicit idle-expiry proof, and aged browser attach proof now established
- Repo state:
  - Git repository initialized on `master`
  - `master` tracks `origin/master`
  - check `git status --short --branch` for the exact ahead/behind state at handoff time
- Working-tree truth:
  - the checked-in native PTY runtime is live on `master`
  - the working tree is runnable through the current autonomous gate
  - the hardening lane now has restart-recovery proof, an isolated fresh-checkout proof, and a
    relay interruption/recovery proof
  - the canonical verify loop now also exercises a longer-lived session soak with high output,
    read-only keepAlive polling, and delayed reconnect
  - the canonical verify loop now also exercises short-TTL idle expiry on a dedicated verify-only
    host and browser attach against an already-aged named session
- Canonical verify gate:
  - `bun test --timeout 15000 scripts/host-control.test.ts` passes locally
  - `bun test --timeout 15000 scripts/startup-env.test.ts` passes locally
  - `bun test --timeout 15000 scripts/fresh-checkout.test.ts` passes locally
  - `bun run test:phase7-contract` passes
  - `bun run scripts/csh.ts verify .env.csh.local` passed locally on 2026-04-09 with
    `idle_expiry_status=0`, `aged_browser_attach_status=0`, `soak_status=0`,
    `relay_recovery_status=0`, `restart_status=0`, `proxy_status=0`, `exec_status=7`, and
    `browser_status=0`
  - outside the sandbox, `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun-install bun run scripts/fresh-checkout.ts`
    passed on 2026-04-09 from an isolated clone
  - the verify loop now records stable artifact paths, including `host-control.log`,
    `phase7-contract.log`, `exec.log`, `idle-expiry.log`, `idle-host.log`, `verify-idle.env`,
    `aged-browser-attach.log`, `session-soak.log`, `relay.log`, `relay-recovery.log`,
    `relay-recovery-relay.log`, `host.log`, `restart-recovery.log`, `restart-host.log`,
    `proxy.log`, `browser.log`, and `browser-smoke.log`
- Active prompt: [phase-8-verification-hardening.md](/workspace/projects/csh/docs/prompts/phase-8-verification-hardening.md)
- Default audit postures for refinement work:
  - `security-exposure`
  - `operator-workflow`
  - `deployment-resilience`
- Latest live audit:
  - [security-exposure-2026-03-15.md](/workspace/projects/csh/docs/audits/security-exposure-2026-03-15.md)
  - [operator-workflow-2026-03-15.md](/workspace/projects/csh/docs/audits/operator-workflow-2026-03-15.md)
  - [deployment-resilience-2026-03-15.md](/workspace/projects/csh/docs/audits/deployment-resilience-2026-03-15.md)

## Read First

- [docs/README.md](/workspace/projects/csh/docs/README.md)
- [README.md](/workspace/projects/csh/README.md)
- [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md)
- [csh-cli-operations.md](/workspace/projects/csh/docs/guides/csh-cli-operations.md)
- [docs/audits/README.md](/workspace/projects/csh/docs/audits/README.md)

## Current Product State

- `csh` is a repo-local interactive shell over ContextVM/Nostr with CLI and browser clients.
- `csh` now has a Bun-backed install path that places a stable `csh` launcher on `PATH`.
- `csh` now also has a managed install lifecycle:
  - `csh install`
  - `csh upgrade`
  - `csh uninstall`
- Active operator/config naming now uses `csh`, not `phase1`:
  - default local env path is `.env.csh.local`
  - example env file is `.env.csh.example`
- Preferred operator transport is now explicit:
  - private relay you control
  - SSH tunnel fallback
  - `relay.contextvm.org` only as a secondary compatibility check
- Browser UI remains loopback-bound by default and token-gated for POST requests.
- Remote browser mode now requires explicit Basic Auth credentials before any page, asset, or API response is served.
- Startup paths now treat env files as data-only config, not shell code.
- CLI/operator surface now includes:
  - `csh install`
  - `csh upgrade`
  - `csh uninstall`
  - `csh version`
  - `csh status`
  - `csh doctor`
  - `csh config check`
  - `csh completion <bash|zsh|fish>`
- Current backend reality after the Phase 7 runtime recovery:
  - terminal I/O now runs through a native PTY helper rather than the former attach indirection
  - session state and output are persisted under `CSH_SESSION_STATE_DIR`, and detached PTY helpers survive manager restart
  - steady-state polling uses deltas when possible and falls back to full snapshot recovery when the cursor is absent or stale
  - scrollback depth is controlled by `CSH_SCROLLBACK_LINES` and defaults to `10000`
  - `csh exec` now returns the remote command exit status instead of always exiting successfully

## Baseline Claims Vs Proof

These proofs reflect the native-PTY backend plus the refreshed 2026-04-09 verification hardening.

| Claim | Proof | Result | Unproven edge cases |
| --- | --- | --- | --- |
| Controlled-relay shell works | `bin/csh exec "pwd" /tmp/csh-browser-test.env` over repo-local `nak` returned `/workspace/projects/csh` | proven | remote-network reachability still depends on operator networking |
| Named shell reconnect works | `csh shell --session live-test ...` can reuse the same server-side session | proven | remote human UX should be rerun when shell ergonomics change |
| Browser-over-ContextVM works on a controlled relay | `bin/csh browser /tmp/csh-browser-test.env` plus token-gated `POST /api/session/write` rendered `__BROWSER__/workspace/projects/csh` and the Playwright snapshot captured it | proven | browser remains operator-local, not public multi-user |
| Ownership and browser auth are enforced server-side | unauthenticated `session_open`, wrong-owner polling, non-loopback bind, and missing-token browser POSTs all fail | proven | transport-specific identity assumptions still matter for authenticated remote paths |
| Restart recovery and cleanup exist | local PTY-manager restart tests plus `bun run scripts/csh.ts verify .env.csh.local` on 2026-04-09 passed with `restart_status=0` and the `restart-recovery.log` proof | proven locally | public-relay restart remains unproven and is still secondary to the private-relay posture |
| Remote browser auth is enforced before page load | in-process browser auth check returned `401` for unauthenticated/wrong-password requests and `200` for correct credentials | proven locally | remote browser mode is still an explicitly opt-in operator workflow |
| Session metadata stays private on disk | isolated session-manager check produced session dir mode `700`, file mode `600`, and unchanged `lastActivityAt` across polling | proven locally | runtime depends on host filesystem honoring POSIX modes |
| Public relay compatibility works | outside the sandbox, `/tmp/csh-public-shell.sh` returned `/workspace/projects/csh` and `/tmp/csh-public-browser.sh` rendered `__BROWSER__/workspace/projects/csh` over `wss://relay.contextvm.org` | proven as a compatibility path | still not the preferred operator transport; private relay remains the default posture |
| `csh` can be installed as a normal user command | `bun run csh install --prefix /tmp/csh-install --no-runtime` created `/tmp/csh-install/bin/csh`, and `/tmp/csh-install/bin/csh version` returned `csh 0.1.0` | proven locally | launcher is intentionally repo-backed and assumes the checkout stays in place |
| The operator surface has stable preflight commands | `bun run csh doctor /tmp/csh-cli-polish.env`, `bun run csh status /tmp/csh-cli-polish.env`, and `bun run csh config check /tmp/csh-cli-polish.env` all succeeded against a fresh bootstrap config | proven locally | `doctor` is preflight evidence, not a substitute for end-to-end relay verification |
| install lifecycle is complete for the Bun-backed launcher | `bun run csh install --prefix /tmp/csh-lifecycle --no-runtime`, `bun run csh upgrade --prefix /tmp/csh-lifecycle --no-runtime`, and `bun run csh uninstall --prefix /tmp/csh-lifecycle` all succeeded | proven locally | uninstall only removes managed launchers unless forced |
| Native PTY runtime preserves reconnect, restart survival, byte-safe input, resize, high-output handling, browser forwarding, and exit-status reporting | `bun run test:phase7-contract` passed locally on 2026-04-08 | proven locally | live human browser ergonomics should still be rerun when the UI changes materially |
| The autonomous gate is strong enough to drive the native PTY lane | `bun run scripts/csh.ts verify .env.csh.local` passed locally on 2026-04-09 and reported `idle_expiry_status=0`, `aged_browser_attach_status=0`, `soak_status=0`, `relay_recovery_status=0`, `restart_status=0`, `exec_status=7`, `proxy_status=0`, `browser_status=0`, plus stable artifact paths for host-control/contract/idle/aged-browser/soak/relay/restart/exec/host/proxy/browser logs | proven locally | the audit set should stay fresh as the backend hardens further |
| The repo can bootstrap and pass verify from an isolated clone | outside the sandbox, `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun-install bun run scripts/fresh-checkout.ts` cloned the repo into `/tmp`, ran `bun install --frozen-lockfile`, and then passed `bun run scripts/csh.ts verify .env.csh.local` with `restart_status=0`, `proxy_status=0`, `exec_status=7`, and `browser_status=0` on 2026-04-09 | proven locally | it is still a separate hardening proof, not yet part of every routine verify run |
| The verify loop tolerates relay interruption on its private loopback relay path | local `bun run scripts/csh.ts verify .env.csh.local` on 2026-04-09 selected a verify-owned relay port, terminated that relay, started a replacement relay, reattached to the same named session, and finished with `relay_recovery_status=0` | proven locally | non-loopback or externally owned relay fault injection is still outside the canonical verify scope |
| The verify loop now covers a longer-lived session path beyond immediate reconnect | local `bun run scripts/csh.ts verify .env.csh.local` on 2026-04-09 ran `scripts/session-soak.ts`, pushed 800 lines through one session, kept it alive read-only for 6000 ms, disconnected for 6000 ms, and reattached with the same shell PID before finishing with `soak_status=0` | proven locally | longer-duration soak windows beyond the current verify budget are still outside the routine gate |
| The verify loop now proves idle-session expiry under short verify-only TTLs | local `bun run scripts/csh.ts verify .env.csh.local` on 2026-04-09 launched a short-TTL idle host, ran `scripts/idle-expiry.ts`, captured `closedAt` for the original session in `idle-expiry.log`, and then opened a fresh session with a different shell PID before continuing with `idle_expiry_status=0` | proven locally | production TTLs remain operator-configured and are intentionally longer than the verify-only TTL |
| The verify loop now proves browser attach against an already-aged live session | local `bun run scripts/csh.ts verify .env.csh.local` on 2026-04-09 ran `scripts/aged-browser-attach.ts`, waited 6000 ms after opening a named session, then attached through the authenticated browser bridge and captured `__BROWSER_ATTACH__/tmp` in `aged-browser-attach.log` before finishing with `aged_browser_attach_status=0` | proven locally | the proof is still on the private-relay path, not a public browser exposure path |

## Open Risks

- `relay.contextvm.org` now works as a compatibility path, but it should still not be the primary operator relay.
- The migrated backend now passes the layered contract and verify loops, including the browser-over-ContextVM smoke path.
- The canonical verify path is still local/private-relay-first; isolated fresh-checkout proof is
  still periodic rather than part of every routine verify pass, and public-relay compatibility is
  still secondary evidence rather than part of the main gate.
- The browser UI is an operator-side bridge, not a public multi-user shell surface.
- Interactive disconnect still uses a bounded grace window, not a hard delivery guarantee under a broken transport.
- The installed `csh` launcher is checkout-backed by design; moving or deleting the repo checkout breaks that launcher until it is reinstalled.

## Unsupported Behaviors

- Infinite durable scrollback is not implemented.
- Remote browser exposure is not a supported default workflow.
- The installed launcher is not a standalone packaged binary.

## Next Actions

1. Decide whether the isolated fresh-checkout proof should stay as a periodic hardening command or be folded into a broader release-grade verify flow.
2. Decide whether to capture a fresh public-relay compatibility rerun on the native PTY backend or keep the last public-relay proof as sufficient secondary evidence.
3. Decide whether the Phase 8 lane should add any stronger transport-fault or longer-duration soak coverage beyond the current canonical verify loop.

## Process Notes

- `docs/process/process-control.md` is now the canonical owner for control-surface roles, process-change reconciliation, and docs-surface drift rules.
- Use `DOC-<area>-<number>` IDs when the issue is docs/process routing drift rather than runtime behavior.
- Generated browser proof output is now ignored under `output/`. A stale root-owned `.csh-runtime/go-mod-cache` from older runtime installs may still require an interactive `sudo rm -rf .csh-runtime` outside Codex if an operator wants the workspace purged completely.
