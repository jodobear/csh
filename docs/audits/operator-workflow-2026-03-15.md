---
title: Operator Workflow Audit 2026-03-15
doc_type: audit
status: active
owner: csh
posture: operator-workflow
read_when:
  - auditing_repo
  - planning_operator_ux_fixes
---

# Operator Workflow Audit

Question: where does the operator-facing workflow mislead the user, lose state, or make diagnosis harder than it should?

## Live Findings

### `operator-workflow-exec-01`

- Severity: medium
- Summary: `csh exec` previously could time out or return partial output and still exit successfully while destroying the session. It now fails loudly and preserves the session for inspection on timeout.
- Evidence:
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L265)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L292)
- Status: closed 2026-03-15
- Resolution: on timeout, `csh exec` now prints the last snapshot to stderr, leaves the remote session open, and throws with an explicit reconnect command; it only closes automatically on success.

### `operator-workflow-browser-01`

- Severity: medium
- Summary: browser reconnect previously fell back to a new shell without a visible explanation. The UI now reports that it opened a fresh session because the old one could not be reattached.
- Evidence:
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L124)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L139)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L145)
- Status: closed 2026-03-15
- Resolution: failed reattach now sets an explicit fallback status message before opening a new session.

### `operator-workflow-browser-02`

- Severity: medium
- Summary: browser Close previously dropped the reconnect handle before the close RPC succeeded. It now clears local state only after a successful close.
- Evidence:
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L197)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L200)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L211)
- Status: closed 2026-03-15
- Resolution: the browser keeps the live/stored session ID until the close RPC returns successfully and restores polling on close failure.

### `operator-workflow-shell-01`

- Severity: medium
- Summary: interactive-shell disconnect previously waited only 300ms for queued RPCs and then emitted noisy shutdown failures. Shutdown now uses a longer grace window and suppresses expected transport-close noise during intentional disconnect.
- Evidence:
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L170)
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L371)
- Status: closed 2026-03-15
- Resolution: disconnect now waits up to `CSH_SHUTDOWN_GRACE_MS` (default 5000ms) for queued RPCs and suppresses expected `Connection closed` / publish-timeout noise during intentional shutdown.
- Residual limit: this is still a bounded grace window, not a hard delivery guarantee under a broken transport.

### `operator-workflow-verification-01`

- Severity: medium
- Summary: smoke and proxy verification previously leaked remote sessions. They now close the remote session explicitly before closing the transport.
- Evidence:
  - [smoke-client.ts](/workspace/projects/csh/scripts/smoke-client.ts#L16)
  - [smoke-client.ts](/workspace/projects/csh/scripts/smoke-client.ts#L38)
  - [proxy-smoke.ts](/workspace/projects/csh/scripts/proxy-smoke.ts#L36)
  - [proxy-smoke.ts](/workspace/projects/csh/scripts/proxy-smoke.ts#L82)
- Status: closed 2026-03-15
- Resolution: both verification helpers now call `session_close` explicitly during cleanup.

### `operator-workflow-terminal-01`

- Severity: low
- Summary: both terminal UIs previously redrew from full snapshots on every update. They now append deltas when snapshots extend the existing terminal content.
- Evidence:
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L300)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L247)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L266)
- Status: closed 2026-03-15
- Resolution: shell and browser UIs now keep prior terminal content when the next snapshot is a prefix-extension instead of forcing a full clear/redraw each poll.
- Residual limit: full redraw still occurs when the remote screen genuinely diverges from the prior snapshot, which is expected for this snapshot-based design.

### `operator-workflow-shell-02`

- Severity: low
- Summary: the reconnect hint previously omitted the config path and could point operators at the wrong target. It now includes `--config` when a non-default env file was used.
- Evidence:
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L167)
- Status: closed 2026-03-15
- Resolution: reconnect hints now preserve `CVM_ENV_FILE` in the printed command when available.

### `operator-workflow-cli-01`

- Severity: medium
- Summary: the CLI previously felt repo-local and ad hoc: no installable command on `PATH`, no version/status/doctor surface, and no completion output.
- Evidence:
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts)
  - [install-cli.sh](/workspace/projects/csh/scripts/install-cli.sh)
  - [csh-cli-operations.md](/workspace/projects/csh/docs/guides/csh-cli-operations.md)
- Status: closed 2026-03-16
- Resolution: `csh` now has `install`, `version`, `status`, `doctor`, `config check`, and `completion`, and the Bun-backed installer writes a launcher plus completion files into a normal user prefix.
- Proof: `bun run csh install --prefix /tmp/csh-install --no-runtime` created `/tmp/csh-install/bin/csh` plus completion files, and `/tmp/csh-install/bin/csh version` returned `csh 0.1.0`.

### `operator-workflow-browser-03`

- Severity: low
- Summary: browser startup messaging previously left operators guessing about the local URL, auth source, and reconnect affordances.
- Evidence:
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L617)
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L74)
- Status: closed 2026-03-16
- Resolution: `csh browser` now prints the browser URL and credential source before launch, `browser-local` prints the effective local URL and auth expectations, and `csh shell` prints the reconnect hint on initial connect as well as reconnect.

### `operator-workflow-terminal-02`

- Severity: medium
- Summary: terminal input fidelity previously stopped at printable text plus Enter, so history recall,
  backspace editing, paging keys, and common shell-editing controls were unreliable through the tmux
  bridge.
- Evidence:
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts)
- Status: closed 2026-03-16
- Resolution: terminal I/O now runs through a PTY-attached tmux client instead of only `tmux send-keys`,
  which materially improves interactive behavior for control keys and shell editing while preserving
  tmux-backed persistence.
- Proof: a direct session-manager proof now replays prior history with `ArrowUp` and produces
  `ststop` after backspace editing, confirming that non-printable input is reaching the shell as
  editing keys rather than only literal text.

### `operator-workflow-terminal-03`

- Severity: low
- Summary: terminal scrollback depth was too shallow and under-documented for an operator shell.
- Evidence:
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts)
- Status: closed 2026-03-16
- Resolution: scrollback depth is now configurable through `CSH_SCROLLBACK_LINES` and defaults to
  `10000` lines across the tmux capture path and browser terminal.
- Residual limit: snapshot recovery still depends on tmux capture rather than a full durable stream log.

### `operator-workflow-exec-02`

- Severity: medium
- Summary: the native PTY migration briefly regressed `csh exec` so command output could return while the local CLI still lost the real remote exit status. The live implementation now exits with the remote status.
- Evidence:
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L552)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L583)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L617)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L103)
- Status: closed 2026-04-08
- Resolution: `commandExec()` now accumulates snapshot-or-delta output, waits for the remote session to close, and exits with `result.exitStatus` instead of always succeeding locally.
- Proof: outside the sandbox, `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-08 and reported `exec_status=7`.

### `operator-workflow-terminal-04`

- Severity: medium
- Summary: the browser operator path still sends terminal input as UTF-8 text only, so the native PTY backend's byte-safe input guarantee does not yet extend to browser operators.
- Evidence:
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L184)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L35)
  - [main.ts](/workspace/projects/csh/src/main.ts#L72)
- Status: closed 2026-04-08
- Resolution: the browser write API now accepts `inputBase64`, and the browser terminal path now forwards terminal input as bytes encoded to base64 instead of forcing everything through the text-only `input` field.
- Proof: `bun run test:phase7-browser-contract` now covers byte-safe browser writes, and the end-to-end browser smoke in `csh verify` passed on 2026-04-08.

### `operator-workflow-browser-04`

- Severity: low
- Summary: the canonical browser proof previously covered only a freshly opened browser session, so
  regressions in attaching to an already-aged live session could hide behind a green verify run.
- Evidence:
  - [aged-browser-attach.ts](/workspace/projects/csh/scripts/aged-browser-attach.ts)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts)
- Status: closed 2026-04-09
- Resolution: `scripts/aged-browser-attach.ts` now opens a named session over the normal operator
  path, lets that session age for a bounded window, and then attaches through the authenticated
  browser bridge while `scripts/run-autonomous-loop.sh` records `aged-browser-attach.log` as part
  of the canonical verify loop.
- Proof:
  - local `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-09 with
    `aged_browser_attach_status=0`
  - `aged-browser-attach.log` captured `ageMs: 6000` plus `__BROWSER_ATTACH__/tmp` from the aged
    session
