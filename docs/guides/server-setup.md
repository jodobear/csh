# csh Deployment Guide

This guide covers the recommended install, deployment, and test posture for `csh`.

## Install the CLI

From the repo checkout on both server and client:

```bash
bun install
bun run csh install
```

That installs a Bun-backed launcher to `~/.local/bin/csh` by default.
The runtime expects `bun` and `python3` on the host.

Useful follow-up checks:

```bash
csh version
csh doctor
csh status
```

For lifecycle:

```bash
csh upgrade
csh uninstall
```

If `~/.local/bin` is not already on `PATH`, add it before continuing.

## Recommended Transport Posture

Use transports in this order:

1. private relay reachable over your VPN or private network
2. SSH tunnel to a private relay on the server
3. `relay.contextvm.org` only for convenience or compatibility checks

Why:

- the operator workflow is much more deterministic on a relay you control
- VPN/private relay paths avoid public-relay availability and propagation issues
- SSH tunneling is the fastest fallback when network ACLs are uncertain

## Server

Bootstrap a local env:

```bash
csh bootstrap .env.csh.local
```

The generated env includes deprecated bridge credentials for fallback/admin use and defaults to a
loopback/private relay.
It also sets `CSH_SCROLLBACK_LINES=10000` for the persisted session scrollback path.

Check readiness and the resolved runtime state:

```bash
csh doctor .env.csh.local
csh host check .env.csh.local
```

Start the host:

```bash
csh host start .env.csh.local
```

Inspect the live config summary at any time:

```bash
csh status .env.csh.local
```

## Private Test Relay With `nak`

Start a deterministic relay on the server:

```bash
CSH_TEST_RELAY_HOST=0.0.0.0 CSH_TEST_RELAY_PORT=10552 scripts/start-test-relay.sh
```

Then point the host env at that relay:

```bash
CVM_RELAYS="ws://127.0.0.1:10552"
```

For remote clients, use the server's reachable VPN/private IP in the client env, not `127.0.0.1`.

`csh verify` will auto-start this relay shape locally when the env uses a loopback `ws://127.0.0.1:<port>`
URL and `nak` is installed.

## SSH Tunnel Fallback

If direct relay access is blocked by VPN ACLs or firewalls, tunnel the relay:

```bash
ssh -L 10552:127.0.0.1:10552 <server>
```

Then use this in the client env:

```bash
CVM_RELAYS="ws://127.0.0.1:10552"
```

## Client

Minimal client env:

```bash
CVM_RELAYS="ws://<relay-host>:10552"
CVM_CLIENT_PRIVATE_KEY="<client-private-key>"
CVM_SERVER_PUBKEY="<server-pubkey>"
CVM_PROXY_ENCRYPTION_MODE="required"
CVM_LOG_LEVEL="error"
```

Quick check:

```bash
csh exec "pwd" /tmp/csh-client.env
```

Interactive shell:

```bash
csh shell --session live-test /tmp/csh-client.env
```

Browser terminal:

```bash
csh browser /tmp/csh-client.env
```

Open `http://127.0.0.1:4318`.
Enter the relay URL and server pubkey, choose a signer, and connect with your Nostr identity.
Shell access is granted only when the signer pubkey is already on the host allowlist or redeems a
valid one-time invite token.

Admin helpers for that auth flow:

```bash
csh auth allowlist add <pubkey> .env.csh.local
csh auth invite create .env.csh.local
csh profile export .env.csh.local
```

If you want to host the static browser bundle independently of the repo-local preview server:

```bash
csh browser build
csh browser serve-static .env.csh.local
```

If you intentionally expose the browser UI beyond loopback, set:

```bash
CSH_BROWSER_ALLOW_REMOTE=1
CSH_BROWSER_TRUST_PROXY_TLS=1
```

and put it behind an HTTPS/TLS-terminating reverse proxy. `CSH_BROWSER_AUTH_USER` and
`CSH_BROWSER_AUTH_PASSWORD` apply only to the deprecated `csh browser-bridge` fallback.

## Browser Operator Path

The default browser flow is:

1. run `csh browser <config>`
2. open the printed local URL
3. enter the relay URL and server pubkey, or import a saved profile from `csh profile export`
4. choose a signer and connect with your Nostr identity
5. if needed, redeem a one-time invite token for shell access
6. use the reconnect button if you want to reattach a persisted session

The browser UI is a static signer-based operator client, not a public multi-user shell surface.

## Terminal Fidelity Posture

Current behavior is intentionally described narrowly:

- terminal I/O is handled by the native PTY session manager
- byte-safe input is available across CLI and browser operators
- deeper scrollback is available through `CSH_SCROLLBACK_LINES`
- reconnect and session persistence work
- `csh exec` reports the real remote exit status

If the next phase pushes fidelity further, it should be about hardening and verification depth rather
than more CLI surface.

## Persistent Service

Render the `systemd` unit:

```bash
csh host systemd-unit .env.csh.local --output /tmp/csh-host.service
```

See [csh-host.service.example](/workspace/projects/csh/ops/systemd/csh-host.service.example).

Recommended host lifecycle:

1. `csh doctor .env.csh.local`
2. `csh host systemd-unit .env.csh.local --output /tmp/csh-host.service`
3. install the rendered unit as a dedicated non-root service account
4. keep the relay private by default
5. use `csh verify` after deployment changes
6. use `csh verify release` before a release or after substantial transport/runtime changes

## Compatibility Note

`relay.contextvm.org` is now a working compatibility path, but it is still not the preferred
operator relay. Use your own relay or an SSH tunnel first.

## Product Posture Note

ContextVM removes the need for direct host reachability, but it does not remove the need for:

- reachable relays
- an intentionally hosted browser asset path
- explicit relay/bootstrap information for operators

Knowing the server pubkey is not sufficient by itself if the relay path is not reachable or known to
the operator.
