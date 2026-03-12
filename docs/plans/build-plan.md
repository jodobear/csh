# Build Plan

## Current Phase Schedule

- Phase 0: complete transport and architecture research for remote shell sessions over ContextVM.
- Phase 1: prototype an MCP terminal server with PTY-backed sessions, `tmux`, poll/ack output, and
  explicit session ownership/state.
- Phase 2: expose the server over ContextVM with a private pubkey-gated configuration, Applesauce
  relay handling, and sandboxing/containerization decisions recorded in deployment work.
- Phase 3: add browser UI and explicit file capabilities for upload/download, while keeping plain
  shell file access available through the terminal from Phase 1 onward.
- Phase 4: pursue upstream SDK resource-update routing, then evaluate push updates and mosh-like
  improvements after the MVP is stable.

## Quality Gates

- project profile names the canonical technical references and constraints
- a bounded research note exists for the transport/session architecture
- implementation loop exists and is referenced by startup guidance
- phased implementation plan exists with loop reviews and major checkpoints
- upstream contribution plan exists for the SDK routing gap
- handoff reflects the latest verified findings and next actions
- first implementation avoids transport assumptions contradicted by current ContextVM SDK behavior
- v1 roadmap explicitly notes PTY isolation, private/pubkey-gated access, and non-shell admin
  features as separate work

## Open Questions

- Which sandbox boundary do we want first: container, namespace/chroot tool, or direct host shell?
- What first deployment boundary do we accept for direct-host execution: dedicated unprivileged user
  only, or containerized shell runtime?
