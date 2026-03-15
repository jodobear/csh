---
title: Audit Index
doc_type: audit
status: active
owner: csh
read_when:
  - auditing_repo
  - planning_refinement
---

# Audit Index

This directory holds live posture-specific audit docs.

Current repo-default postures:

- [security-exposure-2026-03-15.md](/workspace/projects/csh/docs/audits/security-exposure-2026-03-15.md)
  Identity, authorization, shell exposure, browser exposure, secret handling, and risky defaults.
- [operator-workflow-2026-03-15.md](/workspace/projects/csh/docs/audits/operator-workflow-2026-03-15.md)
  Real operator flow quality: shell UX, reconnect behavior, browser UX, output handling, and verification trust.
- [deployment-resilience-2026-03-15.md](/workspace/projects/csh/docs/audits/deployment-resilience-2026-03-15.md)
  Startup, restart, persistence, cleanup, network assumptions, and verification reliability.

Finding IDs use:

- `<posture>-<area>-<number>`

These are live audit docs, not one-off historical reports. Resolve findings in place or mark them closed explicitly.
