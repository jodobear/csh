#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${CSH_RUNTIME_DIR:-$ROOT_DIR/.csh-runtime}"
NAK_HOME="${CSH_NAK_HOME:-$RUNTIME_DIR/nak-relay}"
HOST="${CSH_TEST_RELAY_HOST:-127.0.0.1}"
PORT="${CSH_TEST_RELAY_PORT:-10552}"

if ! command -v nak >/dev/null 2>&1; then
  echo "nak is required" >&2
  exit 1
fi

mkdir -p "$NAK_HOME/config" "$NAK_HOME/data"

export HOME="$NAK_HOME"
export XDG_CONFIG_HOME="$NAK_HOME/config"
export XDG_DATA_HOME="$NAK_HOME/data"

echo "Starting nak test relay at ws://$HOST:$PORT"
exec nak serve --hostname "$HOST" --port "$PORT"
