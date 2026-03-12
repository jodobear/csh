# Phase 1: Local Terminal Server

Goal: build the first demoable MCP terminal server locally before exposing it over ContextVM.

## Inputs

- `AGENTS.md`
- `docs/process/project-profile.md`
- `docs/process/implementation-loop.md`
- `docs/plans/build-plan.md`
- `docs/plans/phased-implementation-plan.md`
- `docs/references/local/contextvm-shell-overview-2026-03-11.md`
- `handoff.md`

## Required Work

- scaffold the local server implementation
- freeze the phase-1 session contract in code
- implement PTY-backed sessions with `tmux`
- implement poll/ack output flow
- add minimal tests and a reproducible local demo path

## Required Output

- working local MCP terminal server
- updated `handoff.md`
- updated `docs/plans/build-plan.md` if sequencing changed
- `br` issues for discovered follow-up work

## Review Loop

- close each logical slice through the implementation loop in
  `docs/process/implementation-loop.md`
- stop for a checkpoint review after the local demo works end-to-end

## Exit Criteria

- a real shell can be opened locally
- text/TUI interaction works through poll/ack
- session ownership and lifecycle are explicit in code and docs
