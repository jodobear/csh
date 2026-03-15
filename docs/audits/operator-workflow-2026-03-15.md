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
- Summary: `csh exec` can time out or return only a partial snapshot and still exit successfully, then unconditionally kills the session. Slow or hanging commands can therefore look like successful runs while destroying the state that would help debug them.
- Evidence:
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L265)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L292)
- Status: open

### `operator-workflow-browser-01`

- Severity: medium
- Summary: the browser reconnect flow silently falls back to opening a new shell on any reattach failure. The only visible state change is a fresh connect, so an operator can believe prior state was restored when they actually landed in a new session.
- Evidence:
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L124)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L139)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L145)
- Status: open

### `operator-workflow-browser-02`

- Severity: medium
- Summary: the browser Close action clears the live and stored session ID before the close RPC succeeds. If that request fails transiently, the UI reports success and drops the reconnect handle even though the remote shell may still be running.
- Evidence:
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L197)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L200)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L211)
- Status: open

### `operator-workflow-shell-01`

- Severity: medium
- Summary: interactive-shell disconnect is still racey on slow links because shutdown only waits 300ms for queued RPCs before closing the transport. Pending input, `SIGINT`, or `session_close` can be dropped under latency, so disconnect and `--close-on-exit` are not deterministic.
- Evidence:
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L170)
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L371)
- Status: open

### `operator-workflow-verification-01`

- Severity: medium
- Summary: the smoke and proxy verification clients leak remote sessions. They open sessions and only close the client transport, so repeated verification creates stale shells and makes operator-visible session state noisier than expected.
- Evidence:
  - [smoke-client.ts](/workspace/projects/csh/scripts/smoke-client.ts#L16)
  - [smoke-client.ts](/workspace/projects/csh/scripts/smoke-client.ts#L38)
  - [proxy-smoke.ts](/workspace/projects/csh/scripts/proxy-smoke.ts#L36)
  - [proxy-smoke.ts](/workspace/projects/csh/scripts/proxy-smoke.ts#L82)
- Status: open

### `operator-workflow-terminal-01`

- Severity: low
- Summary: both terminal UIs redraw from full snapshots on every update, which wipes local scroll position and makes output inspection brittle even when the remote shell itself is healthy.
- Evidence:
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L300)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L247)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L266)
- Status: open

### `operator-workflow-shell-02`

- Severity: low
- Summary: the reconnect hint printed by `csh shell` omits the config path. If the operator connected with a non-default env file, the suggested command can reconnect to the wrong target or fail.
- Evidence:
  - [contextvm-interactive-client.ts](/workspace/projects/csh/src/contextvm-interactive-client.ts#L167)
- Status: open
