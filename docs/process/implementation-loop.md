# Implementation Loop

Project-local execution loop for `csh`.

This adapts the shared files-first model and the stricter `noztr` loop ideas into something lighter
for a product prototype: small autonomous slices, review after each slice, and explicit checkpoints
after each larger wave.

## Canonical State

Use files for plans, decisions, and handoff. Use the tracker only for work graph state.

Canonical project artifacts:

- `docs/process/project-profile.md`
- `docs/plans/phased-implementation-plan.md`
- `docs/plans/build-plan.md`
- `docs/plans/decision-log.md`
- `handoff.md`
- research notes in `docs/references/local/`

Tracker-only state:

- ready work
- dependencies
- claims
- open/closed task status

## Small-Slice Loop

Run this loop for every logical implementation slice.

Tracker target:

- preferred future tracker: `beads_rust`
- current local status: not installed in this workspace yet
- rule: do not let missing tracker tooling block implementation; keep canonical work state in files

### 0. Preflight

- Read `handoff.md`, `docs/plans/build-plan.md`, and the active phase section of
  `docs/plans/phased-implementation-plan.md`.
- Run `git status --short` before starting.
- If the tracker is available and there is no issue for the slice, create one before coding.

### 1. Track And Claim

- Check ready work in the active tracker when available.
- Claim the target issue atomically when the tracker supports claims.
- If new work is discovered, create a linked issue instead of burying it in notes.

### 2. Freeze The Slice

- Define one narrow outcome with acceptance criteria before editing.
- Keep the slice to one of:
  - one API surface addition
  - one session-state change
  - one transport integration step
  - one UI slice
  - one deployment/hardening slice

### 3. Implement

- Make the smallest coherent code change that can pass verification.
- Add tests in the same slice when the behavior is stable enough to verify.
- Do not mix unrelated refactors into the slice.

### 4. Review Pass A: Correctness

- Review the diff for:
  - behavioral regressions
  - ownership/session leaks
  - auth or isolation mistakes
  - broken assumptions against the current plan or research

### 5. Verify

- Run the narrowest useful checks first, then the next broader gate if needed.
- Minimum expectation for a closed slice:
  - relevant tests or reproducible manual check
  - no known broken state left behind silently

### 6. Review Pass B: Quality

- Review again for:
  - overengineering
  - missing tests
  - weak naming or confusing flow
  - style consistency
  - whether the slice should be split before commit

### 7. Record

- Update the relevant canonical docs if the slice changed plan, scope, or new risks.
- Update `handoff.md` after meaningful progress.
- Close or update the tracker issue with a real closure reason when tracker tooling is active.

### 8. Commit Cleanly

- Review `git diff --stat`
- Review `git diff --check`
- Commit one logical slice at a time with a non-ambiguous message
- Do not leave unrelated staged changes mixed into the slice

## Major Checkpoints

Run a checkpoint after every wave-sized milestone, not after every micro-slice.

Checkpoint expectations:

- the current phase deliverable works end-to-end at its intended level
- docs reflect the actual system, not the intended one
- open follow-up work is in the active tracker or explicitly recorded in canonical docs if tracker
  setup is still pending
- the next phase is still the right next phase
- one explicit review summary is written into `handoff.md`

Major checkpoints for this project:

- Checkpoint A: local MCP terminal server works with `tmux` and poll/ack
- Checkpoint B: private ContextVM exposure works end-to-end for a real session
- Checkpoint C: browser UI can drive the stable shell protocol
- Checkpoint D: deployment hardening choice is exercised, not just planned

## Tracker Habits

- Use `beads_rust` once it is installed for all implementation work items.
- Prefer one active claimed issue at a time unless there is an obvious independent sidecar task.
- Create discovered work immediately with parent linkage.
- Close completed work promptly instead of letting issues drift open.

## Git Habits

- Start each slice with `git status --short`.
- End each slice with `git status --short`, `git diff --stat`, and `git diff --check`.
- Prefer one logical commit per closed slice.
- If remote readiness is in scope for the session:
  - `git pull --rebase`
  - push after local verification succeeds
- If remote readiness is deferred, record that explicitly in `handoff.md`.

## Stop Conditions

Stop the current slice and ask for review or clarification if:

- the next change would alter the trust boundary
- the shell/runtime location changes
- the session model needs to break existing contracts
- deployment hardening choices materially change developer workflow
- the slice has turned into two or more logical changes and should be split
