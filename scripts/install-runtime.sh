#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${CSH_RUNTIME_DIR:-$ROOT_DIR/.csh-runtime}"
LOGS_DIR="$RUNTIME_DIR/logs"
TMUX_SOCKET="$RUNTIME_DIR/tmux.sock"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required" >&2
  exit 1
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

mkdir -p "$LOGS_DIR"

echo "Installing JavaScript dependencies"
(
  cd "$ROOT_DIR"
  bun install --frozen-lockfile
  bun run csh:build-browser
)

echo "Runtime installed."
echo "tmux socket: $TMUX_SOCKET"
echo "logs dir: $LOGS_DIR"
