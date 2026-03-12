# Handoff

## Current State

- Active phase: implementation planning review
- Current objective: lock the execution loop and phased implementation plan before coding begins
- Last verified commands:
  - `curl -L 'https://api.github.com/orgs/ContextVM/repos?per_page=100'`
  - `curl -L 'https://raw.githubusercontent.com/ContextVM/contextvm-docs/master/src/content/docs/spec/ctxvm-draft-spec.md'`
  - `curl -L 'https://raw.githubusercontent.com/ContextVM/sdk/master/src/transport/nostr-server-transport.ts'`
  - `curl -L 'https://raw.githubusercontent.com/mobile-shell/mosh/master/README.md'`
  - `curl -L 'https://raw.githubusercontent.com/microsoft/node-pty/master/README.md'`
  - `curl -L 'https://raw.githubusercontent.com/xtermjs/xterm.js/master/README.md'`

## Open Questions

- Which sandbox boundary do we want first: container, namespace/chroot tool, or direct host shell?
- What first deployment boundary do we accept for direct-host execution: dedicated unprivileged user
  only, or containerized shell runtime?

## Next Actions

1. Review `docs/process/implementation-loop.md` and
   `docs/plans/phased-implementation-plan.md`.
2. If approved, start Phase 1 with
   `docs/plans/prompts/phase-1-local-terminal-server.md`.
3. Install and switch to `beads_rust` for tracker-backed slice management when the tool is
   available locally.
4. Keep the upstream SDK routing contribution as a parallel non-blocking track.
