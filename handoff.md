# Handoff

## Current Status

- Active phase: none
- Current objective: deployment polish, packaging decisions, and operator UX cleanup after the 2026-03-15 audit-remediation pass
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
- Preferred operator transport is now explicit:
  - private relay you control
  - SSH tunnel fallback
  - `relay.contextvm.org` only as a secondary compatibility check
- Browser UI remains loopback-bound by default and token-gated for POST requests.
- Remote browser mode now requires explicit Basic Auth credentials before any page, asset, or API response is served.
- Startup paths now treat env files as data-only config, not shell code.

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

## Open Risks

- `relay.contextvm.org` now works as a compatibility path, but it should still not be the primary operator relay.
- The backend is still `tmux send-keys` plus snapshot capture, so fidelity is below a raw PTY byte stream.
- The browser UI is an operator-side bridge, not a public multi-user shell surface.
- Interactive disconnect still uses a bounded grace window, not a hard delivery guarantee under a broken transport.

## Unsupported Behaviors

- Raw byte-perfect PTY streaming is not implemented.
- Infinite durable scrollback is not implemented.
- Remote browser exposure is not a supported default workflow.

## Next Actions

1. Decide whether to package `csh` beyond the current Bun-backed repo CLI.
2. Expand the user-facing setup guide around the now-proven private-relay workflow and authenticated browser path.
3. Keep public-relay testing opportunistic and secondary.

## Process Notes

- `docs/process/process-control.md` is now the canonical owner for control-surface roles, process-change reconciliation, and docs-surface drift rules.
- Use `DOC-<area>-<number>` IDs when the issue is docs/process routing drift rather than runtime behavior.
