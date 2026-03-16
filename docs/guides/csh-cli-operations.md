# csh CLI Operations

`csh` is the stable CLI entrypoint for this repo.

## Install

From the repo checkout:

```bash
bun install
bun run csh install
```

That writes a Bun-backed launcher to `~/.local/bin/csh` by default. Use `--prefix <dir>` if you want
another install root.

Refresh or remove that launcher later with:

```bash
csh upgrade
csh uninstall
```

## Primary Commands

Bootstrap a secure local config:

```bash
csh bootstrap .env.csh.local
```

Install or refresh runtime prerequisites:

```bash
csh runtime install
```

Validate the config file directly:

```bash
csh config check .env.csh.local
```

Run the broader operator/runtime diagnostic pass:

```bash
csh doctor .env.csh.local
```

Show the resolved operator/deployment state:

```bash
csh status .env.csh.local
```

Validate host readiness only:

```bash
csh host check .env.csh.local
```

Start the persistent host:

```bash
csh host start .env.csh.local
```

Run one operator command in a fresh remote shell:

```bash
csh exec "pwd" .env.csh.local
```

Start the interactive shell:

```bash
csh shell .env.csh.local
```

Reconnect to an existing interactive session:

```bash
csh shell .env.csh.local --session <session-id>
```

Start the browser terminal UI:

```bash
csh browser .env.csh.local
```

The browser will prompt for the credentials from `CSH_BROWSER_AUTH_USER` and
`CSH_BROWSER_AUTH_PASSWORD`.

Run the end-to-end verification loop:

```bash
csh verify /tmp/csh-verify.env
```

Print completions:

```bash
csh completion zsh
```

Print the installed version:

```bash
csh version
```

## Terminal Behavior

The current shell path now uses a PTY-attached tmux client for terminal I/O while still polling a
tmux snapshot for recovery and compatibility. In practice that gives a broader practical
shell-editing set:

- history recall via arrow keys
- backspace/delete/home/end/page keys
- common `Ctrl-<letter>` shell-editing shortcuts
- browser scrollback sized from `CSH_SCROLLBACK_LINES` (default `10000`)

The residual limitation is still architectural: this is better than `tmux send-keys`, but it is not
yet a native PTY session model end to end.

## Secure Defaults

- `bootstrap` writes the env file with `0600` permissions
- host mode requires an allowlist unless `GW_ALLOW_UNLISTED_CLIENTS=1`
- default log level is `error` to reduce transport noise in normal operation
- interactive sessions are owner-bound when the ContextVM gateway injects the authenticated client pubkey
- browser mode is authenticated even on loopback, and remote browser mode also requires
  `CSH_BROWSER_TRUST_PROXY_TLS=1`
- the `systemd` unit uses `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`, and `UMask=0077`
- transport posture and deployment guidance live in [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md)

## systemd

Render a hardened unit for your real server paths:

```bash
csh host systemd-unit .env.csh.local --output /tmp/csh-host.service
```

You can also start from [csh-host.service.example](/workspace/projects/csh/ops/systemd/csh-host.service.example).
