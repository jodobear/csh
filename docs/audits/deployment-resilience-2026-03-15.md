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
- Summary: `bin/csh verify` previously could return success even when the proxy path failed. The autonomous loop now exits non-zero when proxy verification fails.
- Evidence:
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L52)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L57)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L333)
- Status: closed 2026-03-15
- Resolution: `scripts/run-autonomous-loop.sh` now exits with `proxy_status`, and `bin/csh verify` validates full config before running.

### `deployment-resilience-config-01`

- Severity: medium
- Summary: the repo previously had conflicting env-file semantics between validation and runtime. Live startup paths now parse env files as data in both validation and startup.
- Evidence:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L58)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L15)
  - [start-proxy.sh](/workspace/projects/csh/scripts/start-proxy.sh#L12)
- Status: closed 2026-03-15
- Resolution: host and proxy startup now go through TypeScript wrappers that parse env files with `parseEnvFile()` instead of shell-sourcing them.

### `deployment-resilience-session-01`

- Severity: medium
- Summary: idle-session scavenging previously treated passive poll traffic as operator activity. Polling no longer refreshes `lastActivityAt`, so idle sessions can expire even when a background tab keeps polling.
- Evidence:
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts#L206)
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts#L217)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L40)
  - [app.ts](/workspace/projects/csh/src/browser/app.ts#L218)
- Status: closed 2026-03-15
- Resolution: `pollSession()` no longer updates `lastActivityAt`; only active session operations update it.
- Proof: isolated session-manager check confirmed `lastActivityAt` stayed unchanged across polling.

### `deployment-resilience-browser-01`

- Severity: low
- Summary: browser startup previously bundled frontend assets at runtime on every launch. It now prefers prebuilt assets and only falls back to runtime bundling if those assets are missing.
- Evidence:
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L75)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L225)
- Status: closed 2026-03-15
- Resolution: `scripts/build-browser-assets.ts` produces `dist/browser/*`, `install-runtime.sh` builds those assets, and the browser server reads prebuilt assets first.
- Residual limit: runtime bundling remains as a development fallback if prebuilt assets are absent.

### `deployment-resilience-bootstrap-01`

- Severity: medium
- Summary: bootstrap previously generated configs pinned to the public relay. Fresh configs now default to the local/private relay path that matches the repo's deployment posture.
- Evidence:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L229)
  - [bootstrap-env.sh](/workspace/projects/csh/scripts/bootstrap-env.sh#L15)
- Status: closed 2026-03-15
- Resolution: both bootstrap flows now generate `CVM_RELAYS="ws://127.0.0.1:10552"` by default.

### `deployment-resilience-install-01`

- Severity: medium
- Summary: the repo previously had no stable install path for operators, so usage stayed tied to `bin/csh` in a checkout and docs could not honestly describe a normal command-line deployment flow.
- Evidence:
  - [install-cli.sh](/workspace/projects/csh/scripts/install-cli.sh)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts)
  - [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md)
- Status: closed 2026-03-16
- Resolution: the repo now ships a Bun-backed installer that writes a managed launcher and completion files into a standard user prefix and the deployment guide is centered on that installed CLI surface.
- Proof: `bun run csh install --prefix /tmp/csh-install --no-runtime` created `/tmp/csh-install/bin/csh` and completion files under `/tmp/csh-install/share/csh/completions`.

### `deployment-resilience-diagnostics-01`

- Severity: low
- Summary: the prior operator surface lacked a clear preflight/diagnostic contract, so deployment validation was spread across `host check` and ad hoc manual inspection.
- Evidence:
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts)
  - [README.md](/workspace/projects/csh/README.md)
- Status: closed 2026-03-16
- Resolution: `csh doctor`, `csh status`, and `csh config check` now provide a defined install/config/runtime preflight path before host startup.
- Proof: `bun run csh doctor /tmp/csh-cli-polish.env`, `bun run csh status /tmp/csh-cli-polish.env`, and `bun run csh config check /tmp/csh-cli-polish.env` all succeeded against a fresh bootstrap config.
