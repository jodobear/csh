# Handoff

## Current State

- Active phase: Phase 1 implementation
- Current objective: harden the local `tmux`-backed MCP terminal server slice and prepare the next
  local demo step before adding ContextVM transport
- Last verified commands:
  - `bun run typecheck`
  - `bun run src/main.ts </dev/null`
  - `bun test`

## Open Questions

- When `beads_rust` is installed locally, how fine-grained should the implementation issues be for
  the Phase 1 and Phase 2 loops?

## Next Actions

1. Add a small local demo path for driving the MCP server interactively and capture the operator
   workflow in docs.
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
  starts, and the `tmux` integration test passes with the repo-local socket path.
