# csh CLI Operations

`csh` is the stable CLI entrypoint for this repo.

## Primary Commands

Bootstrap a secure local config:

```bash
bin/csh bootstrap .env.phase1.local
```

Install or refresh runtime prerequisites:

```bash
bin/csh runtime install
```

Validate host readiness:

```bash
bin/csh host check .env.phase1.local
```

Start the persistent host:

```bash
bin/csh host start .env.phase1.local
```

Run one operator command in a fresh remote shell:

```bash
bin/csh exec "pwd" .env.phase1.local
```

Start the interactive shell:

```bash
bin/csh shell .env.phase1.local
```

Reconnect to an existing interactive session:

```bash
bin/csh shell .env.phase1.local --session <session-id>
```

Start the browser terminal UI:

```bash
bin/csh browser .env.phase1.local
```

Run the end-to-end verification loop:

```bash
bin/csh verify /tmp/csh-verify.env
```

## Secure Defaults

- `bootstrap` writes the env file with `0600` permissions
- host mode requires an allowlist unless `GW_ALLOW_UNLISTED_CLIENTS=1`
- default log level is `error` to reduce transport noise in normal operation
- interactive sessions are owner-bound when the ContextVM gateway injects the authenticated client pubkey
- the `systemd` unit uses `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`, and `UMask=0077`
- the preferred operator transport is a private relay over VPN/private network; use SSH tunneling if direct relay reachability is uncertain

## Transport Posture

Recommended:

1. private relay you control
2. SSH tunnel to that relay when firewall or VPN rules are unclear
3. `relay.contextvm.org` only as a secondary compatibility check

For a full server/client walkthrough, see [server-setup.md](/workspace/projects/csh/docs/guides/server-setup.md).

## systemd

Render a hardened unit for your real server paths:

```bash
bin/csh host systemd-unit .env.phase1.local --output /tmp/csh-host.service
```

You can also start from [csh-host.service.example](/workspace/projects/csh/ops/systemd/csh-host.service.example).
