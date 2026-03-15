# csh Server Setup

This guide covers the recommended deployment and test posture for `csh`.

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

Install dependencies:

```bash
bun install
```

Bootstrap a local env:

```bash
bin/csh bootstrap .env.phase1.local
```

Check readiness:

```bash
bin/csh host check .env.phase1.local
```

Start the host:

```bash
bin/csh host start .env.phase1.local
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

Install dependencies:

```bash
bun install
```

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
bin/csh exec "pwd" /tmp/csh-client.env
```

Interactive shell:

```bash
bin/csh shell --session live-test /tmp/csh-client.env
```

Browser terminal:

```bash
bin/csh browser /tmp/csh-client.env
```

Open `http://127.0.0.1:4318`.

## Persistent Service

Render the `systemd` unit:

```bash
bin/csh host systemd-unit .env.phase1.local --output /tmp/csh-host.service
```

See [csh-host.service.example](/workspace/projects/csh/ops/systemd/csh-host.service.example).
