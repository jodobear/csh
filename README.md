# csh

`csh` is a private remote shell over Nostr built on ContextVM.

It currently provides:

- a repo-local MCP server for persisted interactive shell sessions
- a ContextVM gateway that exposes that server over Nostr
- a CLI for bootstrap, host startup, one-shot exec, interactive shell, proxy checks, and browser access
- a browser terminal UI for operator use

## Quick Start

Install dependencies and put `csh` on your `PATH`:

```bash
bun install
bun run csh install
```

The runtime expects `bun` and `python3` on the host.

Create a local config:

```bash
csh bootstrap
```

Check the environment and runtime:

```bash
csh doctor
```

Start the host:

```bash
csh host start
```

Run one command from another shell:

```bash
csh exec "pwd"
```

Open the interactive shell:

```bash
csh shell
```

Open the browser terminal:

```bash
csh browser
```

Inspect the resolved deployment/operator state:

```bash
csh status
```

Upgrade or remove the installed launcher later with:

```bash
csh upgrade
csh uninstall
```

If you prefer not to install a launcher yet, every command above also works as `bin/csh ...` from the
repo root.

## Recommended Use

Use a relay you control for real operator work. The canonical deployment path lives in
[server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md).

`csh` is intentionally a Bun-backed tool for now. Persistent deployment should use the existing
`systemd` example rather than a custom daemon layer.

## Repo Layout

- [bin/](/workspace/projects/csh/bin): public CLI entrypoints
- [src/](/workspace/projects/csh/src): interactive server, ContextVM gateway, browser app, client code
- [scripts/](/workspace/projects/csh/scripts): operational wrappers and verification helpers
- [ops/systemd/](/workspace/projects/csh/ops/systemd): example `systemd` unit for persistent host deployment
- [docs/](/workspace/projects/csh/docs): plans, process docs, research notes, guides, and transcript

## Notes

- The browser UI is operator-local and loopback-bound by default.
- Sessions persist across client reconnects and can survive host restart when the same runtime state is reused.
- The backend now runs a native PTY session manager with byte-safe input handling, reconnect support,
  and snapshot-or-delta polling for CLI and browser operators.
- `csh install` writes a Bun-backed launcher into `~/.local/bin/csh` by default.

For the current verified state and operational details, see [handoff.md](/workspace/projects/csh/handoff.md), [docs/README.md](/workspace/projects/csh/docs/README.md), [csh-cli-operations.md](/workspace/projects/csh/docs/guides/csh-cli-operations.md), and [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md).
