# Decision Log

## Change Control

- Add new decisions; do not silently rewrite accepted meaning.
- Record date, status, decision, why, tradeoff, and reversal trigger.

## Accepted Decisions

### 2026-03-14

- Status: accepted
- Decision: Use ContextVM transport as the Nostr layer and make `terminal_mcp` the first shell
  backend for Phase 0/1 composition.
- Why: ContextVM already provides the Nostr MCP transport surface the project needs. In the local
  bake-off, `terminal_mcp` built successfully, exposed a working MCP endpoint, and preserved shell
  session state across calls. The initially preferred `terminal-mcp` candidate failed to compile
  against the current `rmcp` API.
- Tradeoff: `terminal_mcp` adds an HTTP-capable transport surface and is less explicitly PTY-focused
  than `terminal-mcp`, but it is currently the viable existing-tool option with verified persistent
  shell behavior.
- Reversal trigger: reverse this choice if ContextVM cannot wrap `terminal_mcp` cleanly, if the
  full Nostr path breaks interactive shell usability, or if `terminal-mcp` becomes buildable and
  proves materially thinner.

### 2026-03-15

- Status: accepted
- Decision: Use a direct Bun client built on `@contextvm/sdk` for Phase 1 smoke verification,
  instead of making `proxy-cli` a prerequisite for the first end-to-end test.
- Why: the direct client is thinner, repo-local, and worked end-to-end against `gateway-cli` plus
  `terminal_mcp`. It verified `tools/list` and `persistent_shell` over Nostr on 2026-03-15.
- Tradeoff: this does not yet validate the operator experience through `proxy-cli`, so a later
  client-path decision is still required.
- Reversal trigger: reverse this choice if the first user-facing workflow requires a stdio MCP proxy
  immediately or if `proxy-cli` becomes the clearly lower-friction operator path.

### 2026-03-15

- Status: accepted
- Decision: Keep private access control enabled by default in the repo-local workflow and require
  `GW_ALLOWED_PUBLIC_KEYS` unless `GW_ALLOW_UNLISTED_CLIENTS=1`.
- Why: the allowlisted host flow worked in the autonomous loop, and private access is part of the
  core requirement rather than an optional hardening pass.
- Tradeoff: test setup now requires explicit client key generation and allowlist wiring, which adds
  a small amount of bootstrap friction.
- Reversal trigger: reverse this only if there is a strong need for an intentionally open local demo
  flow that should be the default instead of the exception.

### 2026-03-15

- Status: accepted
- Decision: Choose the direct Bun client as the default operator path for now and treat the current
  `proxy-cli` release failure as a Phase 2 gap instead of a reason to block progress.
- Why: the autonomous loop succeeded end-to-end with the direct client, while the current
  `proxy-cli` release binary failed with `NotCapable: Requires sys access to "hostname"`.
- Tradeoff: stdio-proxy-based operator workflows are not the default path yet, and may still matter
  later if broader MCP client compatibility becomes a priority.
- Reversal trigger: reverse this if a fixed `proxy-cli` artifact or source-based run path proves
  thinner for the actual operator workflow.

### 2026-03-15

- Status: accepted
- Decision: Recover the stdio proxy path locally with a repo-local SDK proxy instead of blocking on
  the external `proxy-cli` binary artifact.
- Why: the repo-local proxy built on `NostrMCPProxy` passed the end-to-end autonomous loop, while
  the external binary remained broken in this environment.
- Tradeoff: the repo now carries a small amount of local proxy glue, but it stays within the
  buy-before-build posture because it is a thin wrapper around the existing SDK.
- Reversal trigger: reverse this if the external `proxy-cli` artifact becomes reliable and clearly
  simpler than keeping the local wrapper.

### 2026-03-15

- Status: accepted
- Decision: Run the default client and proxy paths at `CVM_LOG_LEVEL=error` to suppress reconnect
  warning noise in normal operation.
- Why: the warnings were noisy in lifecycle runs but did not indicate a proven functional break, and
  reducing the log level restored a clean default operator experience.
- Tradeoff: lower log verbosity hides some transport detail during normal runs; debugging now
  requires raising `CVM_LOG_LEVEL` explicitly.
- Reversal trigger: reverse this if the warnings become materially useful in standard operation or if
  the underlying SDK behavior is fixed and the extra noise disappears.

### 2026-03-15

- Status: accepted
- Decision: Remove the optional external `proxy-cli` binary path from the repo workflow and
  standardize on the repo-local SDK proxy when a stdio bridge is needed.
- Why: the local SDK proxy works end-to-end, while the external binary remained an upstream artifact
  problem that no longer provides local value.
- Tradeoff: the repo no longer exercises the upstream binary path as part of normal usage, so binary
  health is now explicitly outside the default workflow.
- Reversal trigger: reverse this only if the upstream binary becomes materially simpler and worth
  adopting over the maintained local wrapper.

### 2026-03-15

- Status: accepted
- Decision: Add `scripts/operator.sh` as the single operator-facing entrypoint for bootstrap,
  runtime, host, direct, lifecycle, proxy, and full verification.
- Why: the script collapses the repo's scattered operational commands into one stable surface and
  passed an end-to-end `verify` run on 2026-03-15.
- Tradeoff: the shell wrapper becomes part of the repo's operator UX and must now be kept coherent
  as workflows evolve.
- Reversal trigger: reverse this if a different user-facing CLI or application supersedes the shell
  wrapper cleanly.

### 2026-03-15

- Status: accepted
- Decision: Promote `bin/csh` to the stable public CLI entrypoint and keep
  `scripts/operator.sh` only as a compatibility shim.
- Why: `bin/csh` now covers secure bootstrap, host start, config checking, systemd-unit rendering,
  direct execution, shell access, proxy access, and full verification, and it passed end-to-end
  verification on 2026-03-15.
- Tradeoff: the public interface is now Bun-backed and repo-local, so packaging beyond the repo
  remains a future concern.
- Reversal trigger: reverse this if a packaged standalone binary or another user-facing CLI fully
  replaces the Bun-backed wrapper.

### 2026-03-15

- Status: accepted
- Decision: Refuse `csh host start` as root unless `CSH_ALLOW_ROOT=1`.
- Why: the intended persistent deployment model is a dedicated non-root service account, and the CLI
  should default to that posture instead of silently allowing root execution.
- Tradeoff: operators who intentionally want a root-run local demo now need an explicit override.
- Reversal trigger: reverse this only if the deployment model changes and root execution becomes a
  necessary default rather than an exception.

### 2026-03-15

- Status: accepted
- Decision: Replace the `terminal_mcp`-based command-shell host path with a repo-local `tmux`-backed
  `session_*` MCP server and repo-local ContextVM gateway.
- Why: the product requirement has now narrowed to a proper interactive terminal plus browser UI.
  `terminal_mcp` proved the transport path but could not satisfy PTY-style interaction, while the
  validated `csh-old` donor implementation already demonstrated the correct session model for this
  product.
- Tradeoff: the repo now carries more product-specific terminal code than the original thin-wrapper
  phase, and relay-backed regression verification must be rerun for the new host path.
- Reversal trigger: reverse this only if an existing upstream terminal server appears that provides
  the same interactive/session/browser requirements with materially less local code.

### 2026-03-15

- Status: accepted
- Decision: Keep `csh` as the canonical repo and port the validated interactive/browser core from
  `csh-old` into it, instead of switching active development back to `csh-old`.
- Why: `csh` already holds the canonical plans, CLI, operational wrapper, and decision history,
  while `csh-old` was the better prototype for interactivity but too broad as the active product
  repo.
- Tradeoff: the port takes deliberate integration work, but avoids split-brain maintenance across
  two repos.
- Reversal trigger: reverse this only if `csh` becomes materially harder to evolve than simply
  adopting `csh-old` wholesale, which is not the case today.

### 2026-03-15

- Status: accepted
- Decision: Require server-side actor resolution for session ownership and reject unauthenticated
  session access by default.
- Why: the interactive shell is a privileged surface, so ownership cannot depend on caller-supplied
  `ownerId` without authenticated transport metadata or a local forced-owner bridge.
- Tradeoff: local stdio callers must now opt in with `CSH_FORCED_OWNER_ID` or
  `CSH_ALLOW_UNAUTHENTICATED_OWNER=1` for non-ContextVM test paths.
- Reversal trigger: reverse this only if the transport layer itself becomes the sole supported
  entrypoint and can prove authenticated identity for every request path.

### 2026-03-15

- Status: accepted
- Decision: Treat the browser UI as an operator-local bridge, bound to loopback by default with a
  per-process API token for POST requests, rather than a public remote shell surface.
- Why: this closes the unauthenticated local HTTP proxy gap without claiming a broader browser auth
  system that the project does not yet implement.
- Tradeoff: remote browser exposure now requires explicit opt-in and remains operationally sensitive.
- Reversal trigger: reverse this only if the repo adds a real remote browser authn/authz model.

### 2026-03-15

- Status: accepted
- Decision: Persist tmux session metadata to disk and scavenge idle and closed sessions with TTLs.
- Why: reconnect and restart behavior are part of the product contract for an interactive remote
  shell, so purely in-memory session maps were no longer acceptable.
- Tradeoff: the host now carries a small amount of local runtime state under `.csh-runtime/sessions`
  and needs explicit TTL defaults.
- Reversal trigger: reverse this only if the session backend changes to a different durable runtime
  that already owns lifecycle and recovery semantics.

### 2026-03-15

- Status: accepted
- Decision: Standardize relay-backed `csh` clients and the repo-local stdio proxy on
  `GiftWrapMode.EPHEMERAL`, and generate new env files with `required` encryption by default.
- Why: the relay-backed proof showed the direct client helpers and stdio proxy were publishing outer
  gift-wrap kind `1059` when `giftWrapMode` was omitted, while the interactive host path was
  correctly using the ephemeral kind `21059`. Fixing that mismatch closed the relay timeout gap, and
  `required` encryption matches the validated donor path and the intended private-shell posture.
- Tradeoff: relay-backed paths are now stricter by default, so ad hoc mixed-mode testing requires
  explicit configuration instead of inheriting permissive defaults.
- Reversal trigger: reverse this only if the upstream ContextVM transport contract changes or a
  broader interoperability requirement forces optional encryption back to the default.

### 2026-03-15

- Status: accepted
- Decision: Capture a final tmux pane snapshot before marking dead sessions closed so short-lived
  one-shot commands remain observable through `csh exec`.
- Why: relay-backed `csh exec` proved that fast commands could exit before the first poll captured a
  snapshot, causing successful commands to appear empty at the CLI.
- Tradeoff: close detection now does one extra pane capture on dead sessions.
- Reversal trigger: reverse this only if the session backend moves away from tmux snapshots to a
  stream-native PTY model that already preserves terminal output on exit.

### 2026-03-15

- Status: accepted
- Decision: Standardize the operator transport posture on a private relay you control, use SSH
  tunneling as the reachability fallback, and treat `relay.contextvm.org` only as a secondary
  compatibility check.
- Why: the latest controlled-relay rerun is stable for `exec`, named-session shell reconnect, and
  browser-over-ContextVM, while the latest current-code rerun against `relay.contextvm.org` still
  failed before `initialize` with relay connection errors and `Publish event timed out`.
- Tradeoff: public-relay convenience is no longer treated as the default path, so operators need a
  relay they control or a simple tunnel when network reachability is uncertain.
- Reversal trigger: reverse this only if `relay.contextvm.org` becomes reliable enough in practice
  to serve as a primary operator path, or if the deployment model changes to bundle a different
  default relay strategy.

### 2026-03-15

- Status: accepted
- Decision: Keep a deterministic repo-local `nak` relay helper in `scripts/start-test-relay.sh`
  for proof and troubleshooting.
- Why: it gives the repo a stable local/private relay path for shell, browser, and disconnect-path
  verification without depending on public-relay conditions.
- Tradeoff: the repo now documents one more operator utility and assumes `nak` is available for
  deterministic relay testing.
- Reversal trigger: reverse this only if the repo adopts a different deterministic private-relay
  harness that is clearly simpler or more portable than `nak`.

### 2026-03-15

- Status: accepted
- Decision: Use `docs/README.md` as the docs routing surface, shorten the startup read set, and
  keep `handoff.md` state-oriented rather than historical.
- Why: the repo had started to accumulate duplicated process and transport guidance across startup
  docs, guides, and handoff. A docs index plus a shorter startup path lowers active-memory load
  without reducing rigor, and a leaner handoff avoids mixing state with running history.
- Tradeoff: some detail now lives behind one routing step in `docs/README.md`, so readers need to
  follow the index instead of assuming every doc belongs in the startup path.
- Reversal trigger: reverse this only if the leaner surface hides necessary operational context,
  which should be solved first by improving the index instead of re-bloating startup docs.

### 2026-03-15

- Status: accepted
- Decision: Standardize future refinement work on explicit repo-default audit postures:
  `security-exposure`, `operator-workflow`, and `deployment-resilience`.
- Why: the updated refinement playbook makes the key point correctly: generic “quality review” is
  too vague. This repo’s real failure modes cluster around shell exposure, operator flow, and
  deployment/network behavior, so those should be the default audit lenses.
- Tradeoff: refinement packets now need to name posture(s) and finding IDs explicitly, which adds a
  small amount of upfront structure.
- Reversal trigger: reverse or extend this only if the repo’s dominant risk shape changes enough to
  justify a different posture set.

### 2026-03-15

- Status: accepted
- Decision: Add a plain startup git-state check to the repo canon and surface repo initialization,
  branch, HEAD/no-commit state, remotes, and local-only work before substantial implementation.
- Why: the repo had been treated as a normal initialized git project even though it had no commits
  and no remotes, which should have been surfaced immediately instead of silently assumed.
- Tradeoff: startup now includes one more basic repo-state check, but without turning it into a
  larger ceremony.
- Reversal trigger: none planned; this is a minimal workflow safeguard rather than a phase-local
  preference.

### 2026-03-15

- Status: accepted
- Decision: Treat env files as data-only config in live startup paths, require private file modes,
  and default new configs to a private relay plus required encryption.
- Why: the audit found that startup still sourced env files as shell, env files could be too open
  on disk, and fresh configs still nudged operators toward a public relay with looser transport
  defaults than the repo's stated private-shell posture.
- Tradeoff: manual startup now depends on the repo's TypeScript wrappers instead of shell-sourcing,
  and operators who want non-default relay or encryption behavior must set it explicitly.
- Reversal trigger: reverse only if the runtime moves away from env-file-driven startup entirely or
  the deployment model changes enough to make shell-compatible config files a hard requirement.

### 2026-03-15

- Status: accepted
- Decision: Require HTTP Basic Auth for remote browser mode and keep the browser loopback-bound by
  default.
- Why: the audit correctly found that serving the browser app remotely while embedding the live API
  token made `CSH_BROWSER_ALLOW_REMOTE=1` effectively unauthenticated. The browser path is an
  operator tool, not a public anonymous shell surface.
- Tradeoff: remote browser mode now requires credential provisioning and is slightly less convenient
  for ad hoc demos, but its trust boundary is explicit.
- Reversal trigger: reverse only if the browser client gains a stronger first-class auth model that
  replaces Basic Auth while keeping remote exposure clearly bounded.

### 2026-03-16

- Status: accepted
- Decision: Add a canonical `process-control.md` for control-surface ownership and process-change
  reconciliation, but keep it out of the default startup read set.
- Why: the `noztr` and `nzdk` refinements correctly separated canonical control-surface rules from
  the implementation gate and from the playbook/rationale layer. `csh` benefits from the same
  split, but forcing that doc into every startup session would reintroduce the active-memory load
  problem the repo has already worked to reduce.
- Tradeoff: process/doc-surface work now has one more canonical doc to consult on demand, while
  ordinary implementation sessions stay leaner.
- Reversal trigger: reverse only if process-control drift keeps recurring because the canonical
  owner is too hidden from the people doing the work.

### 2026-03-16

- Status: accepted
- Decision: treat the browser UI as an authenticated operator surface even on loopback, and require
  explicit TLS-proxy acknowledgment for any remote browser exposure.
- Why: the latest audit found that a loopback-bound browser still exposed a live API token to any
  other local process, and remote browser mode was plain HTTP unless the operator supplied an
  external TLS layer. The browser path is an operator tool, not an anonymous local or remote shell.
- Tradeoff: browser usage now always involves credentials, and remote browser mode requires one
  more explicit deployment flag.
- Reversal trigger: reverse only if the browser path gains a stronger first-class local/remote auth
  model that makes explicit browser credentials unnecessary without weakening the trust boundary.

### 2026-03-16

- Status: accepted
- Decision: keep session idle TTL based on operator activity, but add throttled `keepAlive` heartbeats
  from genuinely attached clients.
- Why: a pure input-only TTL killed read-only but actively attached sessions such as `tail -f`, while
  a pure polling TTL let background tabs pin sessions indefinitely. Throttled keepalive heartbeats
  from visible browser tabs and attached CLI clients are the narrow middle path.
- Tradeoff: the session contract now has one more optional polling field, and attached clients must
  participate correctly for read-only sessions to stay alive.
- Reversal trigger: reverse only if the backend moves to a stronger lease or PTY session model that
  can represent attachment directly instead of inferring it from heartbeats.

### 2026-03-16

- Status: accepted
- Decision: make `bin/csh verify` auto-start a loopback `nak` relay when the env targets a local
  `ws://127.0.0.1:<port>` relay and no listener is already present.
- Why: the latest audit found that the default verification path could fail for environmental reasons
  unrelated to the host itself because bootstrap now defaults to a private local relay URL.
- Tradeoff: deterministic verification now assumes `nak` is available when using the default loopback
  relay posture.
- Reversal trigger: reverse only if the repo adopts a different deterministic private-relay harness
  or moves verification away from relay-backed smoke checks entirely.
