# Decision Log

## Change Control

- Add new decisions; do not silently rewrite accepted meaning.
- Record date, status, decision, why, tradeoff, and reversal trigger.

## Accepted Decisions

- Date: 2026-03-12
  Status: accepted
  Decision: v1 shell sessions use PTY-backed execution with `tmux` and poll/ack output rather than
  waiting for upstream push-routing enhancements.
  Why: this keeps the MVP off the current ContextVM SDK routing gap while still supporting durable
  scrollback and reconnect.
  Tradeoff: push-based updates are deferred and the client must poll explicitly.
  Reversal Trigger: if poll/ack proves unusable in practice or upstream routing lands early with low
  integration cost.

- Date: 2026-03-12
  Status: accepted
  Decision: the service starts private and pubkey-gated from day one.
  Why: remote shell access is high-risk and should not rely on public-server defaults.
  Tradeoff: discovery and open access are intentionally limited.
  Reversal Trigger: a future product requirement explicitly needs public access patterns.

- Date: 2026-03-12
  Status: accepted
  Decision: interactive shell features and admin/file-management features remain separate roadmap
  lanes even though the service is private.
  Why: privacy does not remove the need to isolate risk, complexity, and authorization boundaries.
  Tradeoff: more protocol surface area is deferred instead of shipping one catch-all shell.
  Reversal Trigger: later evidence shows a merged model is materially simpler without weakening
  safety or clarity.

- Date: 2026-03-12
  Status: accepted
  Decision: browser UI is planned after the core shell protocol stabilizes, not in the first
  terminal-server spike.
  Why: the browser client should target a stable session protocol, not define it.
  Tradeoff: early testing centers on text/TUI workflows.
  Reversal Trigger: a browser-first integration becomes the only practical way to validate the UX.

- Date: 2026-03-12
  Status: accepted
  Decision: PTY execution isolation must be called out in the roadmap, with containerization or an
  equivalent sandbox evaluated for server deployment.
  Why: `node-pty` executes arbitrary commands with the server process's effective privileges.
  Tradeoff: isolation can reduce direct host access and complicate privileged workflows.
  Reversal Trigger: the deployment target is a dedicated single-purpose host and the operator
  explicitly accepts running the shell directly on that host.

- Date: 2026-03-12
  Status: accepted
  Decision: use Applesauce for relay handling where it fits the TypeScript stack.
  Why: it aligns with current ContextVM SDK direction and is a good outer-layer relay/runtime fit.
  Tradeoff: shell/session semantics still remain explicit in project code.
  Reversal Trigger: relay behavior or performance needs force a thinner custom integration.

- Date: 2026-03-12
  Status: accepted
  Decision: v0.1 runs a direct-host shell rather than an SSH-adapter-to-another-host design.
  Why: this is the simplest path to a useful product, keeps the architecture aligned with the
  project goal, and avoids introducing a second remote-hop system before the core shell protocol is
  proven.
  Tradeoff: command execution happens on the machine running the service, so deployment isolation is
  more important.
  Reversal Trigger: a later requirement needs brokered access to multiple downstream hosts or a
  stronger jump-host security model.

- Date: 2026-03-12
  Status: accepted
  Decision: plain shell file access is available from v0.1 through terminal commands, while
  explicit upload/download and file-resource capabilities are deferred to Phase 3.
  Why: shell access already provides `ls`, `cat`, editors, and CLI tooling; explicit file
  capabilities are mainly for UX, structured authorization, and browser workflows.
  Tradeoff: early file transfer UX is terminal-centric rather than first-class.
  Reversal Trigger: browser UI or automation needs require explicit file APIs sooner.

- Date: 2026-03-12
  Status: accepted
  Decision: downstream SSH agent forwarding and port forwarding are out of scope for v0.1.
  Why: the initial product goal is a private remote shell over ContextVM, not full SSH feature
  parity.
  Tradeoff: some advanced workflows like tunneled web UIs or reuse of a local SSH agent from inside
  the remote shell are deferred.
  Reversal Trigger: a concrete user workflow shows these are necessary for the first public
  milestone.

- Date: 2026-03-12
  Status: accepted
  Decision: implementation proceeds through a small-slice autonomous loop with mandatory review
  after each logical slice and explicit checkpoints after each larger phase loop.
  Why: this borrows the strongest parts of the shared and archived process guidance without dragging
  the full heavyweight archive workflow into a product prototype.
  Tradeoff: slightly more planning and doc updates per slice versus lower drift, better handoff
  quality, and cleaner autonomous execution.
  Reversal Trigger: evidence shows the loop adds ceremony without reducing rework or review misses.

- Date: 2026-03-12
  Status: accepted
  Decision: the first implementation slice uses `tmux` directly as the session and PTY runtime
  instead of introducing `node-pty` before the demo path is proven.
  Why: `tmux` already provides a PTY boundary, durable sessions, scrollback, and deterministic
  reattach behavior, so it is the fastest route to a working local shell prototype.
  Tradeoff: the implementation is more tightly coupled to `tmux` semantics and leaves lower-level
  PTY abstraction for later work if needed.
  Reversal Trigger: later client behavior or portability needs require direct PTY control that
  `tmux` alone cannot provide cleanly.

- Date: 2026-03-12
  Status: accepted
  Decision: v0.1 implementation moves ahead on the host-first fast path, with a dedicated
  unprivileged shell user as the preferred deployment posture and containerization deferred to a
  later hardening phase.
  Why: the immediate goal is fast real-world testing and demos, and early containerization would
  add substantial runtime and configuration work before the core shell path is validated.
  Tradeoff: the first deployable version relies more on host posture and operator discipline than a
  stronger isolation boundary would.
  Reversal Trigger: if the target host is not single-purpose enough, or demo feedback shows the
  missing isolation is blocking adoption.

- Date: 2026-03-12
  Status: accepted
  Decision: `br` (`beads_rust`) is the active tracker for this repo, and `bd` is not part of the
  workflow.
  Why: `bd` introduced avoidable local friction during bootstrap, and `br` is the chosen tracker
  for this repo going forward.
  Tradeoff: because `br` is non-invasive, tracker sync now requires explicit git handling for
  `.beads/` state.
  Reversal Trigger: only if `br` proves unusable for slice-level work in practice and a different
  tracker replaces it.

- Date: 2026-03-12
  Status: accepted
  Decision: the first reliable session input path uses `tmux send-keys` semantics instead of
  writing directly to the pane TTY.
  Why: direct TTY writes were not executing commands reliably enough in the current environment,
  while `tmux send-keys` gave a working local demo and deterministic verification path immediately.
  Tradeoff: raw control-byte fidelity and some TUI edge cases are deferred until a stronger input
  path is implemented.
  Reversal Trigger: once a lower-level PTY input path is verified to execute reliably without
  regressing the demo path.

- Date: 2026-03-12
  Status: accepted
  Decision: Phase 2 uses `NostrMCPGateway` in per-client mode rather than replacing the local MCP
  server with a native Nostr transport immediately.
  Why: this keeps the working stdio MCP server intact, preserves the Phase 1 local test path, and
  gives us per-client isolation while we add private ContextVM exposure.
  Tradeoff: the Phase 2 runtime is a gateway plus child stdio server process, not yet the simplest
  possible one-process deployment.
  Reversal Trigger: once the remote path is stable and a native `NostrServerTransport` integration
  would materially simplify operations without losing correctness.

- Date: 2026-03-13
  Status: accepted
  Decision: the first relay-backed Phase 2 proof uses `wss://relay.contextvm.org` as the default
  test relay, with private/Haven relay testing treated as a follow-on topology.
  Why: the local ContextVM guidance already centers `relay.contextvm.org`, and this repo verified a
  real end-to-end gateway/client demo against it. The existing Haven setup also depended on a
  separate client-side forwarded localhost port that was not active, so it added topology risk to
  the first proof.
  Tradeoff: the first demo uses a public relay path instead of the most private possible topology,
  and private relay validation moves to the next step rather than the first one.
  Reversal Trigger: if a private relay path is verified to be equally reliable and becomes the
  higher-priority deployment target than a public-relay proof.
