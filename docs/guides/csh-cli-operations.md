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

The primary browser flow is signer-based. Enter your relay URL and server pubkey, choose a signer
(`NIP-07`, bunker, Amber, or the verify-only test signer in preview/test flows), and the client
will use `auth_status` plus `auth_redeem_invite` to determine whether the current Nostr identity is
already allowlisted for shell access.

`CSH_BROWSER_AUTH_USER` and `CSH_BROWSER_AUTH_PASSWORD` now apply only to the deprecated
`csh browser-bridge` fallback.

Manage shell authorization and browser onboarding:

```bash
csh auth allowlist list .env.csh.local
csh auth invite create .env.csh.local
```

Export a shareable browser profile payload without private keys:

```bash
csh profile export .env.csh.local
```

Build or serve the independently hostable static browser bundle:

```bash
csh browser build
csh browser serve-static .env.csh.local
```

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

The current shell path is native-PTY-backed with reconnect and snapshot-or-delta polling for
recovery. In practice that gives the expected shell-editing set:

- history recall via arrow keys
- backspace/delete/home/end/page keys
- common `Ctrl-<letter>` shell-editing shortcuts
- browser scrollback sized from `CSH_SCROLLBACK_LINES` (default `10000`)
- byte-safe input across CLI and browser operators

## Secure Defaults

- `bootstrap` writes the env file with `0600` permissions
- shell access is allowlist-based on the Phase 9 browser/auth lane
- default log level is `error` to reduce transport noise in normal operation
- interactive sessions are owner-bound when the ContextVM gateway injects the authenticated client pubkey
- the primary browser path is signer-based and invite-aware; `csh browser-bridge` is deprecated fallback only
- the `systemd` unit uses `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`, and `UMask=0077`
- transport posture and deployment guidance live in [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md)

## systemd

Render a hardened unit for your real server paths:

```bash
csh host systemd-unit .env.csh.local --output /tmp/csh-host.service
```

You can also start from [csh-host.service.example](/workspace/projects/csh/ops/systemd/csh-host.service.example).
