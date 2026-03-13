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

## Issue Tracking with br (beads_rust)

**Note:** `br` is non-invasive and never executes git commands. After `br sync --flush-only`, you
must manually run `git add .beads/ && git commit`.

Tracker target:

- active tracker: `br`
- current local shell status: if `br` is not visible on `PATH`, keep canonical work state in files
  and switch back to the CLI once it is usable in the shell
- rule: do not let temporary CLI visibility issues block implementation; keep canonical work state
  in files and sync tracker state once `br` is usable

### 0. Preflight

- Read `handoff.md`, `docs/plans/build-plan.md`, and the active phase section of
  `docs/plans/phased-implementation-plan.md`.
- Run `git status --short` before starting.
- If there is no issue for the slice, create one with `br create` before coding.

### 1. Track And Claim

- Check ready work with `br ready`.
- Inspect target issue state with `br show <id>`.
- Claim or update the target issue with `br update <id> ...` when the workflow needs it.
- If new work is discovered, create a linked issue with `br create ...` instead of burying it in
  notes.

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
- Close or update the tracker issue with a real closure reason using `br close` or `br update`.

### 8. Commit Cleanly

- Review `git diff --stat`
- Review `git diff --check`
- Commit one logical slice at a time with a non-ambiguous message
- Do not leave unrelated staged changes mixed into the slice
- If the slice is meant to be runnable from another machine or clone, pushing the verified commit is
  part of the slice closeout, not optional follow-up.

## Major Checkpoints

Run a checkpoint after every wave-sized milestone, not after every micro-slice.

Checkpoint expectations:

- the current phase deliverable works end-to-end at its intended level
- docs reflect the actual system, not the intended one
- open follow-up work is in `br` or explicitly recorded in canonical docs if the CLI is temporarily
  unavailable
- the next phase is still the right next phase
- one explicit review summary is written into `handoff.md`

Major checkpoints for this project:

- Checkpoint A: local MCP terminal server works with `tmux` and poll/ack
- Checkpoint B: private ContextVM exposure works end-to-end for a real session
- Checkpoint C: browser UI can drive the stable shell protocol
- Checkpoint D: deployment hardening choice is exercised, not just planned

## Tracker Habits

- Use `br` for all implementation work items.
- Prefer one active claimed issue at a time unless there is an obvious independent sidecar task.
- Create discovered work immediately with parent linkage.
- Close completed work promptly instead of letting issues drift open.
- When tracker state changes need to be flushed:
  ```bash
  br sync --flush-only
  git add .beads/
  git commit -m "sync beads"
  ```

## Git Habits

- Start each slice with `git status --short`.
- End each slice with `git status --short`, `git diff --stat`, and `git diff --check`.
- Prefer one logical commit per closed slice.
- If tracker state changed in the slice:
  ```bash
  br sync --flush-only
  git add .beads/
  git commit -m "sync beads"
  ```
- If remote readiness is in scope for the session:
  - `git pull --rebase`
  - push after local verification succeeds
  - state the pushed branch or say explicitly that the work is only local
- If remote readiness is deferred, record that explicitly in `handoff.md`.

## Stop Conditions

Stop the current slice and ask for review or clarification if:

- the next change would alter the trust boundary
- the shell/runtime location changes
- the session model needs to break existing contracts
- deployment hardening choices materially change developer workflow
- the slice has turned into two or more logical changes and should be split
