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
