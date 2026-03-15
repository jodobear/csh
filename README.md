# csh

`csh` is a private remote shell over Nostr built on ContextVM.

It currently provides:

- a repo-local `tmux`-backed MCP server for interactive shell sessions
- a ContextVM gateway that exposes that server over Nostr
- a CLI for bootstrap, host startup, one-shot exec, interactive shell, proxy checks, and browser access
- a browser terminal UI for operator use

## Recommended Use

Use a relay you control for real operator work. The canonical transport/deployment guidance lives in [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md).

`csh` itself is still a Bun-backed repo CLI. Persistent deployment should use the existing `systemd`
example rather than a custom daemon layer.

## Quick Start

Install dependencies:

```bash
bun install
```

Create a local config:

```bash
bin/csh bootstrap
```

Check host readiness:

```bash
bin/csh host check .env.phase1.local
```

Start the host:

```bash
bin/csh host start .env.phase1.local
```

Run one command from another shell:

```bash
bin/csh exec "pwd" .env.phase1.local
```

Open the interactive shell:

```bash
bin/csh shell .env.phase1.local
```

Open the browser terminal:

```bash
bin/csh browser .env.phase1.local
```

Start a deterministic local test relay with `nak`:

```bash
CSH_TEST_RELAY_HOST=127.0.0.1 CSH_TEST_RELAY_PORT=10552 scripts/start-test-relay.sh
```

## Repo Layout

- [bin/](/workspace/projects/csh/bin): public CLI entrypoints
- [src/](/workspace/projects/csh/src): interactive server, ContextVM gateway, browser app, client code
- [scripts/](/workspace/projects/csh/scripts): operational wrappers and verification helpers
- [ops/systemd/](/workspace/projects/csh/ops/systemd): example `systemd` unit for persistent host deployment
- [docs/](/workspace/projects/csh/docs): plans, process docs, research notes, guides, and transcript

## Notes

- The browser UI is operator-local and loopback-bound by default.
- Sessions persist across client reconnects and can survive host restart when the same runtime state is reused.
- The backend is `tmux` snapshot-based today, so terminal fidelity is below a raw PTY byte-stream design.

For the current verified state and operational details, see [handoff.md](/workspace/projects/csh/handoff.md), [docs/README.md](/workspace/projects/csh/docs/README.md), [csh-cli-operations.md](/workspace/projects/csh/docs/guides/csh-cli-operations.md), and [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md).
