---
title: "ContextVM relay testing note"
summary: "Bounded findings on which relay topology to use first for csh Phase 2 end-to-end testing."
status: draft
classification: undecided
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

Which relay should `csh` use for the first real SSH-over-Nostr/ContextVM test, and what test setup
should be the default?

## Findings

- The repo and local skills consistently point to `wss://relay.contextvm.org` as the default
  ContextVM relay, with `wss://cvm.otherstuff.ai` as a reasonable secondary relay.
- `csh` currently uses `GiftWrapMode.EPHEMERAL` and required encryption on both the gateway and
  client paths, so the first test relay should be one already used by current ContextVM tooling
  rather than an arbitrary generic relay.
- A relay-backed end-to-end test was verified on 2026-03-13 in this repo by running the gateway and
  demo client against `wss://relay.contextvm.org`. The client connected, received the server
  initialize event, opened a shell session, ran commands, polled output, and closed cleanly.
- The local Haven relay is present on this machine and reachable on `ws://127.0.0.1:3335`, but the
  previously generated demo env expected a separate client-side relay URL at `ws://127.0.0.1:7447`.
  That local forwarded client port was not listening during this session, so the existing Haven
  setup was incomplete for cross-machine testing.
- The right interpretation is not "Haven is definitely incompatible." The immediate problem was
  topology drift: server and client were configured for different localhost relay addresses without
  the client-side SSH forward in place.
- In this Codex environment, the successful public-relay demo required unsandboxed execution. Keep
  that caveat attached to this verification result.

## Evidence

- Repo source:
  - `src/contextvm-gateway.ts`
  - `src/contextvm-demo-client.ts`
  - `scripts/contextvm-private-demo.sh`
  - `docs/guides/contextvm-private-demo.md`
- Local skill guidance:
  - `/home/at/.agents/skills/deployment/SKILL.md`
  - `/home/at/.agents/skills/troubleshooting/SKILL.md`
- Local observations from 2026-03-13:
  - `curl -L -I https://relay.contextvm.org` returned `400`, which is a normal enough signal for a
    WebSocket endpoint hit over plain HTTP.
  - `curl -L -I https://cvm.otherstuff.ai` returned `400`, consistent with a relay endpoint.
  - `curl -L -I http://127.0.0.1:3335` reached the local Haven service.
  - `curl -L -I http://127.0.0.1:7447` failed because nothing was listening on that port.
  - Running `bun run demo:contextvm` against `wss://relay.contextvm.org` completed successfully when
    run outside the sandbox.

## Implications

- Default first real demo path:
  - use `wss://relay.contextvm.org`
  - keep the relay list to one URL for the first proof so failures stay easy to interpret
- Default second-step resilience test:
  - add `wss://cvm.otherstuff.ai` as a second relay after the single-relay proof succeeds
- Haven/private relay path:
  - use it only when you explicitly want a private or SSH-tunneled relay topology
  - configure it with split relay URLs exactly as the guide describes:
    - server: the server-local relay URL, for example `ws://127.0.0.1:3335`
    - client: the locally forwarded port on the client machine, for example `ws://127.0.0.1:7447`
  - do not reuse the split-url setup unless the `ssh -L` tunnel is actually running
- Recommended validation order:
  - prove the gateway/client flow with `wss://relay.contextvm.org`
  - then repeat using the Haven split-url topology if the private relay path still matters

## Open Questions

- Do we want the helper script to grow an explicit `--topology public|ssh-tunnel` mode so the relay
  shape is harder to misuse?
- Should the repo add a small relay connectivity probe before printing client instructions?
