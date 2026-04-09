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
- Summary: remote browser mode previously exposed the browser app and embedded API token to any reachable client. Remote mode now requires explicit Basic Auth credentials before any page, asset, or API request is served.
- Evidence:
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L68)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L135)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L272)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L332)
- Status: closed 2026-03-15
- Resolution: `CSH_BROWSER_ALLOW_REMOTE=1` now requires `CSH_BROWSER_AUTH_USER` and `CSH_BROWSER_AUTH_PASSWORD`, and the browser server enforces HTTP Basic Auth before serving `/`, assets, or `/api/*`.
- Proof: local in-process browser auth check returned `401` for unauthenticated and wrong-password requests and `200` for correct credentials.

### `security-exposure-runtime-01`

- Severity: high
- Summary: persisted tmux session metadata previously relied on process umask and could become too permissive. The host path and session persistence path now force private permissions.
- Evidence:
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts#L404)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L37)
- Status: closed 2026-03-15
- Resolution: host startup now applies `umask 077`; runtime/session directories are forced to `0700`; persisted session files are forced to `0600`.
- Proof: isolated session-manager check in `/tmp` confirmed session dir mode `700` and state-file mode `600`.

### `security-exposure-config-01`

- Severity: medium
- Summary: startup scripts previously `source`d env files directly, so config was treated as executable shell. Startup now parses env files as data in TypeScript wrappers instead.
- Evidence:
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L15)
  - [start-proxy.sh](/workspace/projects/csh/scripts/start-proxy.sh#L12)
- Status: closed 2026-03-15
- Resolution: `scripts/start-host.sh` and `scripts/start-proxy.sh` now exec Bun wrappers that use `parseEnvFile()` instead of shell-sourcing the config.
- Proof: repo grep no longer finds env sourcing in live startup paths under `scripts/` or `src/`.

### `security-exposure-transport-01`

- Severity: medium
- Summary: transport previously fell back to `optional` encryption when the mode was omitted. Default transport posture is now `required`.
- Evidence:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L116)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L47)
  - [config.ts](/workspace/projects/csh/src/contextvm/config.ts#L71)
  - [config.ts](/workspace/projects/csh/src/contextvm/config.ts#L90)
- Status: closed 2026-03-15
- Resolution: config defaults, bootstrap output, client config, and host config all now default omitted encryption mode values to `required`.
- Proof: new bootstrap envs emit `GW_ENCRYPTION_MODE="required"` and `CVM_PROXY_ENCRYPTION_MODE="required"`; config loaders now parse missing mode as `REQUIRED`.

### `security-exposure-transport-02`

- Severity: medium
- Summary: bootstrap previously defaulted to the public ContextVM relay despite the repo's private-relay-first posture. Fresh configs now default to a local/private relay URL.
- Evidence:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L229)
  - [bootstrap-env.sh](/workspace/projects/csh/scripts/bootstrap-env.sh#L15)
- Status: closed 2026-03-15
- Resolution: both bootstrap paths now generate `CVM_RELAYS="ws://127.0.0.1:10552"` by default.
- Proof: `bin/csh bootstrap /tmp/csh-audit-fix.env` produced a private-relay-first config.

### `security-exposure-browser-02`

- Severity: low
- Summary: browser startup messaging briefly echoed the configured browser password directly to stderr, which would have leaked a reusable secret into terminal logs.
- Evidence:
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts#L617)
- Status: closed 2026-03-16
- Resolution: `csh browser` now prints the auth username and points operators back to the config file for the password instead of echoing the secret.

### `security-exposure-runtime-02`

- Severity: medium
- Summary: the native PTY migration introduced a new on-disk control plane (`session.json`, `runtime.json`, `output.bin`, `control.fifo`, and `replies/`). Those artifacts remain private by mode in the live implementation.
- Evidence:
  - [pty-session-manager.ts](/workspace/projects/csh/src/server/pty-session-manager.ts#L422)
  - [pty-session-manager.ts](/workspace/projects/csh/src/server/pty-session-manager.ts#L429)
  - [pty-session-manager.ts](/workspace/projects/csh/src/server/pty-session-manager.ts#L436)
  - [pty-session.py](/workspace/projects/csh/scripts/pty-session.py#L94)
  - [pty-session.py](/workspace/projects/csh/scripts/pty-session.py#L102)
  - [pty-session.py](/workspace/projects/csh/scripts/pty-session.py#L123)
- Status: closed 2026-04-08
- Resolution: the native PTY runtime now forces the per-session directory and `replies/` directory to `0700`, and forces `session.json`, `runtime.json`, `output.bin`, and `control.fifo` to `0600`.
- Proof: a fresh local PTY-runtime permission check on 2026-04-08 reported `dirMode=700`, `repliesMode=700`, and `sessionMode=runtimeMode=outputMode=controlMode=600`.
