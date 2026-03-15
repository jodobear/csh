# Comms Transcript

Append-only project communication history.

## Entries

### YYYY-MM-DD HH:MM TZ

- Who:
- When:
- What:
- Session:

### 2026-03-14 21:35 WET

- Who: Codex
- When: 2026-03-14 21:35 WET
- What: Completed startup-order reading, confirmed Phase 0 buy-before-build constraints, and added the first candidate comparison note recommending ContextVM transport plus `terminal-mcp` as the initial bake-off target.
- Session: local repo execution

### 2026-03-15 00:25 WET

- Who: Codex
- When: 2026-03-15 00:25 WET
- What: Ran the first bounded bake-off. `terminal-mcp` failed to compile against the current `rmcp` API. `terminal_mcp` built successfully, served MCP over local HTTP, and preserved shell session state across repeated `persistent_shell` calls. Updated the research note, handoff, and decision log to make `terminal_mcp` the first implementation target.
- Session: local repo execution

### 2026-03-15 01:46 WET

- Who: Codex
- When: 2026-03-15 01:46 WET
- What: Executed Phase 1 thin composition. Added repo-local runtime/install scripts, host launcher, env template, and Bun smoke client. Verified the end-to-end path over `wss://relay.contextvm.org`: `gateway-cli` wrapped `terminal_mcp`, the Bun client connected through ContextVM, `tools/list` succeeded, and `persistent_shell` preserved state across `pwd`, `cd /tmp`, `pwd`.
- Session: local repo execution

### 2026-03-15 02:07 WET

- Who: Codex
- When: 2026-03-15 02:07 WET
- What: Added a private-by-default env bootstrap, reconnect/session cleanup lifecycle test, `proxy-cli` wrapper, and an autonomous runner. The autonomous loop passed the direct smoke and lifecycle checks over `wss://relay.contextvm.org`, confirmed session continuity across reconnect and new PID creation after session close, and showed that the current `proxy-cli` release binary fails with a Deno `NotCapable` hostname-permission error. Updated the project state to make the direct Bun client the default operator path and moved the active work to Phase 2 gap closure only.
- Session: local repo execution

### 2026-03-15 02:21 WET

- Who: Codex
- When: 2026-03-15 02:21 WET
- What: Closed the remaining local gaps. Replaced the broken external `proxy-cli` dependency with a repo-local SDK stdio proxy, lowered default client log noise to `CVM_LOG_LEVEL=error`, and reran the autonomous loop. The direct path, lifecycle path, and stdio proxy path all passed over `wss://relay.contextvm.org`.
- Session: local repo execution

### 2026-03-15 02:26 WET

- Who: Codex
- When: 2026-03-15 02:26 WET
- What: Removed the external `proxy-cli` binary from the repo workflow, added `scripts/operator.sh` as the single operator-facing entrypoint, and verified the new wrapper end-to-end with `operator.sh verify`.
- Session: local repo execution

### 2026-03-15 02:47 WET

- Who: Codex
- When: 2026-03-15 02:47 WET
- What: Promoted `bin/csh` to the stable public CLI, added config validation, hardened systemd-unit rendering, `csh exec`, a root guard for `host start`, and a short CLI operations guide. Verified `csh help`, `csh bootstrap`, `csh host check`, `csh host systemd-unit`, `csh verify`, `csh host start`, and `csh exec`.
- Session: local repo execution

### 2026-03-15 04:10 WET

- Who: Codex
- When: 2026-03-15 04:10 WET
- What: Ported the validated interactive shell and browser-terminal core from `csh-old` into `csh`. Added the repo-local `tmux`-backed `session_*` MCP server, repo-local ContextVM gateway, interactive TTY client, browser terminal stack, and CLI wiring for `csh shell` and `csh browser`. Verified the local stdio MCP server (`session_open` -> `session_write` -> `session_poll`), verified the browser asset bundle and local browser bridge, and confirmed that the repo-local host gateway starts. Relay-backed regression checks hit relay connection errors in this environment and still need a clean rerun.
- Session: local repo execution

### 2026-03-15 04:32 WET

- Who: Codex
- When: 2026-03-15 04:32 WET
- What: Added a generalized implementation-acceptance process update. Introduced `docs/process/implementation-gates.md`, updated the startup canon in `AGENTS.md`, and tightened the process and prompt templates so future implementation phases must explicitly cover claims-vs-proof, environment matrix, negative tests, trust boundaries, lifecycle/restart behavior, and operator UX before closure.
- Session: local repo execution

### 2026-03-15 05:18 WET

- Who: Codex
- When: 2026-03-15 05:18 WET
- What: Ran the first full acceptance-hardening audit against the new implementation gates, fixed the resulting shell/browser issues, and updated the repo proof record. The fix pass hardened server-side owner resolution, removed client-cwd assumptions from remote opens, made the browser UI loopback-by-default with token-gated POSTs, persisted tmux session metadata for restart recovery, added TTL scavenging, strengthened the autonomous verification loop, and recorded claims-vs-proof, negative tests, trust boundaries, lifecycle behavior, and operator UX limits in `handoff.md`.
- Session: local repo execution

### 2026-03-15 17:58 WET

- Who: Codex
- When: 2026-03-15 17:58 WET
- What: Closed the relay-backed proof gap. The root cause was a gift-wrap mismatch in the repo-local direct client helpers and stdio proxy: they omitted `GiftWrapMode.EPHEMERAL`, so they published kind `1059` while the interactive host path was listening for ephemeral kind `21059`. After fixing that, updating new env defaults to required encryption, and removing stale random `ownerId` use from the authenticated lifecycle test, the relay-backed direct, lifecycle, proxy, and browser-over-ContextVM paths all passed against `wss://relay.contextvm.org`. The same pass also fixed `csh exec` to preserve final pane output for short-lived commands and verified both browser-local and relay-backed browser interaction via headless Playwright.
- Session: local repo execution

### 2026-03-15 18:12 WET

- Who: Codex
- When: 2026-03-15 18:12 WET
- What: Corrected the repo workflow after discovering the project had no commits or remotes despite substantial local work. Added a plain startup git-state check to the canon and converted the existing tree into an honest retrospective local commit sequence so the current state is no longer only in the working tree.
- Session: local repo execution

### 2026-03-15 18:28 WET

- Who: Codex
- When: 2026-03-15 18:28 WET
- What: Cleaned up the repo layout by adding a top-level `README.md`, flattening the operational scripts from `scripts/phase1/` to `scripts/`, updating the CLI/package wiring, and pushing the current `master` branch to `origin/master`.
- Session: local repo execution

### 2026-03-15 19:12 WET

- Who: Codex
- When: 2026-03-15 19:12 WET
- What: Fixed a mode-specific config bug in `scripts/config.ts`. Client commands were failing early on missing host-only keys because the config loader eagerly required `GW_PRIVATE_KEY`. The loader now tolerates missing host-only or client-only keys and leaves mode enforcement to `validateConfig`, which was verified with a client-only env file.
- Session: local repo execution
