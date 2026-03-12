# Prompt: ContextVM SDK Resource Update Routing

Work in the forked upstream repo at `../contextvm/sdk`.

Goal: implement correct routing for `notifications/resources/updated` in `NostrServerTransport` so
resource updates are delivered only to client sessions that are actually subscribed to the updated
resource.

Why this is needed:

- Our `csh` research found that the current transport already routes `notifications/progress`
  through correlation metadata, but `notifications/resources/updated` is still a TODO and currently
  falls back to broadcast behavior.
- That blocks the clean long-term MCP shape for interactive terminal state and scrollback over
  ContextVM.
- This is not just for `csh`; it is a general correctness improvement for any stateful ContextVM
  server exposing live MCP resources.

References from our project:

- Research note:
  `/workspace/projects/csh/docs/references/local/contextvm-shell-overview-2026-03-11.md`
- Upstream contribution plan:
  `/workspace/projects/csh/docs/plans/contextvm-sdk-resource-routing-plan.md`
- Project profile:
  `/workspace/projects/csh/docs/process/project-profile.md`

Current behavior to inspect:

- `src/transport/nostr-server-transport.ts`
- `handleNotification()` TODO around `notifications/resources/updated`
- request/response correlation machinery already used for `notifications/progress`

Requested implementation shape:

1. Track resource subscriptions by client pubkey and resource URI.
2. Record enough request metadata when forwarding `resources/subscribe` and
   `resources/unsubscribe` so committed subscription state can be updated only after successful
   responses.
3. Route `notifications/resources/updated` only to sessions subscribed to the URI in the
   notification params.
4. Clean up subscriptions on session eviction, close, and re-initialization.
5. Preserve current behavior for other notification types unless a cleaner general routing
   abstraction clearly improves the design.

Required tests:

- subscribe success
- subscribe failure
- unsubscribe success
- unsubscribe failure
- multi-client different-URI routing
- multi-client same-URI routing
- session eviction cleanup
- no regression to `notifications/progress`

Constraints:

- Keep the design additive and upstream-friendly.
- Avoid coupling this change to `csh`-specific protocol assumptions.
- Prefer explicit stores/helpers over hidden side effects.

Deliverables:

- code changes in `../contextvm/sdk`
- tests covering routing and cleanup behavior
- short change summary with touched files and any design tradeoffs
