#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.csh-runtime"
CONTAINER_NAME="csh-strfry-test"
IMAGE_NAME="localhost/local-strfry:latest"
HOST_PORT="10549"
CONFIG_FILE="${RUNTIME_DIR}/strfry-relay.conf"
DB_DIR="${RUNTIME_DIR}/strfry-db"

usage() {
  cat <<'EOF'
Usage:
  scripts/contextvm-strfry-relay.sh start
  scripts/contextvm-strfry-relay.sh stop
  scripts/contextvm-strfry-relay.sh status
  scripts/contextvm-strfry-relay.sh logs

What it does:
  - runs a local strfry relay in Podman on ws://127.0.0.1:10549
  - uses repo-local config and database paths under .csh-runtime/

Prerequisite:
  - local image localhost/local-strfry:latest must already exist
EOF
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
}

ensure_runtime() {
  mkdir -p "${DB_DIR}"
  if [[ ! -f "${CONFIG_FILE}" ]]; then
    cat > "${CONFIG_FILE}" <<'EOF'
db = "/app/strfry-db/"

events {
    rejectEventsNewerThanSeconds = 900
    rejectEventsOlderThanSeconds = 94608000
    rejectEphemeralEventsOlderThanSeconds = 60
    ephemeralEventsLifetimeSeconds = 300
}

relay {
    bind = "0.0.0.0"
    port = 7777

    auth {
        enabled = false
        serviceUrl = ""
    }
}
EOF
  fi
}

require_image() {
  if ! podman image exists "${IMAGE_NAME}"; then
    echo "Missing image ${IMAGE_NAME}" >&2
    echo "Build it first with: podman build -t local-strfry /tmp/strfry" >&2
    exit 1
  fi
}

start_command() {
  ensure_runtime
  require_image
  podman rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  podman run -d \
    --name "${CONTAINER_NAME}" \
    -p "127.0.0.1:${HOST_PORT}:7777" \
    -v "${CONFIG_FILE}:/app/strfry.conf:ro,Z" \
    -v "${DB_DIR}:/app/strfry-db:Z" \
    "${IMAGE_NAME}" relay >/dev/null
  status_command
}

stop_command() {
  podman rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  echo "Stopped ${CONTAINER_NAME}"
}

status_command() {
  if podman ps --filter "name=${CONTAINER_NAME}" --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -q "^${CONTAINER_NAME} "; then
    echo "Relay container: running (${CONTAINER_NAME})"
    podman ps --filter "name=${CONTAINER_NAME}" --format '{{.Names}} {{.Status}} {{.Ports}}'
  else
    echo "Relay container: not running"
  fi
  echo "Relay URL: ws://127.0.0.1:${HOST_PORT}"
}

logs_command() {
  podman logs --tail 50 "${CONTAINER_NAME}"
}

main() {
  require_command podman

  local command="${1:-}"
  case "${command}" in
    start)
      shift
      start_command "$@"
      ;;
    stop)
      shift
      stop_command "$@"
      ;;
    status)
      shift
      status_command "$@"
      ;;
    logs)
      shift
      logs_command "$@"
      ;;
    --help|-h|"")
      usage
      ;;
    *)
      echo "Unknown command: ${command}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
