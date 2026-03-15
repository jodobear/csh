# Build Plan

## Current Phase Schedule

- Phase 0: research and compare existing projects that can provide remote shell over Nostr with minimal custom code
- Phase 1: compose the thinnest working path from the selected existing projects
- Phase 2: implement only the concrete gaps that remain after the bake-off
- Phase 3: apply the implementation acceptance gates, audit the real behavior, and fix the issues exposed by that audit

## Current Status

- Phase 0: complete
- Phase 1: complete
- Phase 2: functionally advanced but not ready to close without an acceptance audit
- Phase 3: active

## Quality Gates

- the buy-before-build brief is part of the startup canon
- the implementation-gate brief is part of the startup canon
- the project profile is filled in
- a bounded candidate comparison note exists
- a phased implementation plan exists before implementation starts
- no greenfield shell implementation begins before the candidate bake-off concludes
- an explicit review checkpoint is written into `handoff.md` before Phase 1 starts
- implementation claims are backed by explicit proof, not only by intent or one happy-path demo
- negative cases, trust boundaries, lifecycle/restart behavior, and operator UX are reviewed before
  phase closure
- decision log and handoff are current

## Open Questions

- Should the repo keep the optional external `proxy-cli` binary path now that the local SDK proxy works?
- What is the minimum packaging needed for a clean operator-facing handoff?
