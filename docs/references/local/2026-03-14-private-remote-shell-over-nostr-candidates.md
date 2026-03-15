---
title: "Private remote shell over Nostr: existing-tools candidate comparison"
summary: "Compares the thinnest adopt/adapt/build paths for a private remote shell over Nostr and recommends ContextVM transport plus an existing PTY MCP server as the first bake-off target."
status: draft
classification: project-local
domains: ["nostr", "mcp", "remote-shell", "pty"]
projects: ["csh"]
source_refs:
  - "https://jsr.io/@contextvm/gateway-cli"
  - "https://jsr.io/@contextvm/proxy-cli"
  - "https://github.com/ianks/terminal-mcp"
  - "https://github.com/iris-networks/terminal_mcp"
  - "https://github.com/cfdude/super-shell-mcp"
created_on: 2026-03-14
updated_on: 2026-03-14
pack:
promotion_target:
related_docs:
  - "docs/process/buy-before-build.md"
  - "docs/plans/build-plan.md"
  - "handoff.md"
reviewed_on:
reviewed_by:
---

# Private remote shell over Nostr: existing-tools candidate comparison

## Question

What is the thinnest existing-tools-first path to a private remote shell over Nostr, and which
candidate should be the first Phase 0 bake-off target?

## Findings

- The thinnest transport path is to adopt ContextVM's existing Nostr MCP transport rather than
  inventing a Nostr-specific shell protocol. `gateway-cli` exposes a local stdio MCP server over
  Nostr and `proxy-cli` brings a remote Nostr MCP server back to a local stdio MCP client.
- The best first shell backend candidate is a PTY-capable MCP server, not a command runner. A real
  PTY is required for an interactive remote shell with usable input handling and session continuity.
- `terminal-mcp` was the strongest first bake-off target on paper because it explicitly provides
  real PTY shell sessions, async execution, and session persistence, which is closer to the project
  goal than one-shot command tools.
- The first local bake-off showed `terminal-mcp` currently fails to build from the checked GitHub
  head because its `rmcp` usage is out of sync with the current upstream API.
- `terminal_mcp` built successfully in the local bake-off, exposed a working MCP endpoint over
  StreamableHTTP, and preserved shell state across repeated `persistent_shell` calls.
- `super-shell-mcp` is useful as a safety-oriented command server, but it does not present itself
  as a real PTY session server, so it is a weaker fit for a human-operated remote shell.
- A bounded search did not surface a mature Nostr-native remote shell project that is thinner than
  reusing ContextVM transport plus an existing PTY MCP server. That makes custom Nostr shell
  protocol work unjustified at this stage.

## Evidence

- Source: `@contextvm/gateway-cli` on JSR describes the package as a CLI for exposing local MCP
  servers via ContextVM over Nostr and documents relay URLs, allowlisted public keys, and server
  private-key configuration.
- Source: `@contextvm/proxy-cli` on JSR describes the package as a CLI that connects to remote
  ContextVM servers and exposes them locally via stdio for existing MCP clients, using relay URLs,
  a client private key, and a target server public key.
- Source: [`terminal-mcp`](https://github.com/ianks/terminal-mcp) documents real shell sessions via
  PTY, session persistence, and asynchronous terminal interaction.
- Source: [`terminal_mcp`](https://github.com/iris-networks/terminal_mcp) documents persistent
  shell sessions plus command execution over MCP, with Streamable HTTP support.
- Source: [`super-shell-mcp`](https://github.com/cfdude/super-shell-mcp) documents shell command
  execution, whitelist controls, and approval modes, but not a real PTY-backed interactive shell.
- Local bake-off:
  - `cargo install --git https://github.com/ianks/terminal-mcp terminal-mcp --root /tmp/csh-bakeoff/terminal-mcp`
    failed with Rust compile errors in `src/service.rs`, including `E0639` for non-exhaustive
    struct construction and `E0063` for missing `description` on `rmcp::model::Implementation`.
  - `go build -o /tmp/csh-bakeoff/mcp-terminal-server` from a clone of
    `https://github.com/iris-networks/terminal_mcp` succeeded.
  - MCP initialization against `http://127.0.0.1:18080/mcp` returned protocol `2024-11-05` and a
    working session ID.
  - Repeated `persistent_shell` calls in session `phase0-demo` changed the working directory from
    `/workspace/projects/csh` to `/tmp`, confirming session continuity.

## Implications

- Recommended first implementation path: adopt ContextVM transport with thin glue only.
  Path: `proxy-cli` on the client side -> Nostr relays -> `gateway-cli` on the host side ->
  `terminal_mcp` as the local MCP shell server.
- Keep `terminal-mcp` on the watchlist, but do not make it the first implementation target until
  its upstream `rmcp` incompatibility is fixed or pinned to a known-good revision.
- The first custom code, if any, should stay limited to launch scripts, small wrappers, or policy
  glue around keys, relays, and process startup.
- Do not build a custom browser UI, shell protocol, or Nostr message layer until the recommended
  path has been trialed and a concrete gap is recorded.

## Promotion Assessment

- Suggested classification: project-local
- Suggested destination: none yet
- Why: the comparison is tightly coupled to this repo's buy-before-build decision and candidate
  shortlist.

## Open Questions

- Can `gateway-cli` launch or wrap `terminal_mcp` directly enough that no additional adapter is
  needed?
- Does `terminal_mcp` behave well enough over the full ContextVM round-trip for an interactive
  human shell, or does it need terminal-specific buffering or resize glue?
- Is relay and key configuration with ContextVM sufficient for the project's private-access
  requirement without additional authorization glue?
