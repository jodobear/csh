# AGENTS.md

## Startup Order

1. `./agent-brief`
2. `AGENTS.md`
3. `docs/README.md`
4. `handoff.md`
5. `docs/process/process-principles.md`
6. `docs/process/implementation-gates.md`
7. `docs/prompts/README.md`
8. active phase prompt, if one exists

Use `docs/README.md` to route any additional reading. Do not bulk-read all planning, guide, and reference docs by default.

## Artifact Authority

- Project-local plans, decision log, and handoff are canonical for this repo.
- Imported shared references are stable inputs, not live-coupled authority.
- `packs.lock` records pinned shared imports for this repo.
- Local project decisions may narrow shared defaults explicitly.

## Core Rules

- Respect canonical artifact precedence.
- Work one phase at a time.
- Use one prompt per phase.
- Record tradeoffs for material decisions.
- Ask clarifying questions before risky work.
- Run a simple git-state check at startup and surface it plainly: repo initialized or not, branch, HEAD or no commits, remotes present or absent, and whether work is only local.
- Treat implementation phases as incomplete until the implementation gates are checked explicitly.
- Prefer buy/adapt over build when existing tools already cover the core requirement; custom code should be glue unless a concrete gap is documented.
- If the operator provides only a kickoff prompt and references, draft the project profile and
  first research notes before asking for plan confirmation.
- Start research in `docs/references/local/` using the local research note template.
- Record project communication in `docs/comms/transcript.md`.
- Keep research notes classified so they can later be promoted or kept project-local.
- Update `handoff.md` after meaningful progress.
