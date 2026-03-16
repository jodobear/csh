#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.phase1.local}"
HOST_LOG="${CSH_HOST_LOG:-$ROOT_DIR/.csh-runtime/logs/host.log}"
PROXY_LOG="${CSH_PROXY_LOG:-$ROOT_DIR/.csh-runtime/logs/proxy.log}"

mkdir -p "$(dirname "$HOST_LOG")"

relay_pid=""

cleanup() {
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
if [[ ! -f "$ENV_FILE" ]] || [[ "${CSH_VERIFY_BOOTSTRAP:-0}" == "1" ]]; then
  scripts/bootstrap-env.sh "$ENV_FILE"
fi

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
  relay_port="${BASH_REMATCH[2]}"
  if ! ss -ltn 2>/dev/null | grep -q ":$relay_port "; then
    if ! command -v nak >/dev/null 2>&1; then
      echo "loopback relay $relay_url is not running and nak is not installed" >&2
      exit 1
    fi
    CSH_TEST_RELAY_HOST="$relay_host" CSH_TEST_RELAY_PORT="$relay_port" scripts/start-test-relay.sh >"$ROOT_DIR/.csh-runtime/logs/relay.log" 2>&1 &
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

CVM_ENV_FILE="$ENV_FILE" bun run csh:smoke
CVM_ENV_FILE="$ENV_FILE" bun run csh:lifecycle

set +e
CVM_ENV_FILE="$ENV_FILE" bun run csh:proxy-smoke >"$PROXY_LOG" 2>&1
proxy_status=$?
set -e

printf 'default_operator_path=%s\n' "direct-bun-client"
printf 'proxy_operator_path=%s\n' "local-sdk-proxy"
printf 'proxy_status=%s\n' "$proxy_status"
printf 'host_log=%s\n' "$HOST_LOG"
printf 'proxy_log=%s\n' "$PROXY_LOG"

if [[ "$proxy_status" != "0" ]]; then
  exit "$proxy_status"
fi
