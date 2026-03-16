# Scripts

These scripts compose the repo-local interactive shell path:

- repo-local `tmux`-backed MCP server in `src/main.ts`
- repo-local ContextVM gateway in `src/contextvm-gateway.ts`
- interactive Bun client and browser terminal UI
- a repo-local SDK proxy path for stdio MCP compatibility
- a stable public CLI entrypoint at `bin/csh`
- a Bun-backed installer for `csh` on `PATH`

## Files

- `../bin/csh`: stable public CLI entrypoint
- `operator.sh`: compatibility shim to `bin/csh`
- `install-cli.sh`: installs a Bun-backed `csh` launcher into `~/.local/bin` by default
- `install-runtime.sh`: installs JS dependencies and checks the interactive runtime prerequisites
- `bootstrap-env.sh`: generates a private-by-default local env file with allowlisted host/client keys
- `start-host.sh`: runs the repo-local ContextVM gateway and interactive server stack
- `start-proxy.sh`: runs the repo-local SDK stdio proxy
- `generate-keypair.ts`: prints a Nostr private/public keypair in hex
- `smoke-client.ts`: connects over ContextVM/Nostr and verifies `session_*` tools
- `lifecycle-client.ts`: verifies reconnect continuity, session close, and fresh-session recreation
- `proxy-smoke.ts`: tries the repo-local stdio proxy operator path via stdio
- `run-autonomous-loop.sh`: installs runtime, bootstraps env, starts host, runs direct smoke, runs lifecycle verification, then compares the proxy path

## Setup

1. Install JavaScript dependencies:

   ```bash
   bun install
   ```

2. Install `csh` onto your user `PATH`:

   ```bash
   bun run csh install
   ```

3. Generate a private local env:

   ```bash
   csh bootstrap
   ```

4. Inspect or edit `.env.csh.local` if you want different relays or metadata.
   The browser UI now expects credentials from `CSH_BROWSER_AUTH_USER` and
   `CSH_BROWSER_AUTH_PASSWORD`.

## Run

1. Install the runtime:

   ```bash
   csh runtime install
   ```

2. Start the host:

   ```bash
   csh host start .env.csh.local
   ```

3. In a second shell, run the smoke client:

   ```bash
   csh direct .env.csh.local
   ```

4. Run the lifecycle test:

   ```bash
   csh lifecycle .env.csh.local
   ```

5. Optionally run the stdio proxy path:

   ```bash
   csh proxy .env.csh.local
   ```

6. Run the full loop in one command:

   ```bash
   csh verify
   ```

   When the env points at a loopback relay like `ws://127.0.0.1:10552`, `verify` will start a
   repo-local `nak` relay automatically if one is not already listening.

7. Run one real operator command:

   ```bash
   csh exec "pwd" .env.csh.local
   ```

8. Start the interactive shell:

   ```bash
   csh shell .env.csh.local
   ```

9. Start the browser terminal UI:

   ```bash
   csh browser .env.csh.local
   ```

   Then authenticate in the browser with the credentials from `.env.csh.local`.

## Notes

- The host path is now repo-local: `src/main.ts` exposes the `session_*` tools and
  `src/contextvm-gateway.ts` exposes that server over ContextVM with pubkey injection enabled.
- The current default operator path is the interactive client at `csh shell`, with `csh exec`
  kept for one-shot commands and `csh browser` available for the browser terminal UI.
- Browser UI access is authenticated even on loopback. Remote browser mode additionally requires
  `CSH_BROWSER_TRUST_PROXY_TLS=1` behind an HTTPS/TLS-terminating reverse proxy.
- The repo-local SDK proxy path also works and is available when you want a stdio MCP bridge.
- The repo no longer depends on the external `proxy-cli` binary for normal operation.
- See [csh-cli-operations.md](/workspace/projects/csh/docs/guides/csh-cli-operations.md) for the short
  user-facing operations guide.
