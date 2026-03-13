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
  - `scripts/contextvm-private-demo.sh --help`
  - `scripts/contextvm-private-demo.sh status`
  - `bun run start:contextvm` with `CSH_NOSTR_RELAY_URLS=wss://relay.contextvm.org` in an
    unsandboxed tmux session
  - `bun run demo:contextvm` with `CSH_NOSTR_RELAY_URLS=wss://relay.contextvm.org` completed
    successfully with unsandboxed execution

## Open Questions

- How fine-grained should the `br` issues be for the Phase 2 loops?
- Do we keep `tmux send-keys` through the first remote demo, or replace it before browser/TUI work
  grows more demanding?
- Do we add a helper-level topology mode or relay probe so the split localhost relay setup is
  harder to misuse?

## Next Actions

1. Mirror the current plan into `br` issues and use `br` for the next implementation slice.
2. Standardize the first real demo path on `wss://relay.contextvm.org`, then repeat the demo with
   the Haven split-url topology only after the public-relay path is stable.
3. Update `scripts/contextvm-private-demo.sh` or its wrapper docs so localhost relay topologies
   fail earlier when the client-side forwarded port is missing.
4. Decide whether `tmux send-keys` is acceptable for the first remote demo or should be replaced
   before broader TUI testing.
5. Keep the upstream SDK routing contribution as a parallel non-blocking track.

## Review Summary

- The repo now contains a working local MCP server over stdio with `session_open`,
  `session_write`, `session_resize`, `session_signal`, `session_poll`, and `session_close`.
- The first runtime slice uses `tmux` directly rather than `node-pty` because it already gives us
  a PTY, durable session state, and scrollback for the fast demo path.
- The review blockers from Phase 1 were fixed: session ownership is enforced, closed sessions now
  report closure and exit status, and `SIGINT` now interrupts the foreground terminal workload.
- A Phase 2 private ContextVM path now exists via `NostrMCPGateway` in per-client mode, with
  required encryption, allowed public keys, and injected client pubkey ownership binding.
- The live relay-backed proof now exists against `wss://relay.contextvm.org` with unsandboxed
  execution in this Codex environment.
- The remaining relay-specific gap is the private/Haven topology: the server-local relay path
  exists, but the split client localhost forward needs to be made easier to validate before it is a
  reliable default.
