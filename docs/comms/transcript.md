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

### 2026-03-16 02:27 WET

- Who: Codex
- When: 2026-03-16 02:27 WET
- What: Closed the tmux-backed terminal-fidelity slice. Added broader control-key mapping in `src/server/tmux-session-manager.ts`, raised and exposed scrollback depth through `CSH_SCROLLBACK_LINES`, added `csh upgrade` and `csh uninstall` around the Bun-backed launcher lifecycle, updated the operator/deployment guides, and proved the new input behavior directly through the session manager by replaying history with `ArrowUp` and editing a command with backspace to produce `ststop`. The normal `bin/csh verify /tmp/csh-cli-polish.env` loop also still passed afterward.
- Session: local repo execution

### 2026-03-16 02:40 WET

- Who: Codex
- When: 2026-03-16 02:40 WET
- What: Replaced the new-control-key-only approach with a stronger backend seam: terminal I/O now goes through a PTY-attached tmux client helper in `scripts/pty-attach.py`, while tmux still preserves the persistent session. `session_poll` now carries both snapshot recovery and stream deltas, the shell/browser clients use those deltas when available, and the repo docs/handoff/decision log were updated to describe this as a hybrid PTY-over-tmux design rather than just richer `send-keys` handling.
- Session: local repo execution

### 2026-04-08 18:33 WEST

- Who: Codex
- When: 2026-04-08 18:33 WEST
- What: Re-aligned the control surface for the active native-PTY lane. Updated prompt routing so Phase 7 is explicitly active again, updated `handoff.md` to state that the current working tree is mid-migration and not yet runnable end to end, expanded the Phase 7 packet with a layered verification matrix so `csh verify` can become the canonical autonomous gate for backend recovery and follow-on shell hardening, and added the matching implementation-gate rule that materially changing runtime behavior should leave behind a canonical layered verification loop with stable failure artifacts.
- Session: local repo execution

### 2026-04-08 19:00 WEST

- Who: Codex
- When: 2026-04-08 19:00 WEST
- What: Added the first concrete Phase 7 contract suites and the stepwise implementation program. `package.json` now exposes `test:phase7-browser-contract`, `test:phase7-session-contract`, and `test:phase7-contract`; the Phase 7 packet now names the recovery slices explicitly; the browser request-handler contract suite passes; and the session contract suite currently fails on the real Phase 7 blocker, the missing `src/server/pty-session-manager.ts`.
- Session: local repo execution

### 2026-04-08 20:05 WEST

- Who: Codex
- When: 2026-04-08 20:05 WEST
- What: Recovered the native PTY backend and promoted it into the autonomous gate. Added `src/server/pty-session-manager.ts` as the new persisted PTY runtime, rewrote `scripts/pty-session.py` into a detached helper with persisted output and restart survival, aligned the client/browser/session helpers with delta-oriented polling, fixed `csh exec` to return the remote exit status, and strengthened `scripts/run-autonomous-loop.sh` to run the Phase 7 contract suite plus an explicit `exec_status=7` proof. Local `bun run test:phase7-contract` now passes, and outside the sandbox `bun run scripts/csh.ts verify .env.csh.local` passed end to end with stable contract/exec/host/proxy log artifacts.
- Session: local repo execution

### 2026-04-08 20:30 WEST

- Who: Codex
- When: 2026-04-08 20:30 WEST
- What: Reran the live posture audits against the migrated native PTY backend. Recorded `security-exposure-runtime-02` closed after a fresh permission proof on the new PTY control-plane artifacts, recorded `operator-workflow-exec-02` closed after the `exec_status=7` verify proof, and captured a fresh browser-over-ContextVM proof with Playwright against the migrated backend. The audit also left two live open findings: `operator-workflow-terminal-04` because the browser path still sends text-only input rather than byte-safe `inputBase64`, and `deployment-resilience-poll-01` because `csh verify` still does not exercise the browser attach/poll path end to end.
- Session: local repo execution

### 2026-04-08 20:45 WEST

- Who: Codex
- When: 2026-04-08 20:45 WEST
- What: Closed the two remaining Phase 7 audit findings. The browser server and browser app now forward `inputBase64` writes end to end, `src/browser/server-core.test.ts` now covers byte-safe browser writes, `scripts/browser-smoke.ts` now provides an authenticated browser-over-ContextVM open/write/poll/close proof, and `scripts/run-autonomous-loop.sh` now starts the browser operator path and records `browser_log` plus `browser_smoke_log`. Outside the sandbox, `bun run scripts/csh.ts verify .env.csh.local` passed with `browser_status=0`, closing both `operator-workflow-terminal-04` and `deployment-resilience-poll-01`.
- Session: local repo execution

### 2026-04-08 21:10 WEST

- Who: Codex
- When: 2026-04-08 21:10 WEST
- What: Ran a surgical legacy-removal pass on the live product surface. Updated the active README and operator guides to describe the native PTY backend rather than the older tmux path, removed the dead `tmuxSocket` runtime field, updated the reconnect hint and proxy-smoke error text to the current `csh` surface, and tightened the PTY startup handshake plus the high-output contract expectation so the canonical `bun run test:phase7-contract` suite stays green after cleanup.
- Session: local repo execution

### 2026-04-08 21:28 WEST

- Who: Codex
- When: 2026-04-08 21:28 WEST
- What: Removed the generated browser artifact trees (`.playwright-cli`, `output`, and `scripts/__pycache__`), added `output/` to `.gitignore`, and tore down the live local browser/relay stack before cleanup. The remaining `.csh-runtime/go-mod-cache` is an ignored stale cache tree with root-owned files from older installs; Codex could not fully purge it because `sudo rm -rf .csh-runtime` requires an interactive password outside the sandbox.
- Session: local repo execution

### 2026-04-09 15:49 WEST

- Who: Codex
- When: 2026-04-09 15:49 WEST
- What: Started Phase 8 verification hardening. Added a tested process-control helper in `scripts/host-control.ts`, added `scripts/restart-recovery.ts` to prove named-session survival across a real relay-backed host restart, and wired that proof into `scripts/run-autonomous-loop.sh` with stable `restart-recovery.log` and `restart-host.log` artifacts. While rerunning the gate, a stale local browser bridge exposed a verify-port collision; the loop now selects its own free loopback browser port so `csh verify` no longer depends on port `4318` being unused. Local `bun test --timeout 15000 scripts/host-control.test.ts`, `bun run test:phase7-contract`, and `bun run scripts/csh.ts verify .env.csh.local` all passed afterward.
- Session: local repo execution

### 2026-04-09 16:20 WEST

- Who: Codex
- When: 2026-04-09 16:20 WEST
- What: Closed the next Phase 8 hardening slice with an isolated-clone proof. Added `scripts/fresh-checkout.ts` plus `scripts/fresh-checkout.test.ts`, exposed them through `test:fresh-checkout` and `csh:fresh-checkout`, and verified that a fresh local clone can run `bun install --frozen-lockfile` and then pass `bun run scripts/csh.ts verify .env.csh.local` with `restart_status=0`, `proxy_status=0`, `exec_status=7`, and `browser_status=0`. The active prompt, handoff, and deployment-resilience audit were updated to mark fresh-checkout verification as closed and move the next focus to relay fault hardening.
- Session: local repo execution

### 2026-04-09 16:59 WEST

- Who: Codex
- When: 2026-04-09 16:59 WEST
- What: Closed the next Phase 8 hardening slice around relay interruption and recovery. Added `scripts/relay-recovery.ts`, extended `scripts/host-control.ts` with a tested TCP-listener readiness helper, added `scripts/startup-env.ts` plus `scripts/startup-env.test.ts` so startup wrappers preserve explicit runtime overrides, and changed `scripts/run-autonomous-loop.sh` to allocate a verify-owned loopback relay port before running the gate. After an initial failure exposed that `scripts/start-host.ts` and `scripts/start-proxy.ts` were clobbering relay overrides from the env file, those wrappers were moved onto `applyEnvDefaults()`, the browser log path was corrected to report the real overridden port, and `bun run scripts/csh.ts verify .env.csh.local` then passed end to end with `relay_recovery_status=0`, `restart_status=0`, `proxy_status=0`, `exec_status=7`, and `browser_status=0`.
- Session: local repo execution

### 2026-04-09 17:12 WEST

- Who: Codex
- When: 2026-04-09 17:12 WEST
- What: Closed the follow-on Phase 8 session-soak slice. Added `scripts/session-soak.ts`, wired it into `scripts/run-autonomous-loop.sh`, and reran `bun run scripts/csh.ts verify .env.csh.local` so the canonical gate now proves a longer-lived operator path: 800 lines of output through one session, 6000 ms of read-only `keepAlive` polling, another 6000 ms of disconnected time, and then delayed reconnect to the same shell PID. The prompt, handoff, and deployment-resilience audit were updated to mark this longer-lived proof as closed and move the next focus to explicit idle-expiry and aged-browser-attach checks.
- Session: local repo execution

### 2026-04-09 18:47 WEST

- Who: Codex
- When: 2026-04-09 18:47 WEST
- What: Closed the next Phase 8 hardening slice around explicit expiry and aged browser attach. Added `scripts/idle-expiry.ts` plus `scripts/aged-browser-attach.ts`, wired both into `scripts/run-autonomous-loop.sh`, and fixed the real runtime blocker that surfaced while driving those proofs: `src/contextvm-gateway.ts` now forwards the full process environment into the spawned MCP server, so verify-time TTL overrides actually reach `src/main.ts`. The PTY runtime now scavenges on poll, escalates forced close when a helper ignores the first hangup, and records stable idle/aged-browser artifacts. Local `bun test --timeout 15000 scripts/host-control.test.ts`, `bun run test:phase7-contract`, and `bun run scripts/csh.ts verify .env.csh.local` all passed afterward with `idle_expiry_status=0`, `aged_browser_attach_status=0`, `soak_status=0`, `relay_recovery_status=0`, `restart_status=0`, `proxy_status=0`, `exec_status=7`, and `browser_status=0`.
- Session: local repo execution

### 2026-04-09 19:20 WEST

- Who: Codex
- When: 2026-04-09 19:20 WEST
- What: Closed the final Phase 8 hardening slice and restored the startup surface to steady state. Added `scripts/release-verify.ts` plus `scripts/release-verify.test.ts`, wired `csh verify release` into the CLI, and split the verification contract into a routine gate (`csh verify`) and a heavier release-grade gate (`csh verify release`). Outside the sandbox, `bun run scripts/release-verify.ts .env.csh.local` passed end to end: fresh-checkout verification succeeded from an isolated clone, the public-relay shell proof returned `/workspace/projects/csh`, and the public-relay browser proof returned `__BROWSER__/workspace/projects/csh` with `release_verify_public_shell_status=0` and `release_verify_public_browser_status=0`. The deployment guide, scripts guide, prompt routing, handoff, and deployment-resilience audit were updated to mark Phase 8 complete.
- Session: local repo execution
