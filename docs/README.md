# Docs Index

This is the repo's docs routing surface.

Use it to decide what is active, what is reference, and what is only historical provenance.

## Startup Read Set

Read these at session start:

1. `AGENTS.md`
2. `docs/README.md`
3. `handoff.md`
4. `docs/process/process-principles.md`
5. `docs/process/implementation-gates.md`
6. `docs/prompts/README.md`
7. active phase prompt, if one exists

Do not bulk-read the rest of `docs/` unless the active work needs it.

## Control Surface

- `handoff.md`
  Current repo state, live gaps, current proof summary, and next actions.
- `docs/process/process-principles.md`
  Canonical process defaults.
- `docs/process/implementation-gates.md`
  Canonical implementation acceptance gate.
- `docs/prompts/README.md`
  Which phase prompt, if any, is active.

## Reference Docs

- `docs/plans/decision-log.md`
  Accepted decisions and reversal triggers.
- `docs/plans/build-plan.md`
  High-level project trajectory.
- `docs/plans/phased-implementation-plan.md`
  Phase structure and sequencing.
- `docs/process/*.md`
  Stable process references and templates.
- `docs/guides/*.md`
  Operator-facing guidance.

## Historical / Provenance Docs

- `docs/comms/transcript.md`
  Append-only project communication log. Not a startup doc.
- `docs/prompts/phase-*.md`
  Completed phase packets unless one is explicitly reactivated.
- `docs/references/local/*.md`
  Research notes and local provenance.

## Repo-Specific Routing Rules

- Keep one canonical doc for each rule set.
- Keep most other docs delta-oriented.
- Treat `handoff.md` as state, not history.
- If a doc no longer controls current work, move it out of the startup path.
- When a refinement lane closes, restore the docs surface to steady state.
