# Audit Lenses

Repo-local audit lenses for `csh`.

## Active Lenses

- `security-exposure`
  Question: does this change widen shell exposure, weaken identity/authz, mishandle secrets, or rely on unsafe trust assumptions?
  Finding ID prefix: `security-exposure-*`
- `operator-workflow`
  Question: does this change make the real operator flow fragile, misleading, noisy, or hard to recover?
  Finding ID prefix: `operator-workflow-*`
- `deployment-resilience`
  Question: does this change make startup, restart, persistence, cleanup, or network-path behavior less reliable in production?
  Finding ID prefix: `deployment-resilience-*`

## Active Audits

- [security-exposure-2026-03-15.md](/workspace/projects/csh/docs/audits/security-exposure-2026-03-15.md)
