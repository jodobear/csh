# Browser Terminal UI

This guide now covers both browser bridge modes for `csh`.

## What Exists

- local browser server: `bun run start:browser`
- ContextVM-backed browser server: `bun run start:browser:contextvm`
- xterm-based terminal rendering in the browser
- local HTTP bridge routes that mirror the stable shell contract:
  - `POST /api/session/open`
  - `POST /api/session/write`
  - `POST /api/session/resize`
  - `POST /api/session/signal`
  - `POST /api/session/poll`
  - `POST /api/session/close`

Both browser paths keep the same browser app and HTTP routes.

- `start:browser` talks to the local stdio MCP shell server.
- `start:browser:contextvm` talks to the remote shell gateway over ContextVM using the existing
  client env vars and skew-tolerant client transport.

## Run

Local bridge from the repo root:

```bash
bun install
bun run start:browser
```

Open:

```text
http://127.0.0.1:4318
```

Optional overrides:

```bash
export CSH_BROWSER_HOST=127.0.0.1
export CSH_BROWSER_PORT=4318
```

## Remote ContextVM Mode

Server side:

```bash
scripts/contextvm-strfry-relay.sh start
scripts/contextvm-private-demo.sh setup \
  --server-relay-url ws://127.0.0.1:10549 \
  --client-relay-url ws://127.0.0.1:10549
```

Client side:

```bash
export CSH_CLIENT_PRIVATE_KEY=11b619c00af0172fdf72fe1443d5e981761bf8fcde6f58d1672beb252fbad6c9
export CSH_SERVER_PUBKEY=98d5b865ec8b21aa6f893db7793ea1f588beeaf81bdb296dcdb10bd8f4932a75
export CSH_NOSTR_RELAY_URLS=ws://127.0.0.1:10549
export CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS=300
export CSH_BROWSER_PORT=4319
bun run start:browser:contextvm
```

Open:

```text
http://127.0.0.1:4319
```

The ContextVM-backed browser bridge reuses:

- `CSH_CLIENT_PRIVATE_KEY`
- `CSH_SERVER_PUBKEY`
- `CSH_NOSTR_RELAY_URLS`
- `CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS`

It also pins `ownerId` to the authenticated Nostr pubkey before forwarding calls, so the browser
can keep the same request shape while the remote shell server still enforces session ownership
against the authenticated ContextVM client identity.

## Controls

- Type directly into the terminal to send input.
- Resize the browser window to resize the remote shell session.
- `Interrupt` sends `SIGINT`.
- `Close` closes the shell session cleanly.
- `Reconnect` opens a fresh shell session after closure.

## Verification Path

Manual browser path:

1. Run `bun run start:browser`.
2. Open `http://127.0.0.1:4318`.
3. Wait for the shell prompt.
4. Type `printf "browser ui smoke\n"` and press Enter.
5. Confirm the output appears in the terminal.
6. Click `Interrupt` during a long-running command or `Close` to end the session.

Remote ContextVM browser path:

1. Bring up the relay and gateway using the server-side commands above.
2. Run `bun run start:browser:contextvm` on the client.
3. Open `http://127.0.0.1:4319`.
4. Type:
   `hostname`
   `pwd`
   `uname -a`
5. Confirm the output matches the remote shell runtime rather than the local browser-bridge
   working directory.
6. Use `Interrupt`, `Close`, and `Reconnect`.

If the page says it is connected but only shows a blank cursor, pull the latest `master`, restart
`bun run start:browser:contextvm`, and reload the page. That symptom was a browser snapshot-replay
bug, not a relay or shell-backend failure.

If the prompt is visible but typing does not register, also pull the latest `master` and restart the
browser bridge. The browser input path now uses a stable browser-owned capture field rather than
depending on xterm's recreated helper textarea across snapshot refreshes.

In this Codex environment the server and client run on the same host, so `hostname` and `uname -a`
match. To prove the bridge is still talking to the remote shell, the verification run used a
separate `/tmp` client checkout; the browser bridge local working directory was
`/tmp/csh-browser-client.*` while the remote shell `pwd` was `/workspace/projects/csh`.

HTTP smoke path:

```bash
bun -e 'const owner="browser-smoke"; const base="http://127.0.0.1:4318"; const post=async (path, body)=>{ const response=await fetch(`${base}${path}`, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)}); const json=await response.json(); if(!response.ok) throw new Error(JSON.stringify(json)); return json; }; const open=await post("/api/session/open", {command:"/bin/sh", ownerId:owner, cols:100, rows:28}); console.log(JSON.stringify(open)); await post("/api/session/write", {sessionId:open.sessionId, ownerId:owner, input:"printf \\"browser ui smoke\\\\n\\"\\n"}); await Bun.sleep(200); const poll=await post("/api/session/poll", {sessionId:open.sessionId, ownerId:owner, cursor:open.cursor}); console.log(JSON.stringify(poll)); await post("/api/session/close", {sessionId:open.sessionId, ownerId:owner});'
```

## Current Limits

- This Phase 3.1 path is local-first and does not yet put ContextVM transport directly in the
  browser.
- `start:browser:contextvm` still uses a local Bun bridge process on the client; the browser does
  not hold Nostr keys or speak ContextVM directly.
- Terminal input still uses the existing `tmux send-keys` backend path.
- The browser renders whole-screen snapshot refreshes from `session_poll`; it is not yet using
  incremental diff rendering or push updates.
- Running multiple live ContextVM clients with the same demo key against the same relay can create
  confusing verification collisions; use the supported demo bootstrap path and test clients
  sequentially unless you intentionally want to study that behavior.
