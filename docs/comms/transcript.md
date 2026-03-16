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

### 2026-03-15 20:55 WET

- Who: Codex
- When: 2026-03-15 20:55 WET
- What: Fixed two shell UX bugs after live remote testing. `csh exec` now strips tmux's dead-pane footer from one-shot output, and explicit session names like `bin/csh shell --session live-test ...` now behave as real reconnect handles by creating or reusing the named server-side session instead of failing with `Unknown session`.
- Session: local repo execution

### 2026-03-15 21:27 WET

- Who: Codex
- When: 2026-03-15 21:27 WET
- What: Added shutdown-noise suppression for intentional `csh shell` disconnect, added `scripts/start-test-relay.sh` as a deterministic private-relay helper, wrote `docs/guides/server-setup.md`, and revalidated the browser path over a controlled `nak` relay. The browser UI served on `http://127.0.0.1:4319`, the token-gated bridge rendered `__BROWSER__/workspace/projects/csh`, and the live Playwright snapshot captured that output. A fresh current-code rerun against `wss://relay.contextvm.org` still failed before `initialize` with relay connection errors and `Publish event timed out`, so the project now records a controlled private relay as the primary operator posture and the public relay only as a secondary compatibility check.
- Session: local repo execution

### 2026-03-15 21:45 WET

- Who: Codex
- When: 2026-03-15 21:45 WET
- What: Refined the repo process using lessons from the `nzdk` playbook. Added `docs/README.md` as the docs index, shortened the startup read set in `AGENTS.md`, tightened the implementation gate with audit-posture and closeout-consistency rules, and rewrote `handoff.md` as a lean state doc instead of a running historical narrative. Also trimmed duplicated transport posture text so the canonical deployment guidance now lives in `docs/guides/server-setup.md`.
- Session: local repo execution

### 2026-03-15 21:53 WET

- Who: Codex
- When: 2026-03-15 21:53 WET
- What: Pulled over the next refinement from the updated `nzdk` playbook: explicit repo-default audit postures. `csh` now names `security-exposure`, `operator-workflow`, and `deployment-resilience` as its default refinement lenses, records the finding-ID pattern in the implementation gate, and exposes those postures in `handoff.md` so future refinement work stays precise without reopening doc bloat.
- Session: local repo execution

### 2026-03-15 22:05 WET

- Who: Codex
- When: 2026-03-15 22:05 WET
- What: Created repo-local audit docs under `docs/audits/` and completed the first posture-specific audit for `security-exposure`. The live findings cover remote browser exposure, session metadata file permissions, permissive env-file secret handling, optional-encryption fallback, and the lingering public-relay bootstrap default.
- Session: local repo execution

### 2026-03-15 22:18 WET

- Who: Codex
- When: 2026-03-15 22:18 WET
- What: Completed the remaining posture audits. Added `operator-workflow-2026-03-15.md` and `deployment-resilience-2026-03-15.md`, covering `csh exec` silent timeout/termination, browser reconnect and close state loss, redraw-driven scrollback loss, non-deterministic disconnect on slow links, verification false-green behavior, env-file parsing drift between validation and startup, passive-poll session pinning, and runtime browser bundling. Updated `handoff.md` so the next work is driven by the live audit set in `docs/audits/`.
- Session: local repo execution

### 2026-03-15 23:20 WET

- Who: Codex
- When: 2026-03-15 23:20 WET
- What: Applied the first audit-remediation pass. Startup no longer sources env files as shell, host/runtime paths now force private file modes, remote browser mode now requires HTTP Basic Auth, bootstrap defaults now match the private-relay/required-encryption posture, `csh exec` now fails loudly while preserving timed-out sessions, browser reconnect/close behavior is explicit, polling no longer pins idle sessions, verification now fails if proxy verification fails, and browser startup now prefers prebuilt assets. Local proofs covered config validation, browser auth (`401`/`200`), private session-state permissions (`700`/`600`), and passive-poll TTL behavior.
- Session: local repo execution

### 2026-03-16 00:15 WET

- Who: Codex
- When: 2026-03-16 00:15 WET
- What: Adapted the strongest `noztr` and `nzdk` process-control/refinement ideas into `csh` without re-bloating the startup surface. Added a canonical `docs/process/process-control.md`, added a shareable `docs/process/process-refinement-playbook.md`, updated the implementation gate to require synchronization touchpoints and docs-surface finding IDs, updated prompt templates to declare target findings and touchpoints early, and wired the new control doc into the startup route and handoff.
- Session: local repo execution

### 2026-03-16 01:05 WET

- Who: Codex
- When: 2026-03-16 01:05 WET
- What: Applied the follow-on code review fixes. Hardened session ID handling against path traversal, secured shell-bootstrap secret-file creation, tightened numeric config parsing, made browser access authenticated on loopback as well as remote, required explicit TLS-proxy acknowledgment for remote browser mode, added throttled `keepAlive` heartbeats so read-only attached sessions are not scavenged, strengthened proxy verification to assert real shell output, made `verify` auto-start a loopback `nak` relay when needed, pinned runtime dependencies to current exact versions, and made rendered `systemd` units use the absolute Bun executable instead of relying on `PATH`.
- Session: local repo execution

### 2026-03-16 01:12 WET

- Who: Codex
- When: 2026-03-16 01:12 WET
- What: Revalidated the integrated paths after those fixes. Local `bin/csh verify /tmp/csh-fix-pass.env` passed end to end. Outside the sandbox, the public-relay shell path succeeded through `/tmp/csh-public-shell.sh`, and the browser-over-ContextVM path succeeded through `/tmp/csh-public-browser.sh`, which returned a snapshot containing `__BROWSER__/workspace/projects/csh` over `wss://relay.contextvm.org`.
- Session: local repo execution

### 2026-03-16 01:18 WET

- Who: Codex
- When: 2026-03-16 01:18 WET
- What: Removed stale `phase1` naming from the active operator surface. Default env/config naming is now `.env.csh.local` / `.env.csh.example`, generated session IDs now use `csh-*`, and the active README/scripts/guides were updated accordingly. Remaining `phase1` references are historical provenance only.
- Session: local repo execution

### 2026-03-16 01:45 WET

- Who: Codex
- When: 2026-03-16 01:45 WET
- What: Productized the CLI surface. Added `csh install`, `version`, `status`, `doctor`, `config check`, and `completion`, added the Bun-backed installer at `scripts/install-cli.sh`, updated the deployment and CLI guides around an installed `csh` command instead of `bin/csh`, and verified the installer by creating `/tmp/csh-install/bin/csh` plus completion files and running `/tmp/csh-install/bin/csh version`.
- Session: local repo execution

### 2026-03-16 01:52 WET

- Who: Codex
- When: 2026-03-16 01:52 WET
- What: Closed the CLI-productization slice with verification and an in-place audit refresh. Verified `status`, `doctor`, `config check`, rendered a hardened `systemd` unit with the absolute Bun path, reran `bin/csh verify` successfully end to end, tightened browser startup messaging to avoid echoing secrets, and updated the live posture docs with the closed CLI/install/browser findings.
- Session: local repo execution
