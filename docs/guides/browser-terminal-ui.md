# Browser Terminal UI

This is the first Phase 3.1 browser slice for `csh`.

## What Exists

- local browser server: `bun run start:browser`
- xterm-based terminal rendering in the browser
- local HTTP bridge routes that mirror the stable shell contract:
  - `POST /api/session/open`
  - `POST /api/session/write`
  - `POST /api/session/resize`
  - `POST /api/session/signal`
  - `POST /api/session/poll`
  - `POST /api/session/close`

The browser path is intentionally local-first. It reuses the existing stdio MCP shell server rather
than replacing the working ContextVM gateway/demo path.

## Run

From the repo root:

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

HTTP smoke path:

```bash
bun -e 'const owner="browser-smoke"; const base="http://127.0.0.1:4318"; const post=async (path, body)=>{ const response=await fetch(`${base}${path}`, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)}); const json=await response.json(); if(!response.ok) throw new Error(JSON.stringify(json)); return json; }; const open=await post("/api/session/open", {command:"/bin/sh", ownerId:owner, cols:100, rows:28}); console.log(JSON.stringify(open)); await post("/api/session/write", {sessionId:open.sessionId, ownerId:owner, input:"printf \\"browser ui smoke\\\\n\\"\\n"}); await Bun.sleep(200); const poll=await post("/api/session/poll", {sessionId:open.sessionId, ownerId:owner, cursor:open.cursor}); console.log(JSON.stringify(poll)); await post("/api/session/close", {sessionId:open.sessionId, ownerId:owner});'
```

## Current Limits

- This Phase 3.1 path is local-first and does not yet put ContextVM transport directly in the
  browser.
- Terminal input still uses the existing `tmux send-keys` backend path.
- The browser renders whole-screen snapshot refreshes from `session_poll`; it is not yet using
  incremental diff rendering or push updates.
