# Handoff

## Current Status

- Active phase: none
- Current objective: deployment polish, packaging decisions, and operator UX cleanup
- Repo state:
  - Git repository initialized on `master`
  - `master` is pushed to `origin/master`
- Active prompt: none

## Read First

- [docs/README.md](/workspace/projects/csh/docs/README.md)
- [README.md](/workspace/projects/csh/README.md)
- [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md)
- [csh-cli-operations.md](/workspace/projects/csh/docs/guides/csh-cli-operations.md)

## Current Product State

- `csh` is a repo-local `tmux`-backed interactive shell over ContextVM/Nostr with CLI and browser clients.
- Preferred operator transport is now explicit:
  - private relay you control
  - SSH tunnel fallback
  - `relay.contextvm.org` only as a secondary compatibility check
- Browser UI remains loopback-bound by default and token-gated for POST requests.

## Claims Vs Proof

| Claim | Proof | Result | Unproven edge cases |
| --- | --- | --- | --- |
| Controlled-relay shell works | `bin/csh exec "pwd" /tmp/csh-browser-test.env` over repo-local `nak` returned `/workspace/projects/csh` | proven | remote-network reachability still depends on operator networking |
| Named shell reconnect works | `bin/csh shell --session live-test ...` can reuse the same server-side session | proven | remote human UX should be rerun when shell ergonomics change |
| Browser-over-ContextVM works on a controlled relay | `bin/csh browser /tmp/csh-browser-test.env` plus token-gated `POST /api/session/write` rendered `__BROWSER__/workspace/projects/csh` and the Playwright snapshot captured it | proven | browser remains operator-local, not public multi-user |
| Ownership and browser auth are enforced server-side | unauthenticated `session_open`, wrong-owner polling, non-loopback bind, and missing-token browser POSTs all fail | proven | transport-specific identity assumptions still matter for authenticated remote paths |
| Restart recovery and cleanup exist | local restart and TTL cleanup tests with shared `CSH_SESSION_STATE_DIR` and `CSH_TMUX_SOCKET` passed | proven locally | relay-backed restart was not rerun separately |
| Public relay is acceptable as primary transport | latest `bin/csh exec ... /tmp/csh-live-test.env` against `wss://relay.contextvm.org` | not proven; failed with relay connection errors and `Publish event timed out` before `initialize` | could improve later, but not the default path now |

## Open Risks

- `relay.contextvm.org` remains flaky in this environment and should not be the primary operator relay.
- The backend is still `tmux send-keys` plus snapshot capture, so fidelity is below a raw PTY byte stream.
- The browser UI is an operator-side bridge, not a public multi-user shell surface.

## Unsupported Behaviors

- Raw byte-perfect PTY streaming is not implemented.
- Infinite durable scrollback is not implemented.
- Remote browser exposure is not a supported default workflow.

## Next Actions

1. Decide whether `bin/csh` remains a Bun-backed repo CLI or becomes a packaged binary.
2. Expand the user-facing setup guide around the now-proven private-relay workflow.
3. Improve operator UX where it matters most: shell ergonomics, browser reconnect affordances, and one-shot output handling.
4. Keep public-relay testing opportunistic and secondary.
