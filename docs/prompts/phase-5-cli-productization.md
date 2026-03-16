# Phase 5: CLI Productization

Goal: make `csh` feel like a normal operator tool by shipping an installable Bun-backed CLI,
clear deployment guidance, and a tighter operator surface without expanding architecture.

Target findings:
- operator-workflow-cli-01
- operator-workflow-shell-01
- deployment-resilience-install-01
- DOC-guides-01

## Inputs
- `handoff.md`
- `docs/guides/server-setup.md`
- `scripts/csh.ts`
- `scripts/config.ts`
- `src/contextvm-interactive-client.ts`
- `src/browser/app.ts`

## Synchronization Touchpoints
- teaching surface: yes; README, guides, examples, and install flow change
- audit state: yes; close with a fresh posture-based audit of the new CLI/deployment surface
- startup/discovery surface: yes; handoff and docs routing need the new stable guide references

## Required Work
- add a Bun-backed install script that places `csh` on `PATH`
- add CLI polish commands for install, version, status, doctor, and completion
- improve shell/browser operator-facing output so the working path is clearer
- expand deployment guidance around install, relay posture, `systemd`, and browser auth/TLS
- rerun verification and audit the updated codebase through the repo audit lenses

## Required Output
- `scripts/install-cli.sh`
- `docs/guides/server-setup.md`
- `docs/audits/*.md`
- `handoff.md`

## Acceptance Gates
- claims and proof table
- environment matrix
- negative tests
- trust-boundary review
- lifecycle/restart behavior
- operator UX review

## Clarifying Question Gate
- stop if packaging, install location, or operator workflow assumptions become risky
- otherwise keep the slice narrow and Bun-backed

## Exit Criteria
- `csh` can be installed to a normal user bin directory with a repo-backed launcher
- CLI has natural operator commands for install, version, status, doctor, and completion
- deployment guide matches the current verified product surface
- a fresh audit packet records the post-polish state
- phase is not complete until the implementation-gate categories are explicitly checked
