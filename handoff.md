# Handoff

## Current State

- Active phase: Phase 1 implementation
- Current objective: close the Phase 1 hardening wave and prepare the private ContextVM transport
  slice
- Last verified commands:
  - `bun run typecheck`
  - `bun run src/main.ts </dev/null`
  - `bun test`
  - `bun run demo:local` with unsandboxed execution in this Codex environment

## Open Questions

- How fine-grained should the `br` issues be for the Phase 2 loops?
- Do we keep `tmux send-keys` through the first remote demo, or replace it before browser/TUI work
  grows more demanding?

## Next Actions

1. Mirror the current plan into `br` issues and use `br` for the next implementation slice.
2. Start Phase 2 private ContextVM exposure with pubkey-bound session ownership.
3. Decide whether `tmux send-keys` is acceptable for the first remote demo or should be replaced
   before broader TUI testing.
4. Keep the upstream SDK routing contribution as a parallel non-blocking track.

## Review Summary

- The repo now contains a working local MCP server over stdio with `session_open`,
  `session_write`, `session_resize`, `session_signal`, `session_poll`, and `session_close`.
- The first runtime slice uses `tmux` directly rather than `node-pty` because it already gives us
  a PTY, durable session state, and scrollback for the fast demo path.
- Verification is currently strong enough for local slice closure: typecheck passes, the server
  starts, the `tmux` integration test passes, and the deterministic local demo shows real command
  execution under `/bin/sh`.
- The review blockers from Phase 1 were fixed: session ownership is enforced, closed sessions now
  report closure and exit status, and `SIGINT` now interrupts the foreground terminal workload.
- The current remaining tradeoff is explicit: input is driven through `tmux send-keys`, which is
  good enough for the first demo path but not the final answer for raw TUI fidelity.
