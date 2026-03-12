# ContextVM SDK Resource Routing Plan

## Goal

Contribute an upstream enhancement to `../contextvm/sdk` so `NostrServerTransport` can route
`notifications/resources/updated` to the correct subscribed client sessions instead of falling back
to broadcast behavior.

## Why We Need This

- `csh` will start with poll/ack, so this enhancement is not on the MVP critical path.
- We still need it upstream because the standards-aligned long-term shape for terminal scrollback and
  screen state is resource subscription plus targeted resource-updated notifications.
- The current SDK already routes `notifications/progress` using request correlation, but resource
  updates are different: they are subscription-oriented, not request-oriented.
- Without this change, multi-client servers risk over-broadcasting state-change notifications to
  sessions that do not own or subscribe to the resource.
- This is useful beyond `csh`. Any stateful ContextVM server exposing live MCP resources would
  benefit from correct resource-update routing.

## Context And References

- Local research note:
  [contextvm-shell-overview-2026-03-11.md](/workspace/projects/csh/docs/references/local/contextvm-shell-overview-2026-03-11.md)
- Current project profile:
  [project-profile.md](/workspace/projects/csh/docs/process/project-profile.md)
- Current roadmap:
  [build-plan.md](/workspace/projects/csh/docs/plans/build-plan.md)
- Upstream source under active fork:
  `../contextvm/sdk`
- Relevant current upstream behavior:
  - `src/transport/nostr-server-transport.ts`
  - existing TODO in `handleNotification()` for `notifications/resources/updated`
  - existing route/session machinery for `notifications/progress`

## Proposed Design

### 1. Add resource subscription tracking to the server transport

- Maintain a server-side subscription registry keyed by resource URI and client pubkey.
- Track pending subscribe/unsubscribe operations separately from committed subscriptions so the
  transport can update state only after the underlying MCP server accepts the request.

### 2. Extend correlation metadata

- When forwarding a client request through `NostrServerTransport`, record enough request metadata to
  resolve subscription side effects on the response path.
- Minimum metadata:
  - request method
  - resource URI when method is `resources/subscribe` or `resources/unsubscribe`
  - client pubkey
  - original request id / Nostr event id mapping already present

### 3. Commit subscription state on successful responses

- On successful response to `resources/subscribe`, add the client subscription.
- On successful response to `resources/unsubscribe`, remove the client subscription.
- On error responses, leave the committed state unchanged.

### 4. Route `notifications/resources/updated` by URI

- When the server emits `notifications/resources/updated`, inspect the notification params for the
  resource URI.
- Deliver only to clients with active subscriptions for that URI.
- Do not broadcast these notifications to every initialized session.

### 5. Clean up aggressively

- Remove all subscriptions for a client when:
  - the client session is evicted
  - the connection closes
  - the server transport shuts down
- Ensure re-initialization does not leak old subscriptions.

### 6. Preserve current behavior for non-targeted notifications

- Keep broadcast behavior for notifications that are intentionally server-wide.
- Avoid changing `notifications/progress`, which already has request-scoped routing.

## Suggested Implementation Areas

- `src/transport/nostr-server-transport.ts`
- `src/transport/nostr-server/correlation-store.ts`
- `src/transport/nostr-server/session-store.ts` if cleanup hooks or state location need adjustment
- new helper/store module if the subscription registry deserves separation

## Test Plan

- Single client subscribes to one URI and receives only that URI's updates.
- Two clients subscribe to different URIs and receive only their own updates.
- Two clients subscribe to the same URI and both receive the update.
- Client unsubscribes and stops receiving updates.
- Subscribe request fails and no subscription is committed.
- Unsubscribe request fails and the previous subscription remains active.
- Session eviction removes subscriptions.
- Re-initialization does not preserve stale subscriptions.
- Encrypted and unencrypted paths both work.
- Existing `notifications/progress` behavior remains unchanged.

## Acceptance Criteria

- `notifications/resources/updated` is no longer broadcast blindly.
- Routing is based on actual committed MCP resource subscriptions.
- No subscription leaks across client sessions.
- Existing transport behavior for unrelated notifications is preserved.
- Tests cover multi-client, unsubscribe, failure, and cleanup paths.

## Non-Goals

- This change does not need to solve terminal scrollback by itself.
- This change does not block `csh` v1, because v1 will use poll/ack.
- This change does not need to implement a generalized live-stream transport for every notification
  type unless that falls out cleanly from the design.
