# Handoff

## Current State

- Active phase: Phase 2 implementation
- Current objective: validate the new private ContextVM gateway path against a real relay-backed
  demo
- Last verified commands:
  - `bun run typecheck`
  - `bun run src/main.ts </dev/null`
  - `bun test`
  - `bun run demo:local` with unsandboxed execution in this Codex environment
  - `bun run src/contextvm-gateway.ts` fails fast on missing required env
  - `bun run src/contextvm-demo-client.ts` fails fast on missing required env

## Open Questions

- How fine-grained should the `br` issues be for the Phase 2 loops?
- Do we keep `tmux send-keys` through the first remote demo, or replace it before browser/TUI work
  grows more demanding?
- Which relay should we use for the first real end-to-end ContextVM demo?

## Next Actions

1. Mirror the current plan into `br` issues and use `br` for the next implementation slice.
2. Run the first real gateway/server plus client demo against a chosen relay and real keys.
3. Decide whether `tmux send-keys` is acceptable for the first remote demo or should be replaced
   before broader TUI testing.
4. Keep the upstream SDK routing contribution as a parallel non-blocking track.

## Review Summary

- The repo now contains a working local MCP server over stdio with `session_open`,
  `session_write`, `session_resize`, `session_signal`, `session_poll`, and `session_close`.
- The first runtime slice uses `tmux` directly rather than `node-pty` because it already gives us
  a PTY, durable session state, and scrollback for the fast demo path.
- The review blockers from Phase 1 were fixed: session ownership is enforced, closed sessions now
  report closure and exit status, and `SIGINT` now interrupts the foreground terminal workload.
- A Phase 2 private ContextVM path now exists via `NostrMCPGateway` in per-client mode, with
  required encryption, allowed public keys, and injected client pubkey ownership binding.
- What is still missing is the live relay-backed proof: the new gateway and remote demo client are
  implemented and env-validated, but not yet exercised end-to-end against a real relay in this
  turn.
