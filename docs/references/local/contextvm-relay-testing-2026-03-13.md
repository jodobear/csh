---
title: "ContextVM relay testing note"
summary: "Bounded findings on which relay topology to use for csh Phase 2 relay-backed testing."
status: approved
classification: applied
domains:
  - contextvm
  - nostr
  - relay
projects:
  - csh
source_refs:
  - https://github.com/ContextVM/contextvm-docs
  - https://github.com/ContextVM/sdk
created_on: 2026-03-13
updated_on: 2026-03-13
pack:
promotion_target:
related_docs:
  - /workspace/projects/csh/docs/guides/contextvm-private-demo.md
  - /workspace/projects/csh/docs/plans/decision-log.md
  - /workspace/projects/csh/handoff.md
reviewed_on:
reviewed_by:
---

# ContextVM relay testing note

## Question

Which relay should `csh` use for relay-backed Phase 2 testing, and what setup should be the
default for cross-machine demos?

## Findings

- `csh` currently uses `GiftWrapMode.EPHEMERAL` and required encryption on both the gateway and
  client paths.
- A same-host relay-backed end-to-end test was verified on 2026-03-13 against
  `wss://relay.contextvm.org`. The client connected, received the server initialize event, opened a
  shell session, ran commands, polled output, and closed cleanly.
- A cross-machine relay-backed test was then verified on 2026-03-13 by running local `strfry` on
  the server, forwarding it with `ssh -L`, and running both the scripted and interactive demo
  clients from a separate client machine.
- The client timeout in the remote case was not a shell bug. The server was receiving the request,
  but the client could miss valid responses when its subscription filter used `since=now` and the
  clocks were not perfectly aligned. The repo now uses a bounded lookback for the demo client.
- Haven is not the right default demo relay because it is a personal policy relay with separate
  owner/whitelist concerns.
- In this Codex environment, the successful relay-backed demos required unsandboxed execution. Keep
  that caveat attached to the verification result.

## Evidence

- Repo source:
  - `src/contextvm-gateway.ts`
  - `src/contextvm-demo-client.ts`
  - `src/contextvm-interactive-client.ts`
  - `src/contextvm/skew-tolerant-client-transport.ts`
  - `scripts/contextvm-private-demo.sh`
  - `scripts/contextvm-strfry-relay.sh`
  - `docs/guides/contextvm-private-demo.md`
- Local skill guidance:
  - `/home/at/.agents/skills/deployment/SKILL.md`
  - `/home/at/.agents/skills/troubleshooting/SKILL.md`
- Local observations from 2026-03-13:
  - running `bun run demo:contextvm` against `wss://relay.contextvm.org` completed successfully
    when run outside the sandbox on the same host
  - running the cross-machine demo through a forwarded local `strfry` relay completed successfully
    for both `bun run demo:contextvm` and `bun run demo:contextvm:interactive`
  - the interactive client accepted typed input, forwarded `SIGINT`, and exited cleanly when the
    remote shell closed
  - the demo client needed a bounded response lookback to tolerate clock skew in the remote case

## Implications

- Default cross-machine demo path:
  - use local `strfry` on the server at `ws://127.0.0.1:10549`
  - forward it to the client with `ssh -L 10549:127.0.0.1:10549`
  - point both the gateway and client demo at `ws://127.0.0.1:10549`
- Default same-host smoke path:
  - use `wss://relay.contextvm.org`
- Haven/private relay path:
  - use it only when you explicitly want to test a private relay policy topology
  - do not treat it as the default demo relay
- Recommended validation order:
  - prove same-host relay-backed flow with `wss://relay.contextvm.org` if needed
  - prove cross-machine flow with local `strfry` plus `ssh -L`
  - only then revisit Haven or other relay topologies if they still matter

## Open Questions

- Do we want the helper script to grow an explicit `--topology public|ssh-tunnel` mode so the relay
  shape is harder to misuse?
- Should the demo client's bounded response lookback move upstream into the ContextVM SDK?
