# Phased Implementation Plan

Status: active

This is the execution plan for turning `csh` from a research baseline into a demoable remote shell
over ContextVM.

## Phase 1: Local MCP Terminal Server

Goal: prove the shell/session model locally before adding ContextVM transport complexity.

### Loop 1.1: Skeleton And Contracts

- Create the server project structure.
- Freeze the v0.1 MCP surface:
  - `session/open`
  - `session/write`
  - `session/resize`
  - `session/signal`
  - `session/poll`
  - `session/close`
- Define session ownership and state shape:
  - session id
  - owner pubkey placeholder/meta
  - cols/rows
  - output cursor
  - exit status
  - last activity

Review after loop:

- contract shape is small enough
- no hidden push assumptions leaked into the design

### Loop 1.2: PTY + tmux Runtime

- Launch shells through `tmux` directly for the first demo path.
- Keep `node-pty` as an optional later refinement if we need lower-level PTY control.
- Decide the first direct-host runtime posture:
  - dedicated unprivileged user on host

Review after loop:

- shell opens
- `tmux` attach/detach behavior is deterministic
- session cleanup rules are explicit

### Loop 1.3: Poll/Ack Output Path

- Implement output buffering and cursor-based reads.
- Make `session/poll` the only output transport for v0.1.
- Cover resize and signal handling.

Review after loop:

- output ordering is stable
- reconnect logic is plausible with current state model

### Loop 1.4: Local Demo And Tests

- Add focused tests around session lifecycle and polling.
- Add a reproducible local demo path.

Checkpoint A:

- local MCP server supports a real text/TUI session
- docs and handoff reflect the actual contract

## Phase 2: Private ContextVM Exposure

Goal: expose the working shell privately over ContextVM with real auth and relay behavior.

### Loop 2.1: Native Server Or Gateway Wiring

- Choose the first exposure path:
  - likely `NostrMCPGateway` if it keeps local MCP testing simple
  - native `NostrServerTransport` only if it reduces moving parts materially

Review after loop:

- chosen path matches the local shell server cleanly

### Loop 2.2: Private Access Control

- Require encryption.
- Gate access by allowed pubkeys.
- Inject client pubkey and bind session ownership to it.

Review after loop:

- sessions cannot cross pubkey boundaries
- unauthenticated or unapproved access fails closed

### Loop 2.3: Relay And Real-World Demo

- Use Applesauce relay handling.
- Start with a small relay set.
- Validate a real shell session over ContextVM.

Checkpoint B:

- remote shell demo works end-to-end
- private access control is real, not conceptual

## Phase 3: Browser UI And File Capabilities

Goal: make the stable shell protocol usable in a browser and add first-class file transfer flows.

### Loop 3.1: Browser Terminal UI

- Build a browser client around the stable poll/ack contract.
- Render with terminal tooling appropriate for text/TUI behavior.

### Loop 3.2: Structured File Capabilities

- Add explicit upload/download flows.
- Keep shell commands available for file operations, but stop relying on them for browser UX.

Checkpoint C:

- browser UI drives the same stable shell contract
- explicit file capabilities exist for browser-centered workflows

## Phase 4: Deployment Hardening

Goal: harden the runtime after the core demo path is proven.

### Loop 4.1: Isolation Strategy

- Evaluate containerization versus lighter host isolation.
- Pick the first hardened deployment shape.

### Loop 4.2: Runtime Packaging

- package the shell runtime with the needed tools
- define mounts, persistence, and `tmux` state handling

Checkpoint D:

- the chosen deployment boundary is tested, not just planned

## Phase 5: Upstream Routing And Push-Oriented Improvements

Goal: improve long-term resource/update behavior without blocking the prototype.

### Loop 5.1: Upstream SDK Contribution

- Execute:
  [contextvm-sdk-resource-routing-plan.md](/workspace/projects/csh/docs/plans/contextvm-sdk-resource-routing-plan.md)

### Loop 5.2: Evaluate Push Updates

- only after upstream or local routing support is solid
- reassess resource subscriptions for screen/snapshot updates

### Loop 5.3: Mosh-Like Improvements

- latency reduction
- reconnect polish
- maybe later speculative local echo

## Parallel Track: Tracker And Review Discipline

For every phase:

- create or claim one `br` issue for each narrow slice
- review after each loop
- update handoff at each major checkpoint
- stop for operator review if a trust-boundary decision changes
