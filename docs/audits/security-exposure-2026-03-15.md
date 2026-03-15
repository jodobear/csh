---
title: Security Exposure Audit 2026-03-15
doc_type: audit
status: active
owner: csh
posture: security-exposure
read_when:
  - auditing_repo
  - planning_security_fixes
---

# Security Exposure Audit

Question: where can this repo expose a shell, identity, or secret more broadly than intended?

## Live Findings

### `security-exposure-browser-01`

- Severity: high
- Summary: remote browser mode is effectively unauthenticated. `GET /` serves the browser app and embeds the live API token, while POST access is gated only by that token. If `CSH_BROWSER_ALLOW_REMOTE=1` is enabled, any reachable client can fetch the page, recover the token, and drive the shell.
- Evidence:
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L68)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L135)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L272)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L332)
- Status: open

### `security-exposure-runtime-01`

- Severity: high
- Summary: persisted tmux session metadata is written with process-umask permissions only, and the normal manual host path does not tighten `umask`. On a typical `022` umask, `.csh-runtime/sessions/*.json` can become group/world-readable and expose session IDs, owner IDs, cwd, command, and captured shell output.
- Evidence:
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts#L404)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L37)
- Status: open

### `security-exposure-config-01`

- Severity: medium
- Summary: startup scripts `source` the env file directly, so the config file is executable shell, not data-only config. Manual edits can trigger shell expansion or command execution at startup.
- Evidence:
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L15)
  - [start-proxy.sh](/workspace/projects/csh/scripts/start-proxy.sh#L12)
- Status: open

### `security-exposure-transport-01`

- Severity: medium
- Summary: host transport still falls back to `optional` encryption when the mode is omitted from a manually created env or inherited environment. For a private remote shell, silently allowing unencrypted transport is a risky default.
- Evidence:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L116)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L47)
  - [config.ts](/workspace/projects/csh/src/contextvm/config.ts#L71)
  - [config.ts](/workspace/projects/csh/src/contextvm/config.ts#L90)
- Status: open

### `security-exposure-transport-02`

- Severity: medium
- Summary: both bootstrap paths still default fresh configs to `wss://relay.contextvm.org`, even though the current product posture is private relay first. That nudges private-shell deployments toward a public third-party relay unless the operator overrides it manually.
- Evidence:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L229)
  - [bootstrap-env.sh](/workspace/projects/csh/scripts/bootstrap-env.sh#L15)
- Status: open
