# Handoff

## Current Status

- Active phase: none
- Current objective: keep the CLI productized and operator-friendly while deciding whether the next major step is distribution packaging or terminal-fidelity work
- Repo state:
  - Git repository initialized on `master`
  - `master` is pushed to `origin/master`
- Active prompt: none
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

- `csh` is a repo-local `tmux`-backed interactive shell over ContextVM/Nostr with CLI and browser clients.
- `csh` now has a Bun-backed install path that places a stable `csh` launcher on `PATH`.
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
  - `csh version`
  - `csh status`
  - `csh doctor`
  - `csh config check`
  - `csh completion <bash|zsh|fish>`

## Claims Vs Proof

| Claim | Proof | Result | Unproven edge cases |
| --- | --- | --- | --- |
| Controlled-relay shell works | `bin/csh exec "pwd" /tmp/csh-browser-test.env` over repo-local `nak` returned `/workspace/projects/csh` | proven | remote-network reachability still depends on operator networking |
| Named shell reconnect works | `bin/csh shell --session live-test ...` can reuse the same server-side session | proven | remote human UX should be rerun when shell ergonomics change |
| Browser-over-ContextVM works on a controlled relay | `bin/csh browser /tmp/csh-browser-test.env` plus token-gated `POST /api/session/write` rendered `__BROWSER__/workspace/projects/csh` and the Playwright snapshot captured it | proven | browser remains operator-local, not public multi-user |
| Ownership and browser auth are enforced server-side | unauthenticated `session_open`, wrong-owner polling, non-loopback bind, and missing-token browser POSTs all fail | proven | transport-specific identity assumptions still matter for authenticated remote paths |
| Restart recovery and cleanup exist | local restart and TTL cleanup tests with shared `CSH_SESSION_STATE_DIR` and `CSH_TMUX_SOCKET` passed | proven locally | relay-backed restart was not rerun separately |
| Remote browser auth is enforced before page load | in-process browser auth check returned `401` for unauthenticated/wrong-password requests and `200` for correct credentials | proven locally | remote browser mode is still an explicitly opt-in operator workflow |
| Session metadata stays private on disk | isolated session-manager check produced session dir mode `700`, file mode `600`, and unchanged `lastActivityAt` across polling | proven locally | runtime depends on host filesystem honoring POSIX modes |
| Public relay compatibility works | outside the sandbox, `/tmp/csh-public-shell.sh` returned `/workspace/projects/csh` and `/tmp/csh-public-browser.sh` rendered `__BROWSER__/workspace/projects/csh` over `wss://relay.contextvm.org` | proven as a compatibility path | still not the preferred operator transport; private relay remains the default posture |
| `csh` can be installed as a normal user command | `bun run csh install --prefix /tmp/csh-install --no-runtime` created `/tmp/csh-install/bin/csh`, and `/tmp/csh-install/bin/csh version` returned `csh 0.1.0` | proven locally | launcher is intentionally repo-backed and assumes the checkout stays in place |
| The operator surface has stable preflight commands | `bun run csh doctor /tmp/csh-cli-polish.env`, `bun run csh status /tmp/csh-cli-polish.env`, and `bun run csh config check /tmp/csh-cli-polish.env` all succeeded against a fresh bootstrap config | proven locally | `doctor` is preflight evidence, not a substitute for end-to-end relay verification |

## Open Risks

- `relay.contextvm.org` now works as a compatibility path, but it should still not be the primary operator relay.
- The backend is still `tmux send-keys` plus snapshot capture, so fidelity is below a raw PTY byte stream.
- The browser UI is an operator-side bridge, not a public multi-user shell surface.
- Interactive disconnect still uses a bounded grace window, not a hard delivery guarantee under a broken transport.
- The installed `csh` launcher is checkout-backed by design; moving or deleting the repo checkout breaks that launcher until it is reinstalled.

## Unsupported Behaviors

- Raw byte-perfect PTY streaming is not implemented.
- Infinite durable scrollback is not implemented.
- Remote browser exposure is not a supported default workflow.
- The installed launcher is not a standalone packaged binary.

## Next Actions

1. Decide whether the next step is standalone packaging/distribution or deeper terminal-fidelity work.
2. If the current Bun-backed install model remains, add a light upgrade/uninstall story around it.
3. If operator fidelity matters more, scope the next phase around PTY/terminal behavior rather than more CLI surface.

## Process Notes

- `docs/process/process-control.md` is now the canonical owner for control-surface roles, process-change reconciliation, and docs-surface drift rules.
- Use `DOC-<area>-<number>` IDs when the issue is docs/process routing drift rather than runtime behavior.
