# Handoff

## Current State

- Active phase: Phase 3 implementation
- Current objective: land the first browser terminal UI slice without regressing the working
  ContextVM CLI demos
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
  - `bun run demo:contextvm:interactive` with `CSH_NOSTR_RELAY_URLS=ws://127.0.0.1:10549`
    completed successfully with unsandboxed execution against local `strfry`
  - `bun run start:browser` with unsandboxed execution
  - localhost browser-bridge API smoke for `session_open` -> `session_write` -> `session_poll` ->
    `session_close` with unsandboxed execution

## Open Questions

- Do we keep `tmux send-keys` through the first remote demo, or replace it before browser/TUI work
  grows more demanding?
- When should the browser client move from the local bridge to a direct ContextVM-aware web path?
- Should the skew-tolerant subscription lookback move upstream into the ContextVM SDK once the
  relay timing evidence is summarized cleanly?

## Next Actions

1. Review the first browser UI slice from terminal-behavior and UX angles before broadening it.
2. Decide whether `tmux send-keys` is acceptable for browser typing or whether common control-input
   handling should be strengthened before wider TUI/browser testing.
3. Choose the next Phase 3 loop ordering: richer browser UX polish versus explicit upload/download
   capabilities.
4. Decide when the browser path should stop being local-first and start speaking to the private
   ContextVM deployment shape directly.

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
- The repo has now verified the remote interactive shell path from a separate client machine using
  local `strfry` plus `ssh -L`, not just same-host scripted proofs.
- Haven is not a neutral default relay for this demo because its owner/whitelist policy is separate
  from the demo keys.
- The demo client now uses a bounded response lookback when subscribing for Nostr events so modest
  clock skew does not drop valid relay responses before the client sees them.
- The repo now includes an interactive ContextVM demo client that forwards local terminal input to
  the remote session, resizes with the local terminal, and exits cleanly when the remote shell
  closes.
- `scripts/contextvm-private-demo.sh setup` now restarts an already-running gateway so relay
  changes actually take effect.
- Phase 3.1 now has a first browser terminal UI at `bun run start:browser`.
- The browser server is intentionally narrow: it serves an xterm-based page and proxies the
  existing `session_*` tool contract over a local HTTP API via stdio MCP.
- This keeps the shell/session backend and the working private ContextVM CLI demo path unchanged
  while giving the project a real browser UX loop to iterate on.
