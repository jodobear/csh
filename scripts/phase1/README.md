# Phase 1 Scripts

These scripts now compose the repo-local interactive shell path:

- repo-local `tmux`-backed MCP server in `src/main.ts`
- repo-local ContextVM gateway in `src/contextvm-gateway.ts`
- interactive Bun client and browser terminal UI
- a repo-local SDK proxy path for stdio MCP compatibility
- a stable public CLI entrypoint at `bin/csh`

## Files

- `../../bin/csh`: stable public CLI entrypoint
- `operator.sh`: compatibility shim to `bin/csh`
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

2. Generate a private local env:

   ```bash
   bin/csh bootstrap
   ```

3. Inspect or edit `.env.phase1.local` if you want different relays or metadata.

## Run

1. Install the runtime:

   ```bash
   bin/csh runtime install
   ```

2. Start the host:

   ```bash
   bin/csh host start .env.phase1.local
   ```

3. In a second shell, run the smoke client:

   ```bash
   bin/csh direct .env.phase1.local
   ```

4. Run the lifecycle test:

   ```bash
   bin/csh lifecycle .env.phase1.local
   ```

5. Optionally run the stdio proxy path:

   ```bash
   bin/csh proxy .env.phase1.local
   ```

6. Run the full loop in one command:

   ```bash
   bin/csh verify
   ```

7. Run one real operator command:

   ```bash
   bin/csh exec "pwd" .env.phase1.local
   ```

8. Start the interactive shell:

   ```bash
   bin/csh shell .env.phase1.local
   ```

9. Start the browser terminal UI:

   ```bash
   bin/csh browser .env.phase1.local
   ```

## Notes

- The host path is now repo-local: `src/main.ts` exposes the `session_*` tools and
  `src/contextvm-gateway.ts` exposes that server over ContextVM with pubkey injection enabled.
- The current default operator path is the interactive client at `bin/csh shell`, with `bin/csh exec`
  kept for one-shot commands and `bin/csh browser` available for the browser terminal UI.
- The repo-local SDK proxy path also works and is available when you want a stdio MCP bridge.
- The repo no longer depends on the external `proxy-cli` binary for normal operation.
- See [csh-cli-operations.md](/workspace/projects/csh/docs/guides/csh-cli-operations.md) for the short
  user-facing operations guide.
