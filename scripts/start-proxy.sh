#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.phase1.local}"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required for the SDK proxy implementation" >&2
  exit 1
fi

exec bun "$ROOT_DIR/scripts/start-proxy.ts" "$ENV_FILE"
