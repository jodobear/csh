# Security-Exposure Audit

- Date: 2026-03-15
- Posture: `security-exposure`
- Scope:
  - `src/main.ts`
  - `src/browser/*`
  - `src/contextvm-gateway.ts`
  - `scripts/config.ts`
  - `scripts/csh.ts`
  - `ops/systemd/*`

## Findings

### security-exposure-browser-01

- Severity: high
- Files:
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L68)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L135)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L272)
  - [server-core.ts](/workspace/projects/csh/src/browser/server-core.ts#L332)
- Finding: enabling `CSH_BROWSER_ALLOW_REMOTE=1` still leaves the browser UI effectively unauthenticated. `GET /` serves the page and embeds the live API token into `window.__CSH_BROWSER_CONFIG__`, and POST access is then gated only by possession of that token.
- Why it matters: anyone who can reach the remotely bound browser UI can fetch the page, recover the token, and drive the shell session through the browser bridge.

### security-exposure-runtime-01

- Severity: high
- Files:
  - [tmux-session-manager.ts](/workspace/projects/csh/src/server/tmux-session-manager.ts#L404)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L37)
- Finding: persisted session metadata is written with process-umask permissions only, and the normal manual host start path does not set a restrictive `umask`.
- Why it matters: on a typical shell `umask` of `022`, the JSON session files under `.csh-runtime/sessions` can become group/world-readable and expose session IDs, owner IDs, cwd, shell command, and captured shell output.

### security-exposure-secrets-01

- Severity: medium
- Files:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L179)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L10)
- Finding: insecure env-file permissions are only a warning. The host start path still sources the env file and uses long-lived private keys even when the file is readable by group or others.
- Why it matters: on multi-user systems, gateway and client private keys can remain exposed through permissive env-file modes with no hard stop at runtime.

### security-exposure-transport-01

- Severity: medium
- Files:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L116)
  - [start-host.sh](/workspace/projects/csh/scripts/start-host.sh#L47)
  - [config.ts](/workspace/projects/csh/src/contextvm/config.ts#L71)
  - [config.ts](/workspace/projects/csh/src/contextvm/config.ts#L90)
- Finding: the host transport still falls back to `optional` encryption when the encryption mode is omitted from a manually created env or inherited environment.
- Why it matters: for a private remote shell, silently permitting unencrypted transport is a risky default that weakens confidentiality if operators do not set the mode explicitly.

### security-exposure-transport-02

- Severity: medium
- Files:
  - [config.ts](/workspace/projects/csh/scripts/config.ts#L229)
  - [bootstrap-env.sh](/workspace/projects/csh/scripts/bootstrap-env.sh#L15)
- Finding: both bootstrap paths still default new env files to `wss://relay.contextvm.org`.
- Why it matters: the repo’s current security posture says operators should use a relay they control, but new configs still steer private-shell deployments toward a public third-party relay unless the operator overrides the default manually.
