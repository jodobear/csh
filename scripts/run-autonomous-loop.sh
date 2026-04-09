#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.csh.local}"
HOST_LOG="${CSH_HOST_LOG:-$ROOT_DIR/.csh-runtime/logs/host.log}"
RELAY_LOG="${CSH_RELAY_LOG:-$ROOT_DIR/.csh-runtime/logs/relay.log}"
PROXY_LOG="${CSH_PROXY_LOG:-$ROOT_DIR/.csh-runtime/logs/proxy.log}"
CONTRACT_LOG="${CSH_CONTRACT_LOG:-$ROOT_DIR/.csh-runtime/logs/phase7-contract.log}"
HOST_CONTROL_LOG="${CSH_HOST_CONTROL_LOG:-$ROOT_DIR/.csh-runtime/logs/host-control.log}"
EXEC_LOG="${CSH_EXEC_LOG:-$ROOT_DIR/.csh-runtime/logs/exec.log}"
SOAK_LOG="${CSH_SOAK_LOG:-$ROOT_DIR/.csh-runtime/logs/session-soak.log}"
RELAY_RECOVERY_LOG="${CSH_RELAY_RECOVERY_LOG:-$ROOT_DIR/.csh-runtime/logs/relay-recovery.log}"
RELAY_RECOVERY_RELAY_LOG="${CSH_RELAY_RECOVERY_RELAY_LOG:-$ROOT_DIR/.csh-runtime/logs/relay-recovery-relay.log}"
RESTART_LOG="${CSH_RESTART_LOG:-$ROOT_DIR/.csh-runtime/logs/restart-recovery.log}"
RESTART_HOST_LOG="${CSH_RESTART_HOST_LOG:-$ROOT_DIR/.csh-runtime/logs/restart-host.log}"
BROWSER_LOG="${CSH_BROWSER_LOG:-$ROOT_DIR/.csh-runtime/logs/browser.log}"
BROWSER_SMOKE_LOG="${CSH_BROWSER_SMOKE_LOG:-$ROOT_DIR/.csh-runtime/logs/browser-smoke.log}"

mkdir -p "$(dirname "$HOST_LOG")"

relay_pid=""

cleanup() {
  if [[ -n "${browser_pid:-}" ]] && kill -0 "$browser_pid" 2>/dev/null; then
    kill "$browser_pid" 2>/dev/null || true
    wait "$browser_pid" 2>/dev/null || true
  fi
  if [[ -n "${host_pid:-}" ]] && kill -0 "$host_pid" 2>/dev/null; then
    kill "$host_pid" 2>/dev/null || true
    wait "$host_pid" 2>/dev/null || true
  fi
  if [[ -n "$relay_pid" ]] && kill -0 "$relay_pid" 2>/dev/null; then
    kill "$relay_pid" 2>/dev/null || true
    wait "$relay_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$ROOT_DIR"

scripts/install-runtime.sh

bun run test:host-control >"$HOST_CONTROL_LOG" 2>&1
bun run test:phase7-contract >"$CONTRACT_LOG" 2>&1

if [[ ! -f "$ENV_FILE" ]] || [[ "${CSH_VERIFY_BOOTSTRAP:-0}" == "1" ]]; then
  scripts/bootstrap-env.sh "$ENV_FILE"
fi

verify_browser_port="$(
  bun -e '
    const net = await import("node:net");
    const start = Number.parseInt(process.env.CSH_VERIFY_BROWSER_PORT || "43180", 10);
    const limit = start + 200;

    async function canListen(port) {
      return await new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.listen(port, "127.0.0.1", () => {
          server.close(() => resolve(true));
        });
      });
    }

    for (let port = start; port < limit; port += 1) {
      if (await canListen(port)) {
        console.log(port);
        process.exit(0);
      }
    }

    process.exit(1);
  '
)"
export CSH_BROWSER_HOST="${CSH_BROWSER_HOST:-127.0.0.1}"
export CSH_BROWSER_PORT="$verify_browser_port"

relay_url="$(
  CVM_ENV_FILE="$ENV_FILE" bun -e '
    const { parseEnvFile } = await import("./scripts/config.ts");
    const envFile = process.env.CVM_ENV_FILE;
    if (!envFile) {
      process.exit(1);
    }
    const values = parseEnvFile(envFile);
    console.log(values.CVM_RELAYS || "");
  '
)"
if [[ "$relay_url" =~ ^ws://(127\.0\.0\.1|localhost):([0-9]+)$ ]]; then
  relay_host="${BASH_REMATCH[1]}"
  relay_base_port="${BASH_REMATCH[2]}"
  relay_port="$(
    CSH_VERIFY_RELAY_PORT_START="$relay_base_port" bun -e '
      const net = await import("node:net");
      const start = Number.parseInt(process.env.CSH_VERIFY_RELAY_PORT_START || "10552", 10);
      const limit = start + 200;

      async function canListen(port) {
        return await new Promise((resolve) => {
          const server = net.createServer();
          server.once("error", () => resolve(false));
          server.listen(port, "127.0.0.1", () => {
            server.close(() => resolve(true));
          });
        });
      }

      for (let port = start; port < limit; port += 1) {
        if (await canListen(port)) {
          console.log(port);
          process.exit(0);
        }
      }

      process.exit(1);
    '
  )"
  relay_url="ws://$relay_host:$relay_port"
  export CVM_RELAYS="$relay_url"
  export CSH_NOSTR_RELAY_URLS="$relay_url"

  if ! command -v nak >/dev/null 2>&1; then
    echo "loopback relay verification requires nak in PATH" >&2
    exit 1
  fi

  CSH_TEST_RELAY_HOST="$relay_host" CSH_TEST_RELAY_PORT="$relay_port" scripts/start-test-relay.sh >"$RELAY_LOG" 2>&1 &
  relay_pid=$!
  relay_ready=0
  for _ in $(seq 1 30); do
    if ss -ltn 2>/dev/null | grep -q ":$relay_port "; then
      relay_ready=1
      break
    fi
    if ! kill -0 "$relay_pid" 2>/dev/null; then
      echo "relay process exited before becoming ready" >&2
      exit 1
    fi
    sleep 1
  done
  if [[ "$relay_ready" != "1" ]]; then
    echo "relay did not become ready in time" >&2
    exit 1
  fi
fi

scripts/start-host.sh "$ENV_FILE" >"$HOST_LOG" 2>&1 &
host_pid=$!

ready=0
for _ in $(seq 1 30); do
  if grep -q "csh ContextVM gateway started" "$HOST_LOG" 2>/dev/null; then
    ready=1
    break
  fi

  if ! kill -0 "$host_pid" 2>/dev/null; then
    echo "host process exited before becoming ready" >&2
    exit 1
  fi

  sleep 1
done

if [[ "$ready" != "1" ]]; then
  echo "host did not become ready in time" >&2
  exit 1
fi

bun run scripts/csh.ts browser "$ENV_FILE" >"$BROWSER_LOG" 2>&1 &
browser_pid=$!

browser_ready=0
for _ in $(seq 1 30); do
  if grep -q "csh browser UI (contextvm) listening on" "$BROWSER_LOG" 2>/dev/null; then
    browser_ready=1
    break
  fi

  if ! kill -0 "$browser_pid" 2>/dev/null; then
    echo "browser process exited before becoming ready" >&2
    exit 1
  fi

  sleep 1
done

if [[ "$browser_ready" != "1" ]]; then
  echo "browser did not become ready in time" >&2
  exit 1
fi

CVM_ENV_FILE="$ENV_FILE" bun run csh:smoke
CVM_ENV_FILE="$ENV_FILE" bun run csh:lifecycle

set +e
CVM_ENV_FILE="$ENV_FILE" bun run csh:session-soak >"$SOAK_LOG" 2>&1
soak_status=$?
set -e

if [[ "$soak_status" != "0" ]]; then
  exit "$soak_status"
fi

relay_recovery_status=0
if [[ -n "$relay_pid" ]]; then
  set +e
  CSH_RELAY_RECOVERY_RELAY_PID="$relay_pid" \
  CSH_RELAY_RECOVERY_RELAY_LOG="$RELAY_RECOVERY_RELAY_LOG" \
  CVM_ENV_FILE="$ENV_FILE" \
    bun run csh:relay-recovery "$ENV_FILE" >"$RELAY_RECOVERY_LOG" 2>&1
  relay_recovery_status=$?
  set -e

  replacement_relay_pid="$(sed -n 's/^replacement_relay_pid=//p' "$RELAY_RECOVERY_LOG" | tail -n 1)"
  if [[ -n "$replacement_relay_pid" ]]; then
    relay_pid="$replacement_relay_pid"
  fi

  if [[ "$relay_recovery_status" != "0" ]]; then
    exit "$relay_recovery_status"
  fi
fi

set +e
CSH_RESTART_HOST_PID="$host_pid" \
CSH_RESTART_HOST_LOG="$RESTART_HOST_LOG" \
CVM_ENV_FILE="$ENV_FILE" \
  bun run csh:restart-recovery "$ENV_FILE" >"$RESTART_LOG" 2>&1
restart_status=$?
set -e

replacement_host_pid="$(sed -n 's/^replacement_host_pid=//p' "$RESTART_LOG" | tail -n 1)"
if [[ -n "$replacement_host_pid" ]]; then
  host_pid="$replacement_host_pid"
fi

if [[ "$restart_status" != "0" ]]; then
  exit "$restart_status"
fi

set +e
bun run scripts/csh.ts exec "printf __EXEC__\\\\n; exit 7" "$ENV_FILE" >"$EXEC_LOG" 2>&1
exec_status=$?
set -e

if [[ "$exec_status" != "7" ]]; then
  echo "csh exec did not return the remote exit status (expected 7, got $exec_status)" >&2
  exit "$exec_status"
fi

set +e
CVM_ENV_FILE="$ENV_FILE" bun run csh:proxy-smoke >"$PROXY_LOG" 2>&1
proxy_status=$?
set -e

set +e
CVM_ENV_FILE="$ENV_FILE" bun run csh:browser-smoke >"$BROWSER_SMOKE_LOG" 2>&1
browser_status=$?
set -e

printf 'default_operator_path=%s\n' "direct-bun-client"
printf 'proxy_operator_path=%s\n' "local-sdk-proxy"
printf 'browser_port=%s\n' "$CSH_BROWSER_PORT"
printf 'host_control_log=%s\n' "$HOST_CONTROL_LOG"
printf 'phase7_contract_log=%s\n' "$CONTRACT_LOG"
printf 'exec_log=%s\n' "$EXEC_LOG"
printf 'soak_status=%s\n' "$soak_status"
printf 'soak_log=%s\n' "$SOAK_LOG"
printf 'relay_log=%s\n' "$RELAY_LOG"
printf 'relay_recovery_status=%s\n' "$relay_recovery_status"
printf 'relay_recovery_log=%s\n' "$RELAY_RECOVERY_LOG"
printf 'relay_recovery_relay_log=%s\n' "$RELAY_RECOVERY_RELAY_LOG"
printf 'restart_status=%s\n' "$restart_status"
printf 'proxy_status=%s\n' "$proxy_status"
printf 'exec_status=%s\n' "$exec_status"
printf 'browser_status=%s\n' "$browser_status"
printf 'host_log=%s\n' "$HOST_LOG"
printf 'restart_log=%s\n' "$RESTART_LOG"
printf 'restart_host_log=%s\n' "$RESTART_HOST_LOG"
printf 'proxy_log=%s\n' "$PROXY_LOG"
printf 'browser_log=%s\n' "$BROWSER_LOG"
printf 'browser_smoke_log=%s\n' "$BROWSER_SMOKE_LOG"

if [[ "$proxy_status" != "0" ]]; then
  exit "$proxy_status"
fi

if [[ "$browser_status" != "0" ]]; then
  exit "$browser_status"
fi
