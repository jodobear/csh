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

### `deployment-resilience-install-02`

- Severity: low
- Summary: the first Bun-backed installer pass could install a managed launcher, but it did not yet
  define the rest of the lifecycle, so operators had no canonical upgrade or uninstall flow.
- Evidence:
  - [install-cli.sh](/workspace/projects/csh/scripts/install-cli.sh)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts)
- Status: closed 2026-03-16
- Resolution: `csh upgrade` now refreshes the managed launcher/completions in place and
  `csh uninstall` removes them cleanly, while still refusing to touch non-managed launchers unless
  `--force` is supplied.
- Proof: `bun run csh install --prefix /tmp/csh-lifecycle --no-runtime`, `bun run csh upgrade --prefix /tmp/csh-lifecycle --no-runtime`, and `bun run csh uninstall --prefix /tmp/csh-lifecycle` completed successfully and removed the managed launcher.

### `deployment-resilience-poll-01`

- Severity: medium
- Summary: `csh verify` is now strong on the native PTY contract, direct path, lifecycle path, proxy path, and `csh exec` status handling, but it still does not run the end-to-end browser attach/poll path. A browser-only regression can therefore hide behind a green verify.
- Evidence:
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L29)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L31)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L100)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh#L113)
- Status: closed 2026-04-08
- Resolution: `scripts/run-autonomous-loop.sh` now starts the browser-over-ContextVM operator path and runs `csh:browser-smoke`, which checks authenticated browser access plus session open/write/poll/close on the migrated backend.
- Proof:
  - local `bun run test:phase7-contract` still passes
  - outside the sandbox, `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-08 with `browser_status=0`
  - the loop now leaves `browser_log` and `browser_smoke_log` artifacts alongside the existing contract/exec/host/proxy logs

### `deployment-resilience-restart-01`

- Severity: medium
- Summary: relay-backed restart recovery previously existed only at the PTY-manager seam. The canonical `csh verify` loop now proves that a named session survives a real host restart over the private-relay ContextVM path.
- Evidence:
  - [restart-recovery.ts](/workspace/projects/csh/scripts/restart-recovery.ts)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh)
  - [host-control.ts](/workspace/projects/csh/scripts/host-control.ts)
- Status: closed 2026-04-09
- Resolution: `scripts/restart-recovery.ts` now opens a named session, records shell state, terminates the current host, starts a replacement host, and verifies reconnect against the surviving session. `scripts/run-autonomous-loop.sh` now runs that proof and records `restart-recovery.log` plus `restart-host.log`.
- Proof:
  - local `bun test --timeout 15000 scripts/host-control.test.ts` passed
  - local `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-09 with `restart_status=0`
  - `restart-recovery.log` captured matching `initialPid` and `postRestartPid`

### `deployment-resilience-verify-02`

- Severity: medium
- Summary: the canonical verify loop previously assumed the configured browser port was free, so a stale local browser bridge could make `csh verify` fail before the real operator path was exercised.
- Evidence:
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh)
  - [browser-smoke.ts](/workspace/projects/csh/scripts/browser-smoke.ts)
- Status: closed 2026-04-09
- Resolution: `scripts/run-autonomous-loop.sh` now selects a free loopback browser port for the verify run and exports it to the browser bridge and browser smoke path.
- Proof:
  - local `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-09 with `browser_port=43180`
  - the browser path completed with `browser_status=0` on the same run

### `deployment-resilience-bootstrap-02`

- Severity: medium
- Summary: the hardening lane previously relied on the actively worked tree for proof, so clone-time
  install or bootstrap drift could hide behind a green local verify run.
- Evidence:
  - [fresh-checkout.ts](/workspace/projects/csh/scripts/fresh-checkout.ts)
  - [fresh-checkout.test.ts](/workspace/projects/csh/scripts/fresh-checkout.test.ts)
  - [package.json](/workspace/projects/csh/package.json)
- Status: closed 2026-04-09
- Resolution: `scripts/fresh-checkout.ts` now performs an isolated local clone, runs
  `bun install --frozen-lockfile`, and then runs `bun run scripts/csh.ts verify .env.csh.local`
  from that clone. The helper is covered by `scripts/fresh-checkout.test.ts` and exposed as
  `bun run csh:fresh-checkout`.
- Proof:
  - local `bun test --timeout 15000 scripts/fresh-checkout.test.ts` passed
  - outside the sandbox,
    `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun-install bun run scripts/fresh-checkout.ts` passed on
    2026-04-09
  - the isolated clone verify reported `restart_status=0`, `proxy_status=0`, `exec_status=7`, and
    `browser_status=0`

### `deployment-resilience-relay-01`

- Severity: medium
- Summary: relay interruption and recovery were previously unproven in the canonical verify path,
  and the host/proxy startup wrappers would clobber runtime relay overrides from the env file,
  which blocked deterministic relay fault injection.
- Evidence:
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh)
  - [relay-recovery.ts](/workspace/projects/csh/scripts/relay-recovery.ts)
  - [startup-env.ts](/workspace/projects/csh/scripts/startup-env.ts)
  - [start-host.ts](/workspace/projects/csh/scripts/start-host.ts)
  - [start-proxy.ts](/workspace/projects/csh/scripts/start-proxy.ts)
- Status: closed 2026-04-09
- Resolution: `scripts/run-autonomous-loop.sh` now selects a verify-owned loopback relay port,
  starts a private relay on that port, and runs `scripts/relay-recovery.ts` to terminate and
  replace that relay while a named session stays alive. `scripts/startup-env.ts` now preserves
  explicit runtime overrides when startup wrappers apply env-file defaults, so the host, proxy,
  browser, and clients all stay on the same temporary relay during fault-injection runs.
- Proof:
  - local `bun test --timeout 15000 scripts/startup-env.test.ts` passed
  - local `bun test --timeout 15000 scripts/host-control.test.ts` passed
  - local `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-09 with
    `relay_recovery_status=0`, `restart_status=0`, `proxy_status=0`, `exec_status=7`, and
    `browser_status=0`
  - `relay-recovery.log` captured matching `initialPid` and `postRecoveryPid` on relay port
    `10553`

### `deployment-resilience-soak-01`

- Severity: medium
- Summary: the canonical verify path previously proved clean startup and recovery edges, but it did
  not keep one session alive long enough to catch regressions in high-output handling, read-only
  keepAlive refresh, or delayed reconnect.
- Evidence:
  - [session-soak.ts](/workspace/projects/csh/scripts/session-soak.ts)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh)
  - [lifecycle-client.ts](/workspace/projects/csh/scripts/lifecycle-client.ts)
- Status: closed 2026-04-09
- Resolution: `scripts/session-soak.ts` now opens a named session, pushes 800 lines of output
  through it, keeps it alive read-only for 6000 ms with `keepAlive` polls, disconnects for another
  6000 ms, and then reconnects to the same shell. `scripts/run-autonomous-loop.sh` now runs that
  proof and records `session-soak.log` before the relay and host recovery checks.
- Proof:
  - local `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-09 with `soak_status=0`
  - `session-soak.log` captured `initialPid`, `postKeepAlivePid`, and `postReconnectPid` all equal
    for the same session

### `deployment-resilience-idle-01`

- Severity: medium
- Summary: the canonical verify path previously proved keepAlive and reconnect behavior, but it did
  not prove the opposite edge: that a truly idle session expires under the configured TTL and does
  not survive only because of background poll traffic or a stuck helper process.
- Evidence:
  - [idle-expiry.ts](/workspace/projects/csh/scripts/idle-expiry.ts)
  - [run-autonomous-loop.sh](/workspace/projects/csh/scripts/run-autonomous-loop.sh)
  - [contextvm-gateway.ts](/workspace/projects/csh/src/contextvm-gateway.ts)
  - [pty-session-manager.ts](/workspace/projects/csh/src/server/pty-session-manager.ts)
  - [pty-session.py](/workspace/projects/csh/scripts/pty-session.py)
- Status: closed 2026-04-09
- Resolution: `scripts/run-autonomous-loop.sh` now launches a dedicated short-TTL host from a
  verify-only env file, runs `scripts/idle-expiry.ts` against it, and records `idle-expiry.log`,
  `idle-host.log`, and `verify-idle.env`. The gateway now forwards the full process env into the
  spawned MCP server, and the PTY runtime now escalates close handling so expired sessions are
  forced down even if a helper ignores the first hangup.
- Proof:
  - local `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-09 with
    `idle_expiry_status=0`
  - `idle-expiry.log` captured `idleTtlMs: 2000`, `closedAt` for the original session, and a
    different `freshPid` after expiry

### `deployment-resilience-release-01`

- Severity: low
- Summary: the repo previously had a strong routine verify path plus separate ad hoc heavy proofs,
  but no checked-in release-grade command for re-running fresh-checkout and public-relay
  compatibility from one place.
- Evidence:
  - [release-verify.ts](/workspace/projects/csh/scripts/release-verify.ts)
  - [release-verify.test.ts](/workspace/projects/csh/scripts/release-verify.test.ts)
  - [csh.ts](/workspace/projects/csh/scripts/csh.ts)
  - [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md)
- Status: closed 2026-04-09
- Resolution: `csh verify` remains the routine local/private-relay-first gate, while
  `scripts/release-verify.ts` and `csh verify release` now own the heavier periodic checks: fresh
  checkout plus public-relay compatibility.
- Proof:
  - local `bun test --timeout 15000 scripts/release-verify.test.ts` passed
  - local `bun run scripts/csh.ts verify .env.csh.local` passed on 2026-04-09
  - outside the sandbox, `bun run scripts/release-verify.ts .env.csh.local` passed on 2026-04-09
    with `release_verify_public_shell_status=0` and `release_verify_public_browser_status=0`
