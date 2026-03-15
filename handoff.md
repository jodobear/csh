# Handoff

## Current State

- Active phase: Phase 3 acceptance hardening complete
- Active pm mode: buy-before-build reset
- Active worker lanes:
  - None recorded yet.
- Repo state:
  - Git repository initialized locally on `master`.
  - Current work is committed locally on `master` and pushed to `origin/master`.
- Current objective: the core shell and browser flows are proven on a controlled relay; the next work should focus on deployment polish, packaging decisions, and operator-facing cleanup rather than unresolved core proof gaps
- Current research:
  - First candidate comparison note added at `docs/references/local/2026-03-14-private-remote-shell-over-nostr-candidates.md`.
  - The original buy-before-build bake-off proved ContextVM transport viability and showed that `terminal_mcp` was good enough for a persistent command shell, but not for a proper interactive terminal.
  - Autonomous loop note added at `docs/references/local/2026-03-15-operator-path-and-session-lifecycle.md`.
  - The validated `csh-old` donor code has now been ported into this repo as a repo-local `tmux`-backed MCP server in `src/main.ts`, a ContextVM gateway in `src/contextvm-gateway.ts`, an interactive TTY client in `src/contextvm-interactive-client.ts`, and a browser terminal stack under `src/browser/`.
  - The repo process has been tightened with a new startup-canon artifact at `docs/process/implementation-gates.md`, plus template updates so future implementation phases must record claims-vs-proof, negative testing, trust boundaries, lifecycle behavior, and operator UX checks before closure.
  - Private-by-default allowlisting remains the default host posture, and the repo-local gateway now enables authenticated client pubkey injection for owner-bound sessions.
  - A repo-local SDK stdio proxy path now works too, so MCP-host compatibility is no longer blocked on the external `proxy-cli` artifact.
  - A stable CLI entrypoint now exists at `bin/csh` for bootstrap, runtime, host, direct, lifecycle, proxy, exec, shell, browser, systemd-unit rendering, and full verification.
  - `scripts/operator.sh` now exists only as a compatibility shim to `bin/csh`.
  - The repo no longer depends on the external `proxy-cli` binary for normal operation.
  - The controlled-relay regression gap is now closed. The root cause was a transport mismatch in the repo-local client helpers and stdio proxy: they were publishing NIP-59 gift wraps as kind `1059` because `giftWrapMode` was omitted, while the interactive host path expected ephemeral gift wrap kind `21059`. `scripts/client-common.ts` and `scripts/proxy-stdio.ts` now force `GiftWrapMode.EPHEMERAL`.
  - New generated env files now default to `required` encryption for both the host gateway and client/proxy paths, matching the validated `csh-old` donor path and the now-proven controlled-relay flow.
  - The `csh exec` path now captures final pane output for short-lived commands by snapshotting dead tmux panes before they are reported closed.
  - The startup canon now requires a plain git-state check so repo initialization, branch, HEAD/no-commit state, remotes, and local-only work are surfaced immediately instead of assumed.
  - The operational script layout has been flattened from `scripts/phase1/` to `scripts/`, and the repo now has a top-level `README.md`.
  - The config loader now tolerates mode-specific env files, so client commands like `csh exec` no longer fail early on missing host-only keys such as `GW_PRIVATE_KEY`.
  - Explicit shell session names now work as real reconnect handles, and one-shot `csh exec` output now strips tmux's dead-pane footer.
  - Intentional local `csh shell` disconnect now suppresses expected teardown noise such as `Connection closed` and `Publish event timed out`, so the normal disconnect path is cleaner.
  - The repo now has a deterministic private-relay helper at `scripts/start-test-relay.sh` and a server/client transport guide at `docs/guides/server-setup.md`.
  - The controlled browser path is now live-proven again: the browser UI connected through the repo-local gateway on a `nak` relay and rendered `__BROWSER__/workspace/projects/csh` in the terminal view.
  - `relay.contextvm.org` is still not reliable in this environment. The latest rerun from the current code failed during relay connection/publish with `Publish event timed out` before `initialize`.
- Last verified commands:
  - `command -v bun` -> `/home/at/.bun/bin/bun`
  - `command -v cargo` -> `/home/at/.cargo/bin/cargo`
  - `command -v go` -> `/usr/local/go/bin/go`
  - `bun install`
  - `bin/csh bootstrap /tmp/csh-interactive.env`
  - `bin/csh host check /tmp/csh-interactive.env`
  - local stdio MCP verification against `src/main.ts`: `tools/list` returned `session_open`, `session_write`, `session_resize`, `session_signal`, `session_poll`, `session_close`
  - local stdio MCP verification against `src/main.ts`: `session_open` -> `session_write("pwd\n")` -> `session_poll` returned `/workspace/projects/csh`
  - browser bundle verification: `Bun.build({ entrypoints: ["./src/browser/app.ts"], target: "browser" })` succeeded
  - local bridge verification: `createLocalShellBridge()` opened and closed a `session_open` session successfully
  - `scripts/start-host.sh /tmp/csh-interactive.env` started the repo-local ContextVM gateway successfully
  - unauthenticated-owner negative test: `parseToolResult(client.callTool({ name: "session_open", arguments: { command: "/bin/sh", cols: 80, rows: 24 } }))` now fails with `Authenticated client identity is required for session access`
  - owner-isolation negative test: opening a session as `alice` and polling it as `bob` now fails with `Session ... is owned by a different actor`
  - browser loopback negative test: `CSH_BROWSER_HOST=0.0.0.0 bun run src/browser/server.ts` now fails unless `CSH_BROWSER_ALLOW_REMOTE=1`
  - browser token negative test: `POST /api/session/open` without `x-csh-browser-token` now returns `403 {"error":"Missing or invalid browser API token"}`
  - restart recovery verification: a session opened under one `src/main.ts` process remained reachable from a new process when `CSH_SESSION_STATE_DIR` and `CSH_TMUX_SOCKET` were reused
  - closed-session cleanup verification: expired closed-session state files are scavenged on the next server run when the cleanup interval and TTL elapse
  - controlled-relay exec verification: `bin/csh exec "pwd" /tmp/csh-browser-test.env` returned `/workspace/projects/csh` through a repo-local `nak` relay on `ws://127.0.0.1:10553`
  - controlled-relay browser verification: `bin/csh browser /tmp/csh-browser-test.env` served `http://127.0.0.1:4319`, `POST /api/session/write` rendered `__BROWSER__/workspace/projects/csh`, and Playwright snapshot `page-2026-03-15T21-26-25-743Z.yml` captured that output
  - public-relay compatibility rerun: `bin/csh exec 'printf "__PUBLIC__%s\n" "$PWD"' /tmp/csh-live-test.env` failed against `wss://relay.contextvm.org` with relay connection errors and `Publish event timed out` before `initialize`
  - live browser-local verification: headless Playwright loaded `http://127.0.0.1:4318`, sent `pwd`, and rendered `/workspace/projects/csh`
  - local shell disconnect verification: `bin/csh shell --session disconnect-clean /tmp/csh-browser-test.env` no longer emitted the previous teardown stack traces during an intentional local disconnect check

## Claims Vs Proof

| Claim | Proof | Result | Unproven edge cases |
| --- | --- | --- | --- |
| Repo-local MCP server exposes the interactive `session_*` surface | local stdio MCP verification against `src/main.ts`: `tools/list` returned `session_open`, `session_write`, `session_resize`, `session_signal`, `session_poll`, `session_close`; relay-backed `bin/csh direct` returned the same tool list | proven locally and relay-backed | none recorded |
| Repo-local MCP server can open a shell and return output | local stdio MCP verification against `src/main.ts`: `session_open` -> `session_write("pwd\n")` -> `session_poll` returned `/workspace/projects/csh`; relay-backed `bin/csh direct` and `bin/csh exec` returned `/workspace/projects/csh` and `/tmp` as expected | proven locally and relay-backed | none recorded beyond tmux/snapshot limitations |
| Browser assets build cleanly | `Bun.build({ entrypoints: ["./src/browser/app.ts"], target: "browser" })` succeeded | proven locally | none recorded |
| Browser local bridge can open and close a session | `createLocalShellBridge()` opened and closed a `session_open` session successfully; headless Playwright loaded `http://127.0.0.1:4318`, sent `pwd`, and rendered `/workspace/projects/csh` | proven locally | browser remains an operator-local bridge, not a public multi-user surface |
| Browser-over-ContextVM works on a controlled relay | `nak` relay on `ws://127.0.0.1:10553` plus `bin/csh browser /tmp/csh-browser-test.env` served a live page on `http://127.0.0.1:4319`; `POST /api/session/write` rendered `__BROWSER__/workspace/projects/csh` and Playwright snapshot `page-2026-03-15T21-26-25-743Z.yml` captured that output | proven locally over controlled relay | browser remains an operator-local bridge, not a public multi-user surface |
| Repo-local host gateway starts | `scripts/start-host.sh /tmp/csh-relay-required.env` started the repo-local ContextVM gateway successfully and served relay-backed clients | proven locally and relay-backed | none recorded |
| Session access requires authenticated or explicitly forced identity by default | local stdio negative test: `session_open` without authenticated metadata, `CSH_FORCED_OWNER_ID`, or `CSH_ALLOW_UNAUTHENTICATED_OWNER=1` fails with `Authenticated client identity is required for session access`; relay-backed flows succeed without spoofed `ownerId` values because the server resolves the authenticated client pubkey | proven locally and relay-backed | unauthenticated local stdio still requires explicit override by design |
| Cross-owner access is denied | local stdio negative test: session opened as `alice`, polled as `bob`, returned `Session ... is owned by a different actor` | proven locally | relay-backed multi-client cross-owner test not rerun separately, but authenticated owner binding is now exercised by the live relay-backed flows |
| Browser UI is loopback-only by default and rejects unsigned API POSTs | local browser negative tests: non-loopback bind without opt-in fails, and API POST without `x-csh-browser-token` returns `403`; live browser-local and browser-over-ContextVM pages both worked on loopback | proven locally and live-browser | browser UI remains an operator-local bridge, not a public multi-user surface |
| Session metadata survives server restart and expired closed sessions are scavenged | local stdio restart and cleanup tests with shared `CSH_SESSION_STATE_DIR` and `CSH_TMUX_SOCKET` recovered a live session and later removed expired closed-session files | proven locally | relay-backed restart path was not rerun separately, but the backing session manager behavior is now stable locally |
| Intentional CLI disconnect avoids noisy teardown traces | local TTY disconnect check against `/tmp/csh-browser-test.env` no longer emitted the previous `Connection closed` and `Publish event timed out` stack traces when disconnecting intentionally | partially proven locally | a fresh human rerun from a remote client is still useful as a final UX confirmation |

## Environment Matrix

- Local stdio MCP server: partially proven
- Local browser bridge: proven
- Local host startup: proven
- Controlled relay path (`nak` on loopback/private host): proven for exec, named-session shell reconnect, and browser-over-ContextVM
- Same-host relay path over `wss://relay.contextvm.org`: latest rerun failed with relay connection errors and publish timeout before `initialize`
- Split client/server filesystem path: previous cwd assumptions were invalid; defaults have been changed to avoid client-path coupling and the relay-backed rerun now passes without client-path injection
- Restart/redeploy path: proven locally with shared `CSH_SESSION_STATE_DIR` and `CSH_TMUX_SOCKET`
- Browser HTTP path: proven locally for loopback bind, per-page token injection, token-required API POSTs, and live browser interaction

## Negative Test Record

- `session_open` without authenticated metadata or an explicit override is rejected.
- Accessing a session with the wrong `ownerId` is rejected.
- Browser startup on a non-loopback host now fails unless `CSH_BROWSER_ALLOW_REMOTE=1`.
- Browser API POST without `x-csh-browser-token` is rejected with HTTP 403.
- The autonomous verification loop now fails early if the host never reaches readiness instead of sleeping blindly.
- Relay client helpers and the stdio proxy now prove the correct gift-wrap mode by publishing outer kind `21059` instead of `1059`.
- `relay.contextvm.org` still times out in this environment even after the app-side fixes, so public-relay proof remains explicitly non-blocking.

## Trust Boundaries

- The authoritative shell-session owner is now resolved server-side in `src/main.ts`.
- Trusted identities:
  - `CSH_FORCED_OWNER_ID` for local forced-owner bridges like `browser-local`
  - `_meta.clientPubkey` when the transport injects authenticated client metadata
- Untrusted caller data:
  - browser HTTP request bodies
  - MCP `ownerId` values when no authenticated metadata or forced owner is present
  - client cwd assumptions
- Authorization is enforced in the MCP server by matching the resolved actor ID against the stored `ownerId` for each session.
- Browser HTTP auth is intentionally narrow:
  - loopback-only by default
  - random per-process API token required for POST requests
  - same-origin POST check
  - still not a public multi-user auth system

## Resource Lifecycle

- Sessions are created as tmux sessions and persisted to `.csh-runtime/sessions` or `CSH_SESSION_STATE_DIR`.
- Disconnect does not close a session by default; reconnect uses the same `sessionId`.
- Explicit close kills the tmux session and marks the metadata closed.
- Restart recovery works when the tmux socket and session-state directory are reused.
- Idle sessions are scavenged after `CSH_SESSION_IDLE_TTL_SECONDS`.
- Closed-session metadata is scavenged after `CSH_CLOSED_SESSION_TTL_SECONDS`, including on a later server run.

## Operator UX

- Primary CLI workflows remain `bin/csh exec`, `bin/csh shell`, `bin/csh browser`, and `bin/csh verify`.
- Reconnect is session-ID based for the CLI shell and local-storage based for the browser UI.
- Browser and CLI interactive views are snapshot-driven over tmux capture, not raw PTY byte streams.
- Error visibility is now improved for readiness failures, auth failures, and owner-mismatch failures.
- Default log posture remains `CVM_LOG_LEVEL=error`.
- Controlled-relay browser interaction is now live-proven in addition to the local browser path.
- Preferred operator transport is now explicit: private relay first, SSH tunnel second, public relay only as a secondary compatibility check.

## Open Risks

- The browser server is intended to stay loopback-bound by default; non-loopback use is now explicit but still deserves careful operator review.
- The tmux backend is still `send-keys` based, so terminal fidelity remains below a raw PTY byte-stream design.
- `relay.contextvm.org` remains operationally flaky in this environment, so it is still a risk if treated as the primary operator relay.

## Unsupported Behaviors

- Raw byte-perfect PTY streaming is not implemented; some timing-sensitive or control-byte-heavy programs may still behave imperfectly.
- Durable infinite scrollback is not implemented; tmux capture remains bounded and the browser UI is still snapshot-redraw based rather than stream-native.
- The browser UI is not a public multi-user shell surface; it is an operator-side client bridge and should not be exposed openly.

## Open Questions

- What is the minimum packaging needed to make the interactive `csh shell` and `csh browser` paths easy to hand to a real user?
- Should `bin/csh` stay a Bun-backed repo CLI, or eventually become a packaged standalone binary?
- Do we want browser reconnect to remain client-side best effort via local storage, or add an explicit browser-side session picker later?

## Next Actions

1. Decide whether `bin/csh` should remain a Bun-backed repo CLI or become a packaged standalone binary.
2. Expand the user-facing setup guide now that the interactive shell, controlled relay, and browser paths have stable proof again.
3. Improve operator UX only where it matters most: better `csh shell` ergonomics, browser reconnect affordances, and clearer output handling for one-shot execs.
4. If public-relay support still matters, test `relay.contextvm.org` opportunistically but do not couple primary operator workflows to it.
5. Keep appending project communication to `docs/comms/transcript.md`.

## Review Checkpoint

- Review recorded on 2026-03-15:
  - Chosen path: repo-local `tmux`-backed `session_*` MCP server + repo-local ContextVM gateway + interactive CLI client + browser UI.
  - Rejected alternatives: `terminal_mcp` was sufficient for a persistent command shell but not for a proper interactive terminal; `terminal-mcp` remains blocked by current `rmcp` build failures; the external `proxy-cli` binary remains unnecessary because the local SDK proxy covers the stdio bridge path.
  - Concrete remaining gaps: packaging polish, user-facing guide expansion, and incremental operator UX improvements around the tmux/snapshot model.
  - Custom code justification: the interactive terminal and browser UI are now proven product requirements, so porting the validated `csh-old` session/browser core into this repo is justified adaptation rather than speculative build-out.
