---
title: Deployment Resilience Audit 2026-03-15
doc_type: audit
status: active
owner: csh
posture: deployment-resilience
read_when:
  - auditing_repo
  - planning_deployment_fixes
---

# Deployment Resilience Audit

Question: where can startup, verification, persistence, or long-running operation fail in ways that reduce trust in the deployed service?

## Live Findings

### `deployment-resilience-verify-01`

- Severity: high
- Summary: `bin/csh verify` can report success even when the proxy path fails. The autonomous loop captures `proxy_status` but never exits non-zero for it, so the top-level verification command can return green while one of the advertised workflows is broken.
- Evidence:
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L52)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L57)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L333)
- Status: open

### `deployment-resilience-config-01`

- Severity: medium
- Summary: the repo has two different env-file semantics in live paths. TypeScript validation parses the file as data, while startup scripts `source` it as shell. A config that validates successfully can still expand differently or execute code at runtime.
- Evidence:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L58)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L15)
  - [start-proxy.sh](/workspace/projects/csh/scripts/start-proxy.sh#L12)
- Status: open

### `deployment-resilience-session-01`

- Severity: medium
- Summary: idle-session scavenging is defeated by passive polling because `pollSession()` refreshes `lastActivityAt` on every poll. A background browser tab or any stuck poller can therefore keep sessions alive indefinitely even when the human operator is inactive.
- Evidence:
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts#L206)
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts#L217)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L40)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L218)
- Status: open

### `deployment-resilience-browser-01`

- Severity: low
- Summary: browser startup bundles frontend assets at runtime on every launch. That makes browser availability depend on the local Bun build toolchain and installed frontend dependencies instead of shipping prebuilt assets.
- Evidence:
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L75)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L225)
- Status: open

### `deployment-resilience-bootstrap-01`

- Severity: medium
- Summary: both bootstrap flows still generate configs pinned to the public relay. That makes the out-of-the-box deployment path brittle even though the documented deployment posture now prefers a private relay or SSH tunnel.
- Evidence:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L229)
  - [bootstrap-env.sh](/workspace/projects/csh/scripts/bootstrap-env.sh#L15)
- Status: open
