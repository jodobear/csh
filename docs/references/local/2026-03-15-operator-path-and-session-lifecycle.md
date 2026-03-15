---
title: "Operator path and session lifecycle verification"
summary: "Records the autonomous loop across private-by-default host launch, direct client smoke, reconnect/session cleanup verification, and stdio proxy operator-path comparison."
status: draft
classification: project-local
domains: ["nostr", "mcp", "remote-shell", "operator-path", "session-lifecycle"]
projects: ["csh"]
source_refs:
  - "https://github.com/ContextVM/proxy-cli"
  - "docs/references/local/2026-03-14-private-remote-shell-over-nostr-candidates.md"
created_on: 2026-03-15
updated_on: 2026-03-15
pack:
promotion_target:
related_docs:
  - "scripts/phase1/README.md"
  - "handoff.md"
  - "docs/plans/decision-log.md"
reviewed_on:
reviewed_by:
---

# Operator path and session lifecycle verification

## Question

After Phase 1 composition worked, which operator path should be the default, and does the shell path
hold up across private access control, reconnects, and session cleanup?

## Findings

- The direct Bun client built on `@contextvm/sdk` remains the default operator path because it is
  the thinnest repo-local path and passed the end-to-end relay test.
- A private-by-default host launch works with `gateway-cli` allowlisting a single client pubkey.
- Session continuity survived reconnect: the lifecycle test preserved the same shell PID and working
  directory across disconnect and reconnect.
- Session cleanup also worked: `session_manager close` removed the old shell session and the next
  command created a fresh shell with a new PID.
- The repo-local SDK stdio proxy path also works, so MCP-host compatibility is no longer blocked on
  the external `proxy-cli` release artifact.
- Reconnect warning noise was suppressed in the default flow by setting `CVM_LOG_LEVEL=error`.
- A stable CLI now exists at `bin/csh`, and it successfully ran config checks, systemd-unit
  rendering, host start, direct exec, and the full verification loop.
- The external `proxy-cli` release binary is still not viable in this environment, but the repo no
  longer depends on it for normal operation.

## Evidence

- Autonomous loop script: `scripts/phase1/run-autonomous-loop.sh /tmp/csh-autoloop-fixed.env`
- Direct smoke output:
  - `tools/list` returned `execute_command`, `persistent_shell`, and `session_manager`
  - `persistent_shell` preserved state across `pwd`, `cd /tmp`, `pwd`
- Lifecycle output:
  - `initialPid: 937102`
  - `postReconnectPid: 937102`
  - `postClosePid: 937139`
- Host log:
  - `Created new shell session: phase1-lifecycle (shell: /bin/bash, pid: 937102)`
  - `Closed session: phase1-lifecycle`
  - `Created new shell session: phase1-lifecycle (shell: /bin/bash, pid: 937139)`
- Proxy log:
  - `tools` returned `execute_command`, `persistent_shell`, and `session_manager`
  - `firstCommand` returned `/workspace/projects/csh` through the stdio proxy path
- CLI:
  - `bin/csh host check /tmp/csh-cli.env` passed
  - `bin/csh host systemd-unit /tmp/csh-cli.env --output /tmp/csh-host.service` rendered a hardened unit
  - `bin/csh verify /tmp/csh-cli-verify.env` passed end-to-end
  - `bin/csh exec "pwd" /tmp/csh-cli.env` returned `/workspace/projects/csh`

## Implications

- Keep the direct Bun client as the default operator path for now.
- Offer the repo-local SDK proxy path when stdio MCP compatibility is needed.
- Use `bin/csh` as the primary repo entrypoint for operational tasks.
- Treat private access control as part of the default workflow, not an optional follow-up.
- The remaining work is mostly packaging and user-facing operator guidance, not transport recovery.

## Promotion Assessment

- Suggested classification: project-local
- Suggested destination: none yet
- Why: the note is tightly coupled to this repo's current operator-path decision and local test
  harness.

## Open Questions

- Should `bin/csh` stay a Bun-backed repo CLI or evolve into a packaged standalone binary?
- What is the minimum packaging needed to make the default direct client path easy to hand to a
  real user?
