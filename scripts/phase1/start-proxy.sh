#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.phase1.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${CVM_CLIENT_PRIVATE_KEY:?CVM_CLIENT_PRIVATE_KEY is required}"
: "${CVM_SERVER_PUBKEY:?CVM_SERVER_PUBKEY is required}"
: "${CVM_RELAYS:?CVM_RELAYS is required}"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required for the SDK proxy implementation" >&2
  exit 1
fi

echo "Starting SDK proxy"
exec bun scripts/phase1/proxy-stdio.ts
