# Process Principles

## Frozen Defaults

- `D-001` Shared imports should be pinned snapshots, not live-coupled references.
- `D-002` Work advances one phase at a time with one prompt per phase.
- `D-003` Material decisions require tradeoff records and decision-log updates.
- `D-004` New project research should start in a standard `docs/references/` layout.
- `D-005` New projects may begin from a kickoff prompt and references rather than pre-filled
  starter files.
- `D-006` Prefer buy/adapt over build when existing tools already cover the core requirement.
- `D-007` Implementation phases must satisfy explicit acceptance gates before being called complete.

## Decisions

- `P01` Rule: canonical artifacts outrank conversational context.
- `P02` Rule: clarifying questions come before risky guesses.
- `P03` Rule: prompts must be operational and phase-local.
- `P04` Rule: defaults change only through explicit decisions.
- `P05` Rule: update `handoff.md` after meaningful progress.
- `P06` Rule: keep research notes structured so they can later stay local or be promoted.
- `P07` Rule: prompt-driven kickoff may draft starter artifacts, but implementation waits for a
  review checkpoint.
- `P08` Rule: before building a new core layer, produce a buy/adapt/build comparison unless the
  operator explicitly asks for greenfield implementation.
- `P09` Rule: no implementation phase closes on happy-path verification alone; claims, negative
  cases, trust boundaries, lifecycle behavior, and operator-facing behavior must be reviewed
  explicitly.
- `P10` Rule: an active implementation phase must have a checked-in phase prompt and a checked-in
  claims-vs-proof record before `handoff.md` can describe that phase as closed.
- `P11` Rule: surface basic git state at startup without ceremony: whether the repo is initialized,
  current branch, HEAD commit or no-commit state, remotes present or absent, and whether work is
  still only local.
