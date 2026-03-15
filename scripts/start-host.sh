#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.phase1.local}"
RUNTIME_DIR="${CSH_RUNTIME_DIR:-$ROOT_DIR/.csh-runtime}"
LOGS_DIR="$RUNTIME_DIR/logs"
TMUX_SOCKET="${CSH_TMUX_SOCKET:-$RUNTIME_DIR/tmux.sock}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${GW_PRIVATE_KEY:?GW_PRIVATE_KEY is required}"
: "${CVM_RELAYS:?CVM_RELAYS is required}"

if [[ "${GW_ALLOW_UNLISTED_CLIENTS:-0}" != "1" ]] && [[ -z "${GW_ALLOWED_PUBLIC_KEYS:-}" ]]; then
  echo "GW_ALLOWED_PUBLIC_KEYS is required unless GW_ALLOW_UNLISTED_CLIENTS=1" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required" >&2
  exit 1
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required" >&2
  exit 1
fi

mkdir -p "$LOGS_DIR"

export CSH_TMUX_SOCKET="$TMUX_SOCKET"
export CSH_NOSTR_PRIVATE_KEY="${CSH_NOSTR_PRIVATE_KEY:-$GW_PRIVATE_KEY}"
export CSH_NOSTR_RELAY_URLS="${CSH_NOSTR_RELAY_URLS:-$CVM_RELAYS}"
export CSH_ALLOWED_PUBLIC_KEYS="${CSH_ALLOWED_PUBLIC_KEYS:-$GW_ALLOWED_PUBLIC_KEYS}"
export CSH_ALLOW_UNLISTED_CLIENTS="${CSH_ALLOW_UNLISTED_CLIENTS:-${GW_ALLOW_UNLISTED_CLIENTS:-0}}"
export CSH_SERVER_NAME="${CSH_SERVER_NAME:-${GW_SERVER_INFO_NAME:-csh interactive host}}"
export CSH_SERVER_WEBSITE="${CSH_SERVER_WEBSITE:-${GW_SERVER_INFO_WEBSITE:-}}"
export CSH_SERVER_ABOUT="${CSH_SERVER_ABOUT:-Private interactive ContextVM shell host.}"
export CSH_ENCRYPTION_MODE="${CSH_ENCRYPTION_MODE:-${GW_ENCRYPTION_MODE:-optional}}"

echo "Starting repo-local csh ContextVM gateway"
exec bun run "$ROOT_DIR/src/contextvm-gateway.ts"
