# ContextVM Private Demo

This is the first Phase 2 path for running `csh` privately over ContextVM.

## What Exists

- Gateway entrypoint: `bun run start:contextvm`
- Remote client demo: `bun run demo:contextvm`
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

## Run

Bootstrap everything on the server:

```bash
scripts/contextvm-private-demo.sh setup --relay-url wss://your-relay.example
```

That script:

- generates demo server/client keys with `nak`
- writes env files under `.csh-runtime/contextvm-private-demo/`
- starts the private gateway in `tmux`
- prints the exact client-side demo command

Other helper commands:

```bash
scripts/contextvm-private-demo.sh status
scripts/contextvm-private-demo.sh print-client
scripts/contextvm-private-demo.sh stop
```

For SSH-tunneled relay testing, use separate relay URLs:

```bash
scripts/contextvm-private-demo.sh setup \
  --server-relay-url ws://127.0.0.1:<server-relay-port> \
  --client-relay-url ws://127.0.0.1:<local-forwarded-port>
```

That is the correct shape when the relay is localhost-only on the server and the client reaches it
through `ssh -L`.

Manual server start remains available if you do not want the helper:

Server:

```bash
bun run start:contextvm
```

Client demo:

```bash
bun run demo:contextvm
```

The client demo opens a remote shell session over ContextVM, runs a few commands, polls for output,
prints the resulting terminal snapshot, and closes the session.

## Current Limits

- This Phase 2 slice keeps the Phase 1 input path:
  terminal input is still routed through `tmux send-keys`.
- The gateway pattern preserves the working stdio MCP server rather than replacing it with a
  one-process Nostr transport.
- A live relay-backed end-to-end demo is still pending operator-provided relay and key material.
