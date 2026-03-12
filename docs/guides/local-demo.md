# Local Demo

Use this guide to exercise the Phase 1 local shell runtime before ContextVM transport is in the
loop.

## Prerequisites

- `bun`
- `tmux`

## Run

```bash
bun install
bun run typecheck
bun test
bun run demo:local
```

`demo:local` opens a `tmux`-backed shell session, writes a few commands, polls for output, prints
the captured snapshot, and closes the session.

For deterministic verification, the demo session uses `/bin/sh` instead of the user’s interactive
login shell.

## Manual Server Start

If you want the raw MCP server process:

```bash
bun run src/main.ts
```

The current tools are:

- `session_open`
- `session_write`
- `session_resize`
- `session_signal`
- `session_poll`
- `session_close`

## Notes

- `tmux` state uses a repo-local socket under `.csh-runtime/`.
- The current output path is snapshot-based poll/ack, not push streaming.
- The first implementation is intentionally local and direct-host. ContextVM transport is the next
  phase.
- The current write path uses `tmux send-keys` for reliable command execution in the first demo
  slice. Raw-control-byte fidelity remains follow-up work.
- A Bun-based stdio MCP demo client was deferred after hitting a transport-level hang during
  `client.connect()`. The server itself still starts normally with `bun run src/main.ts`.
