# Phase 6: Terminal Fidelity

Goal: make the current tmux-backed terminal feel materially closer to a real shell without claiming
raw PTY byte-stream semantics, while also finishing the Bun-backed installer lifecycle.

Target findings:
- operator-workflow-terminal-02
- operator-workflow-terminal-03
- deployment-resilience-install-02
- DOC-guides-02

## Inputs
- `src/server/tmux-session-manager.ts`
- `src/contextvm-interactive-client.ts`
- `src/browser/app.ts`
- `scripts/csh.ts`
- `scripts/install-cli.sh`

## Synchronization Touchpoints
- teaching surface: yes; install lifecycle and terminal-behavior guidance change
- audit state: yes; terminal-fidelity and installer-lifecycle findings need closure in the live audits
- startup/discovery surface: yes; handoff and prompt routing need the new active packet

## Required Work
- improve terminal input fidelity inside the tmux-backed transport
- increase and expose server/browser scrollback depth honestly
- add install upgrade/uninstall lifecycle around the Bun-backed launcher
- verify the new terminal behavior with targeted proofs plus the normal loop

## Required Output
- `src/server/tmux-session-manager.ts`
- `scripts/install-cli.sh`
- `docs/guides/*.md`
- `handoff.md`

## Acceptance Gates
- claims and proof table
- environment matrix
- negative tests
- trust-boundary review
- lifecycle/restart behavior
- operator UX review

## Clarifying Question Gate
- stop only if terminal-fidelity work would require changing the transport architecture this phase
- otherwise keep the scope inside the current tmux-backed design

## Exit Criteria
- shell input handling supports a materially broader set of terminal control keys
- scrollback depth is increased and operator-visible
- install lifecycle includes upgrade/reinstall and uninstall
- live audit docs reflect the post-fix state
- phase is not complete until the implementation-gate categories are explicitly checked
