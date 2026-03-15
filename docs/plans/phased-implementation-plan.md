# Phased Implementation Plan

Status: in progress

This is the execution plan for turning the project from a research baseline into a working result.

Implementation note:

- every non-research phase must define explicit implementation acceptance gates before closure
- phase closure requires claims-vs-proof evidence, negative testing, trust-boundary review,
  lifecycle/restart review, and operator-UX review when applicable

## Phase 0: Research And Candidate Bake-Off

Goal: identify the thinnest existing-tools-first path and reject unnecessary greenfield work early.

### Loop 0.1: Requirement Tightening

- restate the user-visible goal
- restate hard rules and non-goals
- confirm the buy/adapt/build posture

Review after loop:

- the brief is narrow
- no hidden product expansion remains

### Loop 0.2: Candidate Comparison

- list the strongest existing candidates
- compare adopt/adapt/build options
- record concrete blockers instead of vague concerns

Review after loop:

- at least one viable candidate path exists, or the missing gap is explicit

### Loop 0.3: Initial Bake-Off

- run the narrowest useful evaluation of the top candidate paths
- record what works, what fails, and what custom code is still necessary

Checkpoint A:

- the first implementation path is chosen
- rejected paths and tradeoffs are recorded

## Phase 1: Thin Composition

Goal: compose the chosen path with the minimum custom glue needed for a working result.

Current progress:

- repo-local runtime installer added for `gateway-cli` and `terminal_mcp`
- repo-local host launcher added for `gateway-cli` -> `terminal_mcp`
- repo-local Bun smoke client added for end-to-end ContextVM verification
- first end-to-end smoke test succeeded over `wss://relay.contextvm.org`

Phase 1 exit:

- private-by-default allowlisted host flow implemented
- reconnect and session cleanup verified with a dedicated lifecycle script
- default operator path chosen: direct Bun client
- stdio compatibility path recovered with a repo-local SDK proxy

## Phase 2: Gap Closure

Goal: implement only the concrete gaps proven by the bake-off and first composition pass.

Current proven gaps:

- no local functional gaps remain in the working path
- optional follow-up remains for external `proxy-cli` artifact health and operator-facing packaging

## Phase 3: Acceptance Hardening

Goal: close the gap between “implemented” and “defensible” by auditing real behavior and fixing the
issues the audit exposes.

Phase 3 exit:

- implementation-gate checklist is applied to the interactive shell and browser paths
- trust boundaries are explicit and enforced, not only assumed
- reconnect, cleanup, restart, and wrong-environment behaviors are either verified or explicitly
  unsupported
- phase artifacts record claims vs proof rather than only intent
