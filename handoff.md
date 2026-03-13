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
  - `scripts/contextvm-strfry-relay.sh start`
  - `bun run demo:contextvm` with `CSH_NOSTR_RELAY_URLS=ws://127.0.0.1:10549` completed
    successfully with unsandboxed execution against local `strfry`

## Open Questions

- How fine-grained should the `br` issues be for the Phase 2 loops?
- Do we keep `tmux send-keys` through the first remote demo, or replace it before browser/TUI work
  grows more demanding?
- Do we add a helper-level topology mode or relay probe so the split localhost relay setup is
  harder to misuse?
- Should the skew-tolerant subscription lookback move upstream into the ContextVM SDK once the
  relay timing evidence is summarized cleanly?

## Next Actions

1. Mirror the current plan into `br` issues and use `br` for the next implementation slice.
2. Use local `strfry` plus SSH port forwarding as the primary cross-machine demo topology instead
   of Haven or public relays.
3. Capture the relay timing evidence behind the client timeout and decide whether to upstream the
   client-side subscription lookback into ContextVM.
4. Update `scripts/contextvm-private-demo.sh` or its wrapper docs so localhost relay topologies
   fail earlier when the client-side forwarded port is missing.
5. Decide whether `tmux send-keys` is acceptable for the first remote demo or should be replaced
   before broader TUI testing.

## Review Summary

- The repo now contains a working local MCP server over stdio with `session_open`,
  `session_write`, `session_resize`, `session_signal`, `session_poll`, and `session_close`.
- The first runtime slice uses `tmux` directly rather than `node-pty` because it already gives us
  a PTY, durable session state, and scrollback for the fast demo path.
- The review blockers from Phase 1 were fixed: session ownership is enforced, closed sessions now
  report closure and exit status, and `SIGINT` now interrupts the foreground terminal workload.
- A Phase 2 private ContextVM path now exists via `NostrMCPGateway` in per-client mode, with
  required encryption, allowed public keys, and injected client pubkey ownership binding.
- The live relay-backed proof now exists both against `wss://relay.contextvm.org` and against a
  local `strfry` relay with unsandboxed execution in this Codex environment.
- Haven is not a neutral default relay for this demo because its owner/whitelist policy is separate
  from the demo keys.
- The demo client now uses a bounded response lookback when subscribing for Nostr events so modest
  clock skew does not drop valid relay responses before the client sees them.
- `scripts/contextvm-private-demo.sh setup` now restarts an already-running gateway so relay
  changes actually take effect.
