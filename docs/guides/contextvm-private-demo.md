# ContextVM Private Demo

This is the first Phase 2 path for running `csh` privately over ContextVM.

## What Exists

- Gateway entrypoint: `bun run start:contextvm`
- Scripted remote client demo: `bun run demo:contextvm`
- Interactive remote client demo: `bun run demo:contextvm:interactive`
- Private access control:
  - required encryption
  - allowed pubkey whitelist
  - injected client pubkey bound to session ownership

## Required Environment

Server process:

```bash
export CSH_NOSTR_PRIVATE_KEY=<64-char hex private key>
export CSH_NOSTR_RELAY_URLS=wss://your-relay.example
export CSH_ALLOWED_PUBLIC_KEYS=<allowed-client-pubkey-hex>
```

Optional server metadata:

```bash
export CSH_SERVER_NAME="csh private shell"
export CSH_SERVER_WEBSITE="https://example.com"
export CSH_SERVER_ABOUT="Private ContextVM shell gateway"
```

Client process:

```bash
export CSH_CLIENT_PRIVATE_KEY=<64-char hex private key>
export CSH_SERVER_PUBKEY=<server-pubkey-hex>
export CSH_NOSTR_RELAY_URLS=wss://your-relay.example
```

## Recommended Demo Topology

Use local `strfry` on the server plus `ssh -L` from the client as the primary cross-machine demo
path.

Why this is the current default:

- it is the first cross-machine topology verified end-to-end for both the scripted and interactive
  demo clients on 2026-03-13
- it avoids Haven's owner/whitelist policy surface
- it avoids public-relay timing variability while we validate the shell path
- it keeps the relay behavior simple and inspectable

Use `wss://relay.contextvm.org` as a same-host or single-machine smoke path, not the main
cross-machine demo path.

Treat a Haven relay as a separate private-topology follow-on. It is appropriate only when the relay
is intentionally localhost-only on the server and the client reaches it through `ssh -L`.

## Run

Start `strfry` on the server:

```bash
scripts/contextvm-strfry-relay.sh start
```

Bootstrap the gateway on the server against that relay:

```bash
scripts/contextvm-private-demo.sh setup \
  --server-relay-url ws://127.0.0.1:10549 \
  --client-relay-url ws://127.0.0.1:10549
```

That script:

- generates demo server/client keys with `nak`
- writes env files under `.csh-runtime/contextvm-private-demo/`
- starts or restarts the private gateway in `tmux`
- prints the exact client-side demo command

If you only want to recover the running gateway later:

```bash
scripts/contextvm-private-demo.sh start
```

Other helper commands:

```bash
scripts/contextvm-private-demo.sh status
scripts/contextvm-private-demo.sh print-client
scripts/contextvm-private-demo.sh stop
scripts/contextvm-strfry-relay.sh status
scripts/contextvm-strfry-relay.sh logs
```

From the client machine, keep the SSH tunnel open:

```bash
ssh -N -L 10549:127.0.0.1:10549 <user>@<server>
```

Then in another client shell:

```bash
git pull origin master
unset CSH_CLIENT_PRIVATE_KEY CSH_SERVER_PUBKEY CSH_NOSTR_RELAY_URLS CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS

export CSH_CLIENT_PRIVATE_KEY=<printed-client-private-key>
export CSH_SERVER_PUBKEY=<printed-server-pubkey>
export CSH_NOSTR_RELAY_URLS=ws://127.0.0.1:10549
export CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS=300
```

Run the scripted smoke demo:

```bash
bun run demo:contextvm
```

Run the interactive shell demo:

```bash
bun run demo:contextvm:interactive
```

Interactive controls:

- `Ctrl-C` sends `SIGINT` to the remote shell
- `Ctrl-]` closes the client locally
- `exit` or `Ctrl-D` closes the remote shell session

### Public-relay Smoke Path

If you want the public-relay same-host proof instead, use:

```bash
scripts/contextvm-private-demo.sh setup --relay-url wss://relay.contextvm.org
```

That path is useful as a quick relay-backed smoke test, but it is not the recommended
cross-machine demo topology anymore.

### Haven-style Split URLs

For a localhost-only relay on the server with a forwarded client port, use separate relay URLs:

```bash
scripts/contextvm-private-demo.sh setup \
  --server-relay-url ws://127.0.0.1:<server-relay-port> \
  --client-relay-url ws://127.0.0.1:<local-forwarded-port>
```

Use that shape only when the client-side forwarded port is actually listening.

Manual server start remains available if you do not want the helper:

Server:

```bash
bun run start:contextvm
```

Client demo:

```bash
bun run demo:contextvm
bun run demo:contextvm:interactive
```

The scripted demo opens a remote shell session over ContextVM, runs a few commands, polls for
output, prints the resulting terminal snapshot, and closes the session.

The interactive demo opens a remote shell session over ContextVM, forwards local terminal input to
the remote shell, polls the tmux snapshot for screen updates, resizes with the local terminal, and
closes cleanly when the remote shell exits.

## Current Limits

- This Phase 2 slice keeps the Phase 1 input path:
  terminal input is still routed through `tmux send-keys`.
- The gateway pattern preserves the working stdio MCP server rather than replacing it with a
  one-process Nostr transport.
- The first same-host live relay-backed demo used `wss://relay.contextvm.org` on 2026-03-13.
- The first verified cross-machine demo used local `strfry` plus `ssh -L` on 2026-03-13.
- In this Codex environment, the live relay-backed demo required unsandboxed execution.
