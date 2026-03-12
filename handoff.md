# Handoff

## Current State

- Active phase: Phase 1 implementation
- Current objective: finish Phase 1 local validation work and decide the next slice before adding
  ContextVM transport
- Last verified commands:
  - `bun run typecheck`
  - `bun run src/main.ts </dev/null`
  - `bun test`
  - `bun run demo:local` with unsandboxed execution in this Codex environment

## Open Questions

- When `beads_rust` is installed locally, how fine-grained should the implementation issues be for
  the Phase 1 and Phase 2 loops?
- When we move beyond the deterministic `/bin/sh` demo, do we keep `tmux send-keys` as the default
  input path or invest immediately in a lower-level PTY input path for richer TUI fidelity?

## Next Actions

1. Decide the next input-path slice:
   keep `tmux send-keys` for early remote demos, or replace it with a lower-level PTY write path.
2. Tighten Phase 1 session behavior around ownership metadata, cleanup semantics, and polling
   expectations.
3. Install and switch to `beads_rust` for tracker-backed slice management when the tool is
   available locally.
4. Keep the upstream SDK routing contribution as a parallel non-blocking track.

## Review Summary

- The repo now contains a working local MCP server over stdio with `session_open`,
  `session_write`, `session_resize`, `session_signal`, `session_poll`, and `session_close`.
- The first runtime slice uses `tmux` directly rather than `node-pty` because it already gives us
  a PTY, durable session state, and scrollback for the fast demo path.
- Verification is currently strong enough for local slice closure: typecheck passes, the server
  starts, the `tmux` integration test passes, and the deterministic local demo shows real command
  execution under `/bin/sh`.
- The current reliability tradeoff is explicit: input is driven through `tmux send-keys`, which is
  good enough for the first demo path but not the final answer for raw TUI fidelity.
