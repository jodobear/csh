---
title: "ContextVM shell transport research"
summary: "Source-backed research on delivering SSH-like and mosh-like remote shell sessions with
  scrollback over ContextVM."
status: draft
classification: undecided
domains:
  - contextvm
  - nostr
  - mcp
  - terminal
projects:
  - csh
source_refs:
  - https://github.com/ContextVM/sdk
  - https://github.com/ContextVM/contextvm-docs
  - https://github.com/ContextVM/gateway-cli
  - https://github.com/ContextVM/proxy-cli
  - https://github.com/ContextVM/cvmi
  - https://github.com/mobile-shell/mosh
  - https://github.com/microsoft/node-pty
  - https://github.com/xtermjs/xterm.js
created_on: 2026-03-11
updated_on: 2026-03-12
pack:
promotion_target:
related_docs:
  - /workspace/projects/csh/docs/process/project-profile.md
  - /workspace/projects/csh/docs/plans/build-plan.md
  - /workspace/projects/csh/handoff.md
reviewed_on:
reviewed_by:
---

# ContextVM shell transport research

## Question

How should `csh` deliver an SSH-like, and ideally mosh-like, interactive shell with scrollback over
ContextVM given the current protocol, SDK, and surrounding ecosystem as of 2026-03-11?

## Findings

- ContextVM already has the transport and bridge primitives needed to carry a remote shell protocol:
  `NostrClientTransport`, `NostrServerTransport`, `NostrMCPProxy`, `NostrMCPGateway`,
  `gateway-cli`, `proxy-cli`, and `cvmi` are all present in the public org and current docs.
- The current SDK is recent enough to matter to the design. The public `@contextvm/sdk`
  `package.json` reports version `0.7.2`, and the changelog shows recent work on relay discovery
  (CEP-17) and ephemeral encrypted envelopes (CEP-19).
- ContextVM is suitable for authenticated, encrypted, stateful PTY session control, but it is not a
  literal drop-in transport for the mosh protocol. Current ContextVM traffic is MCP over Nostr
  events; mosh itself uses SSH only for bootstrap and then switches the terminal session to UDP with
  speculative local echo and roaming.
- ContextVM's wire shape is explicitly ephemeral by default. The protocol spec defines kind `25910`
  for all ContextVM messages and CEP-19 adds ephemeral encrypted gift wraps (`21059`). That means
  reconnect and scrollback must come from server-side session durability and resynchronization, not
  from relay history.
- The cleanest standards-aligned MCP shape for an interactive shell is a stateful session API plus
  resources for current screen and scrollback, but the current server transport is not fully ready
  for per-client `notifications/resources/updated` routing. In the SDK source,
  `NostrServerTransport.handleNotification()` explicitly special-cases `notifications/progress` and
  leaves `notifications/resources/updated` as a TODO before falling back to broadcast behavior.
- The gateway path is strong for an MVP. `NostrMCPGateway` already supports per-client MCP transport
  creation, closes stateful transports on re-initialization, and cleans up transports on session
  eviction. That allows the shell protocol to be developed first as a normal MCP server, then
  exposed on Nostr.
- `node-pty` is the right PTY primitive for the server side. Its README is explicit that it
  provides `forkpty(3)` bindings, reads/writes, resize support, and flow control. It is also
  explicit that child processes run with the same privilege as the server and recommends
  containerization for internet-facing usage.
- `xterm.js` provides a direct path to reconnectable terminal state. Its README documents
  `@xterm/headless` as a Node-side terminal model and gives reconnection/state restoration via the
  serialize addon as a concrete use case.
- For a first pass, polling is safer than push. Because current ContextVM server-side notification
  routing is request-centric, a `session/poll` or `session/read` tool with cursor-based acknowledged
  chunks avoids the SDK routing gap and avoids overloading relays with chatty server broadcasts.
- The current project direction is now explicit: start private and pubkey-gated, use `tmux`, keep
  the session model explicit, treat browser UI and upload/download as later phases, and pursue the
  SDK routing fix as an upstream contribution rather than a blocker for v1.
- The chosen execution model is direct-host shell access for v0.1. Downstream SSH agent forwarding,
  port forwarding, and other SSH-parity features are deferred.
- True mosh parity should be treated as a later optimization target, not the MVP contract. The best
  short-term target is "mosh-like resilience" rather than "mosh protocol compatibility": resumable
  sessions, durable scrollback, reconnect after relay or network loss, and maybe later predictive
  local echo.

## Evidence

- Source: `ContextVM/sdk` README, `package.json`, and `CHANGELOG.md`
- Source: `ContextVM/contextvm-docs` protocol spec, TS SDK transport docs, gateway docs, proxy docs,
  CEP-17, and CEP-19
- Source: `ContextVM/sdk` source files
  `src/transport/nostr-server-transport.ts`,
  `src/transport/nostr-client-transport.ts`, and `src/gateway/index.ts`
- Source: `ContextVM/gateway-cli` README
- Source: `ContextVM/proxy-cli` README
- Source: `ContextVM/cvmi` README
- Source: `mobile-shell/mosh` README
- Source: `microsoft/node-pty` README
- Source: `xtermjs/xterm.js` README

## Implications

- Recommended MVP architecture:
  - Build a normal MCP terminal server first.
  - Back it with `node-pty` sessions and either:
    - a direct PTY plus an internal ring buffer, or
    - a PTY attached to `tmux` for durable scrollback and reconnect.
  - Expose it over ContextVM with `NostrMCPGateway` or `gateway-cli`.
- Recommended v1 shell surface:
  - `session/open`
  - `session/write`
  - `session/resize`
  - `session/signal`
  - `session/poll`
  - `session/snapshot`
  - `session/close`
- Recommended later feature lanes:
  - browser UI after the shell protocol stabilizes
  - upload/download as explicit capabilities rather than implied by terminal access
  - upstream SDK routing enhancement before moving to push-based resource updates
  - downstream SSH/forwarding features only if later workflows require SSH-parity behavior
- Recommended session model:
  - use opaque session ids
  - bind sessions to the authenticated Nostr pubkey
  - keep a cursor or sequence number per output stream
  - return chunked VT output and exit status from `session/poll`
  - expose current display and scrollback as resources only after the transport routing gap is
    patched or otherwise handled safely
- Recommended reconnect model:
  - keep shell state on the server
  - let the client reattach by session id
  - rebuild the display from either:
    - `@xterm/headless` serialized state, or
    - `tmux capture-pane` / reattach behavior
- Recommended security posture for v1:
  - require encryption
  - prefer CEP-19 ephemeral gift wraps when both peers support them
  - use `allowedPublicKeys` and `injectClientPubkey`
  - run PTYs inside a container or other sandbox
  - treat public server announcements as out of scope unless the shell is intentionally public
- Recommended product boundary:
  - do not tunnel raw SSH packets over ContextVM
  - do not claim raw mosh compatibility in v1
  - treat the product as "remote shell over ContextVM" with optional SSH adapters later if needed
- Recommended follow-up transport work:
  - patch `NostrServerTransport` so `notifications/resources/updated` can be routed to the correct
    client/session rather than broadcast
  - only after that patch, evaluate push-based resource subscription updates for lower-latency UI
  - keep speculative local echo and screen-delta work as a later phase

## Promotion Assessment

- Suggested classification: undecided
- Suggested destination:
- Why: the findings mix reusable ContextVM transport knowledge with project-specific shell design
  recommendations.

## Open Questions

- Is the first target a shell running directly on the ContextVM host, or an adapter that launches
  `ssh` to a second machine?
- Is `tmux` acceptable as a hard runtime dependency for v1?
- Should the first client be a custom terminal UI, or a bridge that lets another tool render the
  shell?
- Do we want lower-latency push updates badly enough to patch the SDK before the first prototype?
