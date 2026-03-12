# csh

`csh` is a ContextVM shell prototype: a private remote shell service with a real terminal session
model, reconnect-oriented state, and `tmux`-backed scrollback.

The current implementation spans Phase 1 local infrastructure and the first Phase 2 gateway path:

- MCP server over stdio
- `tmux`-backed shell sessions
- poll/ack screen reads
- owner-bound session access
- closed-session reporting with exit status
- private ContextVM gateway entrypoint and demo client
- session lifecycle tools:
  - `session_open`
  - `session_write`
  - `session_resize`
  - `session_signal`
  - `session_poll`
  - `session_close`

## Local Commands

- `bun run typecheck`
- `bun test`
- `bun run demo:local`
- `bun run src/main.ts`
- `bun run start:contextvm`
- `bun run demo:contextvm`

## Current Shape

- The first demo path runs a direct-host shell.
- The deterministic local demo uses `/bin/sh` so verification does not depend on user-specific
  interactive shell startup.
- `session_write` currently carries terminal input text through `tmux send-keys`, not raw byte
  streams.
- The first Phase 2 path uses a private ContextVM gateway with required encryption, allowed public
  keys, and injected client pubkey ownership binding.
- Browser UI and explicit upload/download are later phases.
- Containerization is deferred to the deployment-hardening phase.

## Docs

- [Project Profile](/workspace/projects/csh/docs/process/project-profile.md)
- [Build Plan](/workspace/projects/csh/docs/plans/build-plan.md)
- [Phased Implementation Plan](/workspace/projects/csh/docs/plans/phased-implementation-plan.md)
- [Decision Log](/workspace/projects/csh/docs/plans/decision-log.md)
- [Local Demo Guide](/workspace/projects/csh/docs/guides/local-demo.md)
- [ContextVM Private Demo](/workspace/projects/csh/docs/guides/contextvm-private-demo.md)
- [Research Overview](/workspace/projects/csh/docs/references/local/contextvm-shell-overview-2026-03-11.md)
