# Project Profile

The agent may draft this file from a seed prompt and references before the operator edits it.

## Project Identity

- Project Name: csh
- Purpose: ContextVM-based remote shell project with SSH-like usability and mosh-like resilience as
  a later target
- Success Criteria:
  - a first implementation can open and maintain an interactive remote shell using ContextVM rather
    than standard SSH transport
  - reconnect and scrollback are deliberate parts of the design rather than afterthoughts
  - local research and planning artifacts are current enough to drive implementation without
    redoing discovery
- In Scope:
  - ContextVM and Nostr transport research relevant to remote shell sessions
  - MCP session design for terminal input, output, resize, reconnect, and scrollback
  - terminal backend evaluation for PTY, `tmux`, and reconnectable screen state
  - roadmap work for browser UI and upload/download capabilities after the core shell path is stable
- Out Of Scope:
  - raw SSH packet tunneling over ContextVM in the first pass
  - claiming literal mosh protocol compatibility in the first pass
  - downstream SSH agent forwarding and port forwarding in v0.1
  - replacing `gymnasium` as the shared corpus

## Canonical References

- Primary references:
  - `ContextVM/contextvm-docs` protocol spec, CEPs, and TS SDK docs
  - `ContextVM/sdk` README, changelog, and transport source
  - `docs/references/local/contextvm-shell-overview-2026-03-11.md`
- Secondary references:
  - `ContextVM/gateway-cli`
  - `ContextVM/proxy-cli`
  - `ContextVM/cvmi`
  - `mobile-shell/mosh`
  - `microsoft/node-pty`
  - `xtermjs/xterm.js`

## Technical Profile

- Language/toolchain: TypeScript/Node or Bun for the first implementation because the official
  ContextVM SDK, gateway, proxy, and terminal ecosystem are strongest there
- Dependency policy: prefer official ContextVM SDK components and off-the-shelf PTY/terminal
  libraries over inventing a custom Nostr transport stack
- Architecture constraints:
  - ContextVM transport is Nostr-event-based and ephemeral by default
  - reconnect must be driven by server-side session durability and client resync
  - v0.1 executes a direct-host shell, not an SSH adapter hop
  - the first protocol should fit MCP cleanly before adding transport-specific optimizations
  - the first client surface is text/TUI; browser UI comes after the session protocol stabilizes
- Safety/security/performance constraints:
  - remote shell access must be encrypted and pubkey-scoped
  - PTY execution should be isolated from the host environment where deployment permits
  - output framing must tolerate relay variability and should avoid unbounded push fan-out

## Verification Profile

- Build commands:
  - `bun run typecheck`
  - `bun run src/main.ts`
- Test commands:
  - `bun test`
  - note: tests use a repo-local `tmux` socket under `.csh-runtime/`, so they run inside the
    default workspace sandbox
- Quality gates:
  - terminal session open/write/resize/close paths are deterministic and source-backed
  - reconnect restores a usable screen and scrollback view
  - multi-client routing does not leak session state across pubkeys

## Process Profile

- Delivery phases:
  - Phase 0 research baseline
  - Phase 1 MCP terminal server prototype
  - Phase 2 ContextVM exposure and reconnect validation
  - Phase 3 browser UI and file transfer capabilities
  - Phase 4 deployment hardening
  - Phase 5 upstream push-routing work and mosh-like optimization experiments
- Issue tracking method: file-first until `beads_rust` is installed locally; the implementation loop
  remains tracker-agnostic until then
- Remote/push policy: commit each logical slice locally after verification; remote publishing is
  optional until the first demo path is stable
- Session-end workflow: update `handoff.md` after meaningful progress, record any accepted scope or
  architecture shifts in `docs/plans/decision-log.md`, and leave the tree in a reviewable state
